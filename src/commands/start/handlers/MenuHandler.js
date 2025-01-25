import { Markup } from "telegraf";

export class MenuHandler {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * Display the main menu with a custom keyboard
   * @param {Object} ctx - Telegraf context object
   */
  async showMainMenu(ctx) {
    const keyboard = Markup.keyboard([
      ["🎭 Meme Analysis", "💰 Investment Advice"],
      ["📊 Vet Meme Loans", "🔥 Trending Tokens"],
      ["🔍 Scan Token", "⚠️ Rug Reports"],
      ["💊 Pump.fun", "👛 Wallets"],
      ["⚙️ Settings", "❓ Help"],
    ]).resize();

    await ctx.reply("Select an option:", keyboard);
  }

  /**
   * Display the welcome message
   * @param {Object} ctx - Telegraf context object
   * @param {string} username - User's Telegram username
   * @param {boolean} isNewUser - Whether the user is new or returning
   */
  async showWelcomeMessage(ctx, username, isNewUser) {
    const message = isNewUser
      ? `*Say "Hey to KATZ!" to bother him* 🐈‍⬛\n\n` +
        `*${username.toUpperCase()}*, ready for the trenches? 🌳🌍🕳️\n\n` +
        `_Intelligent & autonomous meme trading..._ 🤖💎\n\n` +
        `Need help? Type /help or /start over.`
      : `*Welcome Back ${username.toUpperCase()}!* 🐈‍⬛\n\n` +
        `Ready for the trenches? 🌳🕳️\n\n` +
        `_Let's find gems..._ 💎\n\n` +
        `Need help? Type /help or /start over.`;

    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback("🚀 Let's Go!", "start_menu"),
    ]);

    await ctx.reply(message, { parse_mode: "Markdown", ...keyboard });
  }
}
