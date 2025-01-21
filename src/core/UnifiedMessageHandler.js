import { EventEmitter } from "events";
import { ErrorHandler } from "./errors/index.js";
import { rateLimiter } from "./rate-limiting/RateLimiter.js";
import { circuitBreakers } from "./circuit-breaker/index.js";
import { UnifiedAutonomousProcessor } from "../services/ai/processors/UnifiedAutonomousEngine.js";
import { contextManager } from "../services/ai/ContextManager.js";
import { voiceService } from "../services/audio/voiceService.js";

export class UnifiedMessageHandler extends EventEmitter {
  constructor(bot, commandRegistry) {
    super();
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.initialized = false;
    this.processedCallbacks = new Set();
    this.contextManager = contextManager;
    this.autonomousProcessor = new UnifiedAutonomousProcessor(bot);
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Message handling
      this.bot.on("message", async (msg) => {
        await circuitBreakers.executeWithBreaker("messages", async () => {
          const isLimited = await rateLimiter.isRateLimited(msg.from.id, "message");
          if (isLimited) {
            await this.bot.sendMessage(msg.chat.id, "⚠️ Please slow down! Try again in a minute.");
            return;
          }
          await this.handleMessage(msg);
        });
      });

      // Callback handling
      this.bot.on("callback_query", async (query) => {
        const callbackId = `${query.from.id}:${query.data}:${Date.now()}`;
        if (this.processedCallbacks.has(callbackId)) return;

        this.processedCallbacks.add(callbackId);
        await this.handleCallback(query);

        setTimeout(() => this.processedCallbacks.delete(callbackId), 5000); // Cleanup old callbacks
      });

      this.initialized = true;
      console.log("✅ UnifiedMessageHandler initialized");
    } catch (error) {
      console.error("❌ Error during UnifiedMessageHandler initialization:", error);
      throw error;
    }
  }

  async handleMessage(msg) {
    try {
      let userInput = msg.text;

      // Handle voice messages
      if (msg.voice) {
        const fileId = msg.voice.file_id;
        const fileUrl = await this.bot.getFileLink(fileId);
        userInput = await voiceService.transcribeVoice(fileUrl); // Transcribe the voice message
        console.log("🎙️ Transcribed Input:", userInput);
      }

      if (!userInput) return;

      // Check for command matches
      const command = this.commandRegistry.findCommand(userInput);
      if (command) {
        await command.execute(msg);
        return;
      }

      // Notify the user that processing has started
      const processingMessage = await this.bot.sendMessage(
        msg.chat.id,
        `🚀 *KATZ! is processing, please wait...*`,
        { parse_mode: "Markdown" }
      );

      // Process the message through the autonomous processor      
      const result = await this.autonomousProcessor.processMessage(msg, msg.from.id);

      // Notify user of processing completion
      await this.bot.editMessageText("✅ Processing complete!", {
        chat_id: msg.chat.id,
        message_id: processingMessage.message_id,
      });

      // Send the final result as a text message
      await this.bot.sendMessage(msg.chat.id, result.text, { parse_mode: "Markdown" });

      // Synthesize and send voice response only for valid responses
      /*
      if (result.text && result.text.trim()) {
        try {
          const voiceResponse = await voiceService.synthesizeSpeech(result.text);
          await this.bot.sendVoice(msg.chat.id, voiceResponse);
        } catch (error) {
          console.error("❌ Error synthesizing voice response:", error.message);
        }
      }
        */

      // Update Context
      await this.contextManager.updateContext(msg.from.id, msg, result.text);

    } catch (error) {
      console.error("❌ Error in handleMessage:", {
        message: error.message,
        stack: error.stack,
        rawError: error,
      });
      // Handle any errors gracefully and notify the user
      await this.bot.sendMessage(
        msg.chat.id,
        `❌ *An error occurred:* ${error.message}`,
        { parse_mode: "Markdown" }
      );
      console.error("Error in handleMessage:", error.message);
    }
  }

  async handleCallback(query) {
    try {
      const handled = await this.commandRegistry.handleCallback(query);

      if (handled) {
        await this.bot.answerCallbackQuery(query.id);
      } else {
        console.warn("⚠️ Unhandled callback:", query.data);
        await this.bot.answerCallbackQuery(query.id, {
          text: "⚠️ Action not recognized.",
          show_alert: false,
        });
      }
    } catch (error) {
      await this.bot.answerCallbackQuery(query.id, {
        text: "❌ An error occurred",
        show_alert: false,
      });
      await ErrorHandler.handle(error, this.bot, query.message?.chat?.id);
    }
  }

  cleanup() {
    this.bot.removeAllListeners();
    this.removeAllListeners();
    this.processedCallbacks.clear();
    this.contextManager.cleanup();
    this.initialized = false;
  }
}
