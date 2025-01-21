import { BaseCommand } from '../base/BaseCommand.js';
import { FlowManager } from '../../services/ai/flows/FlowManager.js';
import { timedOrderService } from '../../services/timedOrders.js';
import { User } from '../../models/User.js';
import { networkState } from '../../services/networkState.js';
import { dextools } from '../../services/dextools/index.js';
import { USER_STATES } from '../../core/constants.js';
import { format } from 'date-fns';
import { ErrorHandler } from '../../core/errors/index.js';

export class TimedOrdersCommand extends BaseCommand {
  constructor(bot, eventHandler) {
    super(bot);
    this.command = '/timedorders';
    this.description = 'Set timed orders';
    this.pattern = /^(\/timedorders|⚡ Timed Orders)$/;

    this.eventHandler = eventHandler;
    this.registerCallbacks();
    
    this.flowManager = new FlowManager();
  }

  registerCallbacks() {
    this.eventHandler.on('set_timed_order', async (query) => this.startOrderCreation(query.message.chat.id, query.from));
    this.eventHandler.on('view_active_orders', async (query) => this.showActiveOrders(query.message.chat.id, query.from));
    this.eventHandler.on('confirm_order', async (query) => this.handleOrderConfirmation(query.message.chat.id, query.from));
    this.eventHandler.on('cancel_order', async (query) => this.handleOrderCancellation(query.message.chat.id, query.from));
    this.eventHandler.on(/^order_delete_/, async (query) => {
      const orderId = query.data.replace('order_delete_', '');
      await this.confirmOrderDeletion(query.message.chat.id, orderId, query.from);
    });
    this.eventHandler.on(/^order_delete_confirm_/, async (query) => {
      const orderId = query.data.replace('order_delete_confirm_', '');
      await this.handleOrderDeletion(query.message.chat.id, orderId, query.from);
    });
  }

