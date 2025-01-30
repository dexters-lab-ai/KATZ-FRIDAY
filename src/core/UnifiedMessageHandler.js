import { EventEmitter } from "events";
import { ErrorHandler } from "./errors/index.js";
import { rateLimiter } from "./rate-limiting/RateLimiter.js";
import { circuitBreakers } from "./circuit-breaker/index.js";
import { UnifiedAutonomousProcessor } from "../services/ai/processors/UnifiedAutonomousEngine.js";
import { contextManager } from "../services/ai/ContextManager.js";
import { voiceService } from "../services/audio/voiceService.js"; //Has both spee to T & T to spee

export class UnifiedMessageHandler extends EventEmitter {
  constructor(bot, commandRegistry) {
    super();
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.initialized = false;
    this.processedCallbacks = new Set();
    this.contextManager = contextManager;
    this.autonomousProcessor = new UnifiedAutonomousProcessor(bot);

    // Track the "processing" animation + "too long" message
    this.currentAnimationMsgId = null;
    this.tooLongMsgId = null;
  }

  async initialize() {
    if (this.initialized) return;
    try {
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

      this.bot.on("callback_query", async (query) => {
        const callbackId = `${query.from.id}:${query.data}:${Date.now()}`;
        if (this.processedCallbacks.has(callbackId)) return;

        this.processedCallbacks.add(callbackId);
        await this.handleCallback(query);
        setTimeout(() => this.processedCallbacks.delete(callbackId), 5000);
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
      let isVoiceInput = false;

      // Handle voice messages
      if (msg.voice) {
        const fileId = msg.voice.file_id;
        const fileUrl = await this.bot.getFileLink(fileId);

        try {
          userInput = await voiceService.transcribeVoiceWhisp(fileUrl); // Transcribe voice using Whisper
          console.log("🎙️ Transcribed voice input:", userInput);
          isVoiceInput = true;
        } catch (transcriptionError) {
          console.error("❌ Voice transcription failed:", transcriptionError.message);
          await this.bot.sendMessage(
            msg.chat.id,
            "⚠️ Sorry, I couldn't understand the voice message. Please try again."
          );
          return; // Exit on failure to transcribe
        }
      }

      if (!userInput) return;

      // Handle commands
      const command = this.commandRegistry.findCommand(userInput);
      if (command) {
        await command.execute(msg);
        return;
      }

      const chatId = msg.chat.id;
      await this.sendProcessingAtBottom(chatId, "🧞‍♂️ summoning your request...");

      let keepTyping = true;
      const typingInterval = setInterval(() => {
        if (!keepTyping) return;
        this.bot.sendChatAction(chatId, "typing").catch(() => {});
      }, 4000);

      const tooLongTimer = setTimeout(async () => {
        if (keepTyping) {
          const msgLong = await this.bot.sendMessage(chatId, "🧞‍♂️ this is taking longer than usual...");
          this.tooLongMsgId = msgLong.message_id;
          await this.sendProcessingAtBottom(chatId, "🧞‍♂️ (still working) thanks for your patience...");
        }
      }, 10000);

      let result;
      try {
        result = await this.autonomousProcessor.processMessage(msg, msg.from.id);
      } catch (err) {
        console.error("❌ Error in autonomousProcessor:", err);
        result = { text: `❌ Something went wrong: ${err.message}` };
      }

      keepTyping = false;
      clearInterval(typingInterval);
      clearTimeout(tooLongTimer);

      if (this.currentAnimationMsgId) {
        try {
          await this.bot.deleteMessage(chatId, this.currentAnimationMsgId);
        } catch (delErr) {
          console.warn("Could not delete bottom animation:", delErr.message);
        }
        this.currentAnimationMsgId = null;
      }

      if (this.tooLongMsgId) {
        try {
          await this.bot.deleteMessage(chatId, this.tooLongMsgId);
        } catch (errDel) {
          console.warn("Could not delete 'too long' message:", errDel.message);
        }
        this.tooLongMsgId = null;
      }

      const finalText = result?.text?.trim() || "⚠️ Unable to process your request.";
      await this.sendMessageWithLimit(chatId, finalText, "HTML");

      if (isVoiceInput && finalText.length > 5) {
        try {
          const audioBuffer = await voiceService.synthesizeSpeech(finalText);
          await this.bot.sendAudio(chatId, audioBuffer, {}, {
            filename: "response.mp3",
            contentType: "audio/mpeg"
          });
        } catch (ttsErr) {
          console.error("TTS generation error:", ttsErr.message);
          await this.bot.sendMessage(chatId, "⚠️ Could not generate audio for response.");
        }
      }

      await this.contextManager.updateContext(msg.from.id, msg, finalText);
    } catch (error) {
      console.error("❌ Error in handleMessage:", error);
      await this.sendMessageWithLimit(msg.chat.id, `❌ *An error occurred:* ${error.message}`, "Markdown");
    }
  }

  /**
   * handleCallback for inline keyboards
   */
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

  /**
   * Re-send a random "genie" animation at the bottom, storing its msg_id
   */
  async sendProcessingAtBottom(chatId, captionText) {
    // Delete old if it exists
    if (this.currentAnimationMsgId) {
      try {
        await this.bot.deleteMessage(chatId, this.currentAnimationMsgId);
      } catch (err) {
        console.warn("Couldn't delete old bottom animation:", err.message);
      }
      this.currentAnimationMsgId = null;
    }

    // For random animations or stickers
    const randomAnimations = [
      /*
      "CAACAgIAAxkBAAIpYmeWMc5f0mASiMolt9vhI0D05GtFAAI9BwACGELuCHwIDgGiZmg6NgQ",
      "CAACAgIAAxkBAAIpY2eWMhmYaPHrrDhtScuaV1Oe-9bcAAJCBwACGELuCKi5pzyd4ruYNgQ",
      "CAACAgIAAxkBAAIpZGeWMmK8Ih50wT6ATCMut4yEVLkxAAJbBwACGELuCBoK6jLf-wNFNgQ",
      */
      "CAACAgIAAxkBAAIpZWeWMwABJmPIQ3AmSdQ4WOkL_K0OgAACZAIAAsoDBgsBgU7S7-nk3TYE",
      "CAACAgIAAxkBAAIpZmeWMzcTMjQmBs0FtAjPJvHSQ0doAAI4AwACtXHaBsLy3lrP6g0VNgQ",
      "CAACAgIAAxkBAAIpZ2eWM0JovBCkVMIznqVA5gZoFo5jAAKnEQACwBmZSK-wuYHOLHjHNgQ",
      /*
      "CAACAgIAAxkBAAIpaGeWM51SNjOXZP3HoD6m6y7BtBw0AAJUBwACGELuCCGsU4lR3bN0NgQ",
      "CAACAgIAAxkBAAIpaWeWNUFh5DLz0MpjlzS6e7jK34apAALfAAMw1J0REW2Q6CUm5302BA",
      "CAACAgIAAxkBAAIpameWNY2EszAyYu8F8HCaeoyTef1hAAJeBwACGELuCIMXZkyZkKN_NgQ",
      */
      "CAACAgIAAxkBAAIpc2eWfcRPbLoFWD0eIlcxlnU-n_TlAALUEQADwKBJeScB4o8r9Aw2BA",
      "CAACAgIAAxkBAAIpdGeWfhNo-JPjFD7YcQFWlVZ6D1ojAAJiFQACIqPBSfvS-zntbkh-NgQ",
      "CAACAgIAAxkBAAIpdWeWfiwbmEwdAuoS4TKMlrvkz6EkAAKEAANEDc8XWsrYRJs5QO42BA",
      "CAACAgIAAxkBAAIpdmeWflpXi57EicNEhDfGPIbXImlOAAJpGwACw5RZSkeuZ_mZmncSNgQ",
      "CAACAgIAAxkBAAIpd2eWfnGlcgVCmKea-0YQarloWLjcAAJwAAPb234AAeoAAbe3Jpg43TYE",
      "CAACAgIAAxkBAAIpeWeWf6Zx-yts9XVzs0BlPuD0ncctAAIUEAACRd7YS4GzdytDqYx1NgQ"
    ];

    const randomIndex = Math.floor(Math.random() * randomAnimations.length);
    const chosenUrl = randomAnimations[randomIndex];

    try {
      const animMsg = await this.bot.sendAnimation(chatId, chosenUrl, {
        caption: captionText,
        parse_mode: "HTML"
      });
      this.currentAnimationMsgId = animMsg.message_id;
      return animMsg;
    } catch (err) {
      console.warn("Failed to send animation, fallback text:", err.message);
      const fallback = await this.bot.sendMessage(chatId, captionText);
      this.currentAnimationMsgId = fallback.message_id;
      return fallback;
    }
  }

  /**
   * Send a message in chunks if >4096 chars
   */
  async sendMessageWithLimit(chatId, message, parseMode = "HTML") {
    try {
      const MAX_LENGTH = 4096;

      if (message.length > MAX_LENGTH) {
        const chunks = message.match(new RegExp(`.{1,${MAX_LENGTH}}`, "g"));
        for (const chunk of chunks) {
          await this.bot.sendMessage(chatId, chunk, { parse_mode: parseMode });
        }
      } else {
        await this.bot.sendMessage(chatId, message, { parse_mode: parseMode });
      }
    } catch (error) {
      console.error("❌ Error in sendMessageWithLimit:", error.message);
      throw error;
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
