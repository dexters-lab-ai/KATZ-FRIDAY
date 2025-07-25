import { Markup } from "telegraf";
import { trendingService } from "../../services/trending/TrendingService.js";
import { networkState } from "../../services/networkState.js";
import { ErrorHandler } from "../../core/errors/index.js";

export class TrendingCommand {
  constructor(bot) {
    this.bot = bot;
    this.command = "/trending";
    this.description = "Dextools & Dexscreener Trending Tokens";
    this.pattern = /^(\/trending|🔥 Trending Tokens)$/;
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    try {
      await this.fetchAndDisplayTrending(chatId);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async fetchAndDisplayTrending(chatId) {
    const currentNetwork = await networkState.getCurrentNetwork(chatId);
    const loadingMsg = await this.showLoadingMessage(
      chatId,
      `😼 Fetching trending tokens on ${networkState.getNetworkDisplay(currentNetwork)}`
    );

    try {
      await this.simulateTyping(chatId);

      // Fetch trending and boosted tokens
      const [trendingTokens, boostedTokens] = await Promise.all([
        trendingService.getTrendingTokens(currentNetwork),
        trendingService.getBoostedTokens(),
      ]);

      // Delete the loading message
      if (loadingMsg) await this.safeDeleteMessage(chatId, loadingMsg.message_id);

      const trendingKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh", "refresh_trending")],
        [Markup.button.callback("🌐 Switch Network", "switch_network")],
        [Markup.button.callback("🚀 Show Boosted", "trending_boosted")],
        [Markup.button.callback("🏠 Main Menu", "back_to_menu")],
      ]);

      // Display trending tokens
      await this.displayTokens(
        chatId,
        trendingTokens,
        `🔥 Trending Tokens on ${networkState.getNetworkDisplay(currentNetwork)}`,
        trendingKeyboard
      );

      // Separator
      await this.bot.telegram.sendMessage(chatId, "––––––––––––––––––––––", {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      const boostedKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh", "trending_boosted")],
        [Markup.button.callback("↩️ Back", "back_to_trending")],
      ]);

      // Display boosted tokens
      await this.displayTokens(chatId, boostedTokens, "🚀 Boosted Tokens", boostedKeyboard);
    } catch (error) {
      if (loadingMsg) await this.safeDeleteMessage(chatId, loadingMsg.message_id);
      throw error;
    }
  }

  async displayTokens(chatId, tokens, header, keyboard) {
    if (!tokens || tokens.length === 0) {
      await this.bot.telegram.sendMessage(chatId, `${header}\n\nNo tokens found.`, {
        parse_mode: "Markdown",
      });
      return;
    }

    // Display header
    await this.bot.telegram.sendMessage(chatId, `*${header}*`, {
      parse_mode: "Markdown",
    });

    // Iterate through tokens and use `generateTelegramMessage`
    for (const token of tokens) {
      const { message, buttons, images } = token;

      // Send rich media message
      if (images?.length) {
        const media = images.map((image, index) => ({
          type: "photo",
          media: image,
          caption: index === images.length - 1 ? message : undefined,
          parse_mode: "Markdown",
        }));

        try {
          await this.bot.telegram.sendMediaGroup(chatId, media);
        } catch (error) {
          console.error("Error sending media group:", error);
        }
      } else {
        // Fallback if no images are available
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: "Markdown",
        });
      }

      // Add buttons if available
      if (buttons?.length) {
        const linksKeyboard = Markup.inlineKeyboard(
          buttons.map((btn) => [Markup.button.url(btn.text, btn.url)])
        );

        await this.bot.telegram.sendMessage(chatId, "🔗 Links:", linksKeyboard);
      }
    }

    // Display navigation keyboard
    await this.bot.telegram.sendMessage(chatId, "📋 Options:", keyboard);
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;

    try {
      switch (action) {
        case "refresh_trending":
          await this.fetchAndDisplayTrending(chatId);
          break;
        case "trending_boosted":
          await this.showBoostedTokens(chatId);
          break;
        case "back_to_trending":
          await this.fetchAndDisplayTrending(chatId);
          break;
        default:
          console.warn(`Unhandled callback action: ${action}`);
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async showBoostedTokens(chatId) {
    try {
      const boostedTokens = await trendingService.getBoostedTokens();

      const boostedKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Refresh", "trending_boosted")],
        [Markup.button.callback("↩️ Back", "back_to_trending")],
      ]);

      // Display boosted tokens
      await this.displayTokens(chatId, boostedTokens, "🚀 Boosted Tokens", boostedKeyboard);
    } catch (error) {
      throw error;
    }
  }

  async safeDeleteMessage(chatId, messageId) {
    try {
      await this.bot.telegram.deleteMessage(chatId, messageId);
    } catch (error) {
      if (error.response?.body?.description?.includes("message to delete not found")) {
        console.warn(`Message ${messageId} not found; skipping deletion.`);
      } else {
        console.error(`Error deleting message ${messageId}:`, error);
      }
    }
  }

  async showLoadingMessage(chatId, message) {
    return this.bot.telegram.sendMessage(chatId, message);
  }

  async simulateTyping(chatId) {
    return this.bot.telegram.sendChatAction(chatId, "typing");
  }
}