  async execute(msg) {
    try {
      // Check if message is natural language input
      if (msg.text && !msg.text.startsWith('/')) {
        return this.handleNaturalLanguageInput(msg);
      }
      
      // Otherwise show standard menu
      await this.showTimedOrdersMenu(msg.chat.id, msg.from);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, msg.chat.id);
    }
  }

  async handleNaturalLanguageInput(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Start flow with natural language input
      const result = await this.flowManager.startFlow(userId, 'timedOrder', {
        chatId,
        userInfo: msg.from,
        naturalLanguageInput: msg.text
      });

      // Show response or confirmation
      if (result.requiresConfirmation) {
        await this.showOrderConfirmation(chatId, result.order);
      } else {
        await this.bot.sendMessage(chatId, result.response, {
          parse_mode: 'Markdown',
          reply_markup: result.keyboard
        });
      }

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
      return false;
    }
  }

  async showTimedOrdersMenu(chatId, userInfo) {
    const keyboard = this.createKeyboard([
      [{ text: '⚡ Set Auto Swap Order', callback_data: 'set_timed_order' }],
      [{ text: '📋 View Active Orders', callback_data: 'view_active_orders' }],
      [{ text: '↩️ Back', callback_data: 'back_to_notifications' }]
    ]);

    await this.bot.sendMessage(chatId, 
      '*Timed Orders* ⚡\n\n' +
      'Schedule automatic token swaps:\n\n' +
      '• Set buy/sell orders\n' +
      '• Schedule for specific time\n' +
      '• Multi-target orders\n' +
      '• Conditional execution\n\n' +
      '_Tip: Try typing naturally like:_\n' +
      '"Buy 1 SOL of BONK tomorrow at 3pm"',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async startOrderCreation(chatId, userInfo) {
    try {
      // Validate user has autonomous wallet
      const user = await User.findOne({ telegramId: userInfo.id.toString() });
      if (!user?.settings?.autonomousWallet?.address) {
        await this.bot.sendMessage(chatId, 
          '❌ Please set up an autonomous wallet first in Settings.',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '⚙️ Go to Settings', callback_data: 'wallet_settings' }
              ]]
            }
          }
        );
        return;
      }

      // Start timed order flow
      const result = await this.flowManager.startFlow(userInfo.id, 'timedOrder', {
        chatId,
        userInfo,
        walletAddress: user.settings.autonomousWallet.address
      });

      // Create progress message
      const progressMsg = await this.bot.sendMessage(chatId, 
        '🔄 Processing your request...',
        { parse_mode: 'Markdown' }
      );

      // Listen for progress updates
      this.flowManager.on('flowProgress', async (data) => {
        if (data.userId === userInfo.id) {
          await this.updateProgressMessage(chatId, progressMsg.message_id, data);
        }
      });

      // Show initial prompt
      await this.bot.sendMessage(
        chatId,
        result.response || '*New Timed Order* ⚡\n\nPlease enter the token address:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
            ]]
          }
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async updateProgressMessage(chatId, messageId, progress) {
    try {
      const message = this.formatProgressMessage(progress);
      await this.bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.warn('Error updating progress message:', error);
    }
  }
  
  formatProgressMessage(progress) {
    const { step, totalSteps, currentStep, message, completed, error } = progress;
  
    if (error) {
      return `❌ Error: ${error}`;
    }
  
    const progressBar = this.createProgressBar(currentStep, totalSteps);
    
    return `*Processing Order*\n\n` +
           `${progressBar}\n` +
           `Step ${currentStep}/${totalSteps}: ${message}\n\n` +
           (completed ? '✅ Step completed!' : '🔄 Processing...');
  }
  
  createProgressBar(current, total) {
    const width = 10;
    const filled = Math.floor((current / total) * width);
    return '▓'.repeat(filled) + '░'.repeat(width - filled);
  }

  async handleInput(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Check if user is in a flow
      if (!this.flowManager.isInFlow(userId)) {
        return false;
      }

      // Continue the flow with user input
      const result = await this.flowManager.continueFlow(userId, msg.text);
      if (result.error) {
        await this.bot.sendMessage(chatId,
          '❌ Invalid token address or symbol. Please try again:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
              ]]
            }
          }
        );
        return true;
      }
      
      // Handle flow response
      if (result.response) {
        await this.bot.sendMessage(chatId, result.response, {
          parse_mode: 'Markdown',
          reply_markup: result.keyboard
        });
      }

      // Handle flow completion
      if (result.completed) {
        if (result.order) {
          await this.showOrderConfirmation(chatId, result.order);
        }
        return true;
      }

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
      return false;
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      // Check if callback is for flow
      if (this.flowManager.isInFlow(query.from.id)) {
        const result = await this.flowManager.handleCallback(query.from.id, action);
        if (result.handled) return;
      }

      // Handle other callbacks
      const handled = await this.eventHandler.emit(action, query);
      if (!handled) {
        console.warn(`Unhandled callback action: ${action}`);
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleOrderConfirmation(chatId, userInfo) {
    try {
      const flow = this.flowManager.getActiveFlow(userInfo.id);
      if (!flow) {
        throw new Error('No active order flow found');
      }

      // Complete the flow
      const result = await this.flowManager.continueFlow(userInfo.id, 'confirm');
      
      if (result.completed && result.order) {
        // Create the order
        await timedOrderService.createOrder(userInfo.id, result.order);
        
        await this.bot.sendMessage(chatId,
          '✅ Timed order created successfully!\n\n' +
          `Token: ${result.order.tokenSymbol}\n` +
          `Action: ${result.order.action}\n` +
          `Amount: ${result.order.amount}\n` +
          `Execute at: ${format(result.order.executeAt, 'PPpp')}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '📋 View Orders', callback_data: 'view_active_orders' },
                { text: '↩️ Back', callback_data: 'back_to_notifications' }
              ]]
            }
          }
        );
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleOrderCancellation(chatId, userInfo) {
    try {
      const flow = await this.flowManager.getActiveFlow(userInfo.id);
      if (flow) {
        await this.flowManager.cancelFlow(userInfo.id);
      }
      
      await this.showTimedOrdersMenu(chatId, userInfo);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showActiveOrders(chatId, userInfo) {
    try {
      const orders = await timedOrderService.getActiveOrders(userInfo.id);

      if (!orders || orders.length === 0) {
        await this.bot.sendMessage(chatId, 
          '*No Active Orders* 📋\n\n' +
          'You have no scheduled orders. Create one to get started!\n\n' +
          '_Tip: Try typing naturally like "Buy 1 SOL of BONK tomorrow at 3pm"_',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '➕ Create Order', callback_data: 'set_timed_order' },
                { text: '↩️ Back', callback_data: 'back_to_notifications' }
              ]]
            }
          }
        );
        return;
      }

      const ordersList = orders.map((order, index) => 
        `${index + 1}. ${order.tokenSymbol}\n` +
        `• Action: ${order.action}\n` +
        `• Amount: ${order.amount}\n` +
        `• Execute at: ${format(order.executeAt, 'PPpp')}\n`
      ).join('\n');

      const keyboard = {
        inline_keyboard: [
          ...orders.map((order, index) => [{
            text: `🗑️ Cancel Order #${index + 1}`,
            callback_data: `order_delete_${order._id}`
          }]),
          [
            { text: '➕ Create Order', callback_data: 'set_timed_order' },
            { text: '↩️ Back', callback_data: 'back_to_notifications' }
          ]
        ]
      };

      await this.bot.sendMessage(chatId,
        '*Active Orders* 📋\n\n' + ordersList,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async confirmOrderDeletion(chatId, orderId, userInfo) {
    try {
      const order = await timedOrderService.getOrder(orderId);
      if (!order || order.userId !== userInfo.id.toString()) {
        throw new Error('Order not found');
      }

      const keyboard = this.createKeyboard([
        [
          { text: '✅ Confirm Delete', callback_data: `order_delete_confirm_${orderId}` },
          { text: '❌ Cancel', callback_data: 'view_active_orders' }
        ]
      ]);

      await this.bot.sendMessage(chatId,
        '*Confirm Delete Order* ⚠️\n\n' +
        'Are you sure you want to delete this order?\n\n' +
        `Token: ${order.tokenSymbol}\n` +
        `Action: ${order.action}\n` +
        `Amount: ${order.amount}\n` +
        `Execute at: ${format(order.executeAt, 'PPpp')}`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleOrderDeletion(chatId, orderId, userInfo) {
    try {
      await timedOrderService.cancelOrder(userInfo.id, orderId);
      
      await this.bot.sendMessage(chatId,
        '✅ Order cancelled successfully!',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 View Orders', callback_data: 'view_active_orders' },
              { text: '↩️ Back', callback_data: 'back_to_notifications' }
            ]]
          }
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showOrderConfirmation(chatId, order) {
    const keyboard = this.createKeyboard([
      [
        { text: '✅ Confirm', callback_data: 'confirm_order' },
        { text: '❌ Cancel', callback_data: 'back_to_timed_orders' }
      ]
    ]);

    await this.bot.sendMessage(chatId,
      '*Confirm Timed Order* ✅\n\n' +
      `Token: ${order.tokenSymbol}\n` +
      `Action: ${order.action}\n` +
      `Amount: ${order.amount}\n` +
      `Execute at: ${format(order.executeAt, 'PPpp')}\n\n` +
      'Please confirm your order:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }
}