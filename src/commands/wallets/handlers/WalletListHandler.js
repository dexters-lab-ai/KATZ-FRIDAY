import { User } from '../../../models/User.js';
import { walletService } from '../../../services/wallet/index.js';
import { ErrorHandler } from '../../../core/errors/index.js';
import { networkState } from '../../../services/networkState.js';
import { Markup } from 'telegraf';

export class SettingsHandler {
  constructor(bot) {
    this.bot = bot;
  }

  async showWalletList(ctx, userInfo) {
    const loadingMsg = await ctx.reply('👛 Loading wallets...');

    try {
      const wallets = await walletService.getWallets(userInfo.id);

      if (!wallets || wallets.length === 0) {
        await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
        return this.showEmptyWalletMessage(ctx);
      }

      // Group wallets by network
      const walletsByNetwork = wallets.reduce((acc, wallet) => {
        if (!acc[wallet.network]) acc[wallet.network] = [];
        acc[wallet.network].push(wallet);
        return acc;
      }, {});

      // Construct inline keyboard
      const keyboard = Object.entries(walletsByNetwork).flatMap(([network, networkWallets]) => [
        [Markup.button.callback(`🌐 ${networkState.getNetworkDisplay(network)}`, 'noop')],
        ...networkWallets.map((wallet) => [
          Markup.button.callback(
            `${wallet.type === 'walletconnect' ? '🔗' : '👛'} ${this.formatWalletAddress(wallet.address)}`,
            `wallet_${wallet.address}`
          ),
        ]),
      ]);

      keyboard.push([Markup.button.callback('↩️ Back', 'back_to_wallets')]);

      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      await ctx.reply(
        '*Your Wallets* 👛\n\nSelect a wallet to view details:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(keyboard),
        }
      );

      return true;
    } catch (error) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  async showSettings(ctx, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() });
      const isAutonomousEnabled = user?.settings?.trading?.autonomousEnabled;

      await ctx.reply(
        '*Wallet Settings* ⚙️\n\n' +
          `Autonomous Trading: ${isAutonomousEnabled ? '✅' : '❌'}\n\n` +
          'Configure your wallet settings:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback(
                `${isAutonomousEnabled ? '🔴 Disable' : '🟢 Enable'} Autonomous Trading`,
                'toggle_autonomous'
              ),
            ],
            [Markup.button.callback('⚙️ Adjust Slippage', 'slippage_settings')],
            [Markup.button.callback('↩️ Back', 'back_to_wallets')],
          ]),
        }
      );

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  async showSlippageSettings(ctx, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() });
      const slippage = user?.settings?.trading?.slippage || {
        ethereum: 3,
        base: 3,
        solana: 3,
      };

      await ctx.reply(
        '*Slippage Settings* ⚙️\n\n' +
          'Current slippage tolerance:\n\n' +
          `• Ethereum: ${slippage.ethereum}%\n` +
          `• Base: ${slippage.base}%\n` +
          `• Solana: ${slippage.solana}%\n\n` +
          'Select a network to adjust:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback(`ETH (${slippage.ethereum}%)`, 'adjust_eth_slippage')],
            [Markup.button.callback(`Base (${slippage.base}%)`, 'adjust_base_slippage')],
            [Markup.button.callback(`Solana (${slippage.solana}%)`, 'adjust_sol_slippage')],
            [Markup.button.callback('↩️ Back', 'wallet_settings')],
          ]),
        }
      );

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  async updateSlippage(ctx, userInfo, network, value) {
    try {
      const slippage = parseFloat(value);
      if (isNaN(slippage) || slippage < 0.1 || slippage > 50) {
        throw new Error('Invalid slippage value. Must be between 0.1 and 50.');
      }

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        { $set: { [`settings.trading.slippage.${network}`]: slippage } }
      );

      await ctx.reply(
        `✅ Slippage for ${network} updated to ${slippage}%`,
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back to Settings', 'slippage_settings')],
          ]),
        }
      );

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  async toggleAutonomous(ctx, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() });
      const newState = !user?.settings?.trading?.autonomousEnabled;

      await User.updateOne(
        { telegramId: userInfo.id.toString() },
        { $set: { 'settings.trading.autonomousEnabled': newState } }
      );

      await ctx.reply(
        `✅ Autonomous trading ${newState ? 'enabled' : 'disabled'} successfully!`,
        {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back', 'wallet_settings')],
          ]),
        }
      );

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  async handleSlippageAdjustment(ctx, network) {
    try {
      const userId = ctx.from.id;
      await ctx.reply(
        '*Enter New Slippage* ⚙️\n\n' + 'Enter a number between 0.1 and 50:',
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'slippage_settings')],
          ]),
        }
      );

      return true;
    } catch (error) {
      await ErrorHandler.handle(error, ctx, ctx.chat.id);
      return false;
    }
  }

  formatWalletAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async showEmptyWalletMessage(ctx) {
    await ctx.reply(
      `No wallets found. Create one first!`,
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('➕ Create Wallet', 'create_wallet')],
          [Markup.button.callback('🌐 Switch Network', 'switch_network')],
          [Markup.button.callback('↩️ Back', 'back_to_wallets')],
        ]),
      }
    );

    return true;
  }
}
