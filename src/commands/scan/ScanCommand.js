import { Markup } from "telegraf";
import { BaseCommand } from "../base/BaseCommand.js";
import { ScanHandler } from "./handlers/ScanHandler.js";
import { networkState } from "../../services/networkState.js";
import { tokenInfoService } from "../../services/tokens/TokenInfoService.js";
import { USER_STATES } from "../../core/constants.js";
import { ErrorHandler } from "../../core/errors/index.js";

export class ScanCommand extends BaseCommand {
  constructor(bot, eventHandler) {
    super(bot);
    this.command = "/scan";
    this.description = "Scan token details";
    this.pattern = /^(\/scan|🔍 Scan Token)$/;

    this.scanHandler = new ScanHandler(bot);
    this.eventHandler = eventHandler;
    this.registerCallbacks();
  }

  registerCallbacks() {
    this.eventHandler.on("scan_input", async (ctx) => this.handleScanInput(ctx));
    this.eventHandler.on("retry_scan", async (ctx) => this.retryScan(ctx));
  }

  async execute(ctx) {
    const chatId = ctx.chat.id;
    try {
      // Handle natural language input
      if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
        return await this.handleNaturalLanguageInput(ctx);
      }
      await this.showScanOptions(ctx);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleNaturalLanguageInput(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    try {
      // Extract token from natural language input
      const tokenMatch = ctx.message.text.match(/scan\s+([a-zA-Z0-9]+)/i);
      if (!tokenMatch) return false;

      const tokenInput = tokenMatch[1];
      const network = await networkState.getCurrentNetwork(userId);

      // Validate token
      const tokenInfo = await tokenInfoService.validateToken(network, tokenInput);
      if (!tokenInfo) {
        await this.bot.telegram.sendMessage(
          chatId,
          "I couldn't find that token. Please provide the token address:",
          {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("❌ Cancel", "back_to_menu")],
            ]),
          }
        );
        return true;
      }

      // Perform token scan
      await this.scanHandler.handleTokenScan(chatId, tokenInfo.address, ctx.from);
      return true;
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
      return false;
    }
  }

  async showScanOptions(ctx) {
    const chatId = ctx.chat.id;
    try {
      const currentNetwork = await networkState.getCurrentNetwork(chatId);

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📝 Enter Token Address", "scan_input")],
        [Markup.button.callback("🔄 Switch Network", "switch_network")],
        [Markup.button.callback("↩️ Back to Menu", "back_to_menu")],
      ]);

      await this.bot.telegram.sendMessage(
        chatId,
        `*Token Scanner* 🔍\n\n` +
          `Current Network: *${networkState.getNetworkDisplay(currentNetwork)}*\n\n` +
          "Analyze any token with detailed metrics:\n\n" +
          "• Price & Volume\n" +
          "• LP Value & Distribution\n" +
          "• Security Score & Risks\n" +
          "• Social Links & Info\n\n" +
          "Enter a token address or try natural language like:\n" +
          '"scan PEPE" or "analyze BONK"',
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleScanInput(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    try {
      await this.setState(userId, USER_STATES.WAITING_SCAN_INPUT);

      await this.bot.telegram.sendMessage(
        chatId,
        "*Token Address* 📝\n\n" +
          "Please enter the token contract address you want to scan:",
        {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", "back_to_menu")],
          ]),
        }
      );
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleCallback(ctx) {
    const action = ctx.callbackQuery.data;

    try {
      const handled = await this.eventHandler.emit(action, ctx);
      if (!handled) {
        console.warn(`Unhandled callback action: ${action}`);
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, ctx.chat.id);
    }
  }

  async retryScan(ctx) {
    const chatId = ctx.chat.id;
    try {
      await this.showScanOptions(ctx);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handleInput(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const state = await this.getState(userId);

    if (state === USER_STATES.WAITING_SCAN_INPUT && ctx.message.text) {
      try {
        const network = await networkState.getCurrentNetwork(userId);
        const tokenInfo = await tokenInfoService.validateToken(network, ctx.message.text.trim());

        if (!tokenInfo) {
          await this.bot.telegram.sendMessage(
            chatId,
            "❌ Invalid token address or symbol. Please try again:",
            {
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback("❌ Cancel", "back_to_menu")],
              ]),
            }
          );
          return true;
        }

        await this.scanHandler.handleTokenScan(chatId, tokenInfo.address, ctx.from);
        await this.clearState(userId);
        return true;
      } catch (error) {
        await ErrorHandler.handle(error, this.bot, chatId);
      }
    }

    return false;
  }
}
