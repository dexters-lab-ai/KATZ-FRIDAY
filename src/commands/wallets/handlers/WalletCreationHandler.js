import { ErrorHandler } from '../../../core/errors/index.js';
import { walletService } from '../../../services/wallet/index.js';
import { networkState } from '../../../services/networkState.js';
import { Markup } from 'telegraf';

export class WalletCreationHandler {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * Show network selection menu
   */
  async showNetworkSelection(chatId, userInfo) {
    try {
      const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);
      const networks = ['ethereum', 'base', 'solana'];

      // Build inline keyboard for network selection
      const keyboard = Markup.inlineKeyboard([
        ...networks.map((network) =>
          Markup.button.callback(
            network === currentNetwork
              ? `${networkState.getNetworkDisplay(network)} ✓`
              : networkState.getNetworkDisplay(network),
            `select_network_${network}`
          )
        ),
        [Markup.button.callback('↩️ Back', 'back_to_wallets')],
      ]);

      // Send network selection message
      await this.bot.telegram.sendMessage(
        chatId,
        '*Select Network* 🌐\n\nChoose the network for your new wallet:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );

      return true;
    } catch (error) {
      console.error('Error showing network selection:', error);
      await ErrorHandler.handle(error, this.bot, chatId);
      return false;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(chatId, userInfo, network, showLoadingMessage) {
    const loadingMsg = await showLoadingMessage(chatId, '🔐 Creating your wallet...');

    try {
      // Create a new wallet using the wallet service
      const wallet = await walletService.createWallet(userInfo.id, network);

      // Remove loading message
      await this.bot.telegram.deleteMessage(chatId, loadingMsg.message_id);

      // Success message with navigation options
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('👛 View Wallets', 'view_wallets'),
          Markup.button.callback('↩️ Back', 'back_to_wallets'),
        ],
      ]);

      await this.bot.telegram.sendMessage(
        chatId,
        `✅ Wallet created successfully!\n\n` +
          `*Network:* ${networkState.getNetworkDisplay(network)}\n` +
          `*Address:* \`${wallet.address}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );

      return true;
    } catch (error) {
      console.error('Error creating wallet:', error);

      if (loadingMsg) {
        await this.bot.telegram.deleteMessage(chatId, loadingMsg.message_id);
      }

      // Handle error gracefully with retry option
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🔄 Retry', `select_network_${network}`),
          Markup.button.callback('↩️ Back', 'back_to_wallets'),
        ],
      ]);

      await this.bot.telegram.sendMessage(
        chatId,
        '❌ Failed to create wallet. Please try again.',
        {
          reply_markup: keyboard,
        }
      );

      return false;
    }
  }
}
