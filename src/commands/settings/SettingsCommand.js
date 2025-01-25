import { Markup } from "telegraf";
import { User } from "../../models/User.js";
import { networkState } from "../../services/networkState.js";
import { USER_STATES } from "../../core/constants.js";
import { ErrorHandler } from "../../core/errors/index.js";

export class SettingsCommand {
  constructor(bot) {
    this.bot = bot;
    this.command = "/settings";
    this.description = "Configure bot settings";
    this.pattern = /^(\/settings|⚙️ Settings)$/;

    // Callback action handlers
    this.callbackHandlers = new Map([
      ["slippage_settings", this.showSlippageSettings.bind(this)],
      ["notification_settings", this.showNotificationSettings.bind(this)],
      ["toggle_notifications", this.toggleNotifications.bind(this)],
      ["switch_network", this.showSwitchNetwork.bind(this)],
      ["back_to_settings", this.showSettingsMenu.bind(this)],
      ["adjust_eth_slippage", (ctx) => this.showSlippageInput(ctx, "ethereum")],
      ["adjust_base_slippage", (ctx) => this.showSlippageInput(ctx, "base")],
      ["adjust_sol_slippage", (ctx) => this.showSlippageInput(ctx, "solana")],
      ["autonomous_settings", this.showAutonomousSettings.bind(this)],
      ["toggle_autonomous", this.toggleAutonomousTrading.bind(this)],
      ["butler_assistant", this.showButlerSettings.bind(this)],
      ["toggle_butler", this.toggleButlerAssistant.bind(this)],
    ]);
  }

  /** Main command execution */
  async execute(ctx) {
    const chatId = ctx.chat.id;
    try {
      await this.showSettingsMenu(ctx, ctx.from);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  /** Dispatch callback queries */
  async handleCallbackQuery(ctx) {
    const action = ctx.callbackQuery.data;
    const handler = this.callbackHandlers.get(action);

    if (handler) {
      try {
        await handler(ctx);
      } catch (error) {
        console.error(`❌ Error handling callback "${action}":`, error.message);
        await ErrorHandler.handle(error, this.bot, ctx.chat.id);
      }
    } else {
      console.warn(`⚠️ No handler found for callback action: ${action}`);
    }
  }

  /** Show main settings menu */
  async showSettingsMenu(ctx, userInfo) {
    try {
      const user = await User.findOne({ telegramId: userInfo.id.toString() }).lean();
      const currentNetwork = await networkState.getCurrentNetwork(userInfo.id);

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Switch Network", "switch_network")],
        [Markup.button.callback("⚙️ Slippage Settings", "slippage_settings")],
        [Markup.button.callback("🤖 Autonomous Trading", "autonomous_settings")],
        [Markup.button.callback("🔔 Notification Settings", "notification_settings")],
        [Markup.button.callback("🫅 Butler Assistant", "butler_assistant")],
        [Markup.button.callback("↩️ Back to Menu", "back_to_wallets")],
      ]);

      await ctx.reply(
        `*Settings* ⚙️\n\n` +
          `Current Network: *${networkState.getNetworkDisplay(currentNetwork)}*\n` +
          `Slippage: ${user?.settings?.trading?.slippage?.[currentNetwork]}%\n` +
          `Autonomous Trading: ${
            user?.settings?.trading?.autonomousEnabled ? "✅ Enabled" : "❌ Disabled"
          }\n` +
          `Notifications: ${user?.settings?.notifications?.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `Butler: ${user?.settings?.butler?.enabled ? "✅ Enabled" : "❌ Disabled"}\n\n` +
          `Configure your preferences:`,
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Show slippage settings menu */
  async showSlippageSettings(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const slippage = user?.settings?.trading?.slippage || { ethereum: 3, base: 3, solana: 3 };

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`ETH (${slippage.ethereum}%)`, "adjust_eth_slippage")],
        [Markup.button.callback(`Base (${slippage.base}%)`, "adjust_base_slippage")],
        [Markup.button.callback(`Solana (${slippage.solana}%)`, "adjust_sol_slippage")],
        [Markup.button.callback("↩️ Back", "back_to_settings")],
      ]);

      await ctx.reply(
        "*Slippage Settings* ⚙️\n\nAdjust slippage tolerance for trading.",
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Show slippage input prompt */
  async showSlippageInput(ctx, network) {
    try {
      await this.setState(ctx.from.id, USER_STATES.WAITING_SLIPPAGE_INPUT);
      await this.setUserData(ctx.from.id, { pendingSlippage: { network } });

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("❌ Cancel", "slippage_settings")],
      ]);

      await ctx.reply(
        `*Enter New Slippage for ${network.toUpperCase()}* ⚙️\n\nEnter a number between 0.1 and 50.`,
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Show autonomous trading settings */
  async showAutonomousSettings(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const isEnabled = user?.settings?.trading?.autonomousEnabled;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isEnabled ? "🔴 Disable Autonomous Trading" : "🟢 Enable Autonomous Trading",
            "toggle_autonomous"
          ),
        ],
        [Markup.button.callback("↩️ Back", "back_to_settings")],
      ]);

      await ctx.reply(
        `*Autonomous Trading Settings* 🤖\n\nCurrent Status: ${
          isEnabled ? "✅ Enabled" : "❌ Disabled"
        }`,
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Toggle autonomous trading */
  async toggleAutonomousTrading(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const newState = !user?.settings?.trading?.autonomousEnabled;

      await User.updateOne(
        { telegramId: ctx.from.id.toString() },
        { $set: { "settings.trading.autonomousEnabled": newState } }
      );

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Back", "autonomous_settings")],
      ]);

      await ctx.reply(
        `✅ Autonomous Trading ${newState ? "enabled" : "disabled"} successfully.`,
        { ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Notification settings */
  async showNotificationSettings(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const notificationsEnabled = user?.settings?.notifications?.enabled || false;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            notificationsEnabled ? "🔕 Disable Notifications" : "🔔 Enable Notifications",
            "toggle_notifications"
          ),
        ],
        [Markup.button.callback("↩️ Back", "back_to_settings")],
      ]);

      await ctx.reply(
        `*Notification Settings* 🔔\n\nCurrent Status: ${
          notificationsEnabled ? "✅ Enabled" : "❌ Disabled"
        }`,
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Toggle notifications */
  async toggleNotifications(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const newState = !user?.settings?.notifications?.enabled;

      await User.updateOne(
        { telegramId: ctx.from.id.toString() },
        { $set: { "settings.notifications.enabled": newState } }
      );

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Back", "notification_settings")],
      ]);

      await ctx.reply(
        `✅ Notifications have been *${newState ? "enabled" : "disabled"}*.`,
        { ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Butler assistant settings */
  async showButlerSettings(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() });
      const isEnabled = user?.settings?.butler?.enabled || false;
      const isConnected = !!user?.googleAuth?.accessToken;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isEnabled ? "🔴 Disable Butler" : "🟢 Enable Butler",
            "toggle_butler"
          ),
        ],
        [
          Markup.button.callback(
            isConnected ? "🔄 Reconnect Google" : "🔗 Connect Google",
            "connect_google"
          ),
        ],
        [Markup.button.callback("↩️ Back", "back_to_settings")],
      ]);

      await ctx.reply(
        `*Butler Assistant Settings* 🫅\n\n` +
          `Status: ${isEnabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `Google Account: ${isConnected ? "✅ Connected" : "❌ Not Connected"}\n\n` +
          `Butler can:\n` +
          `• Set reminders and calendar events\n` +
          `• Monitor and send emails\n` +
          `• Generate activity reports`,
        { parse_mode: "Markdown", ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Toggle butler assistant */
  async toggleButlerAssistant(ctx) {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id.toString() }).lean();
      const newState = !user?.settings?.butler?.enabled;

      await User.updateOne(
        { telegramId: ctx.from.id.toString() },
        { $set: { "settings.butler.enabled": newState } }
      );

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("↩️ Back", "back_to_settings")],
      ]);

      await ctx.reply(
        `✅ Butler Assistant has been *${newState ? "enabled" : "disabled"}*.`,
        { ...keyboard }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  /** Show network switch menu */
  async showSwitchNetwork(ctx) {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("Ethereum", "switch_network_ethereum")],
      [Markup.button.callback("Base", "switch_network_base")],
      [Markup.button.callback("Solana", "switch_network_solana")],
      [Markup.button.callback("↩️ Back", "back_to_settings")],
    ]);

    await ctx.reply(
      `*Switch Network* 🔄\n\nChoose your preferred network.`,
      { parse_mode: "Markdown", ...keyboard }
    );
  }
}
