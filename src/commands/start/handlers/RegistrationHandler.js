import { Markup } from "telegraf";
import { CertificateGenerator } from "../CertificateGenerator.js";
import { User } from "../../../models/User.js";
import { walletService } from "../../../services/wallet/index.js";
import { encrypt } from "../../../utils/encryption.js";

export class RegistrationHandler {
  constructor(bot) {
    this.bot = bot;
    this.certificateGenerator = new CertificateGenerator();
  }

  /**
   * Handle the registration process
   * @param {Object} ctx - Telegraf context object
   */
  async handleRegistration(ctx) {
    const chatId = ctx.chat.id;
    const userInfo = ctx.from;

    const loadingMsg = await ctx.reply("🔐 Creating your secure wallets...");

    try {
      // Create wallets for each network
      const [ethereumWallet, baseWallet, solanaWallet] = await Promise.all([
        walletService.createWallet(userInfo.id, "ethereum"),
        walletService.createWallet(userInfo.id, "base"),
        walletService.createWallet(userInfo.id, "solana"),
      ]);

      // Create user document
      const user = new User({
        telegramId: userInfo.id.toString(),
        username: userInfo.username,
        wallets: {
          ethereum: [
            {
              address: ethereumWallet.address,
              encryptedPrivateKey: encrypt(ethereumWallet.privateKey),
              encryptedMnemonic: encrypt(ethereumWallet.mnemonic),
              createdAt: new Date(),
            },
          ],
          base: [
            {
              address: baseWallet.address,
              encryptedPrivateKey: encrypt(baseWallet.privateKey),
              encryptedMnemonic: encrypt(baseWallet.mnemonic),
              createdAt: new Date(),
            },
          ],
          solana: [
            {
              address: solanaWallet.address,
              encryptedPrivateKey: encrypt(solanaWallet.privateKey),
              encryptedMnemonic: encrypt(solanaWallet.mnemonic),
              createdAt: new Date(),
            },
          ],
        },
        settings: {
          defaultNetwork: "ethereum",
          notifications: {
            enabled: true,
            showInChat: true,
          },
        },
        registeredAt: new Date(),
      });

      await user.save();

      // Generate wallet certificate
      const certificateBuffer = await this.certificateGenerator.generate({
        user: {
          username: userInfo.username,
          telegramId: userInfo.id,
        },
        wallets: {
          ethereum: ethereumWallet,
          base: baseWallet,
          solana: solanaWallet,
        },
      });

      await ctx.deleteMessage(loadingMsg.message_id);

      // Send wallet certificate
      const certificateMsg = await ctx.replyWithPhoto(
        { source: certificateBuffer },
        {
          caption:
            "🔐 *Your Wallet Certificate*\n\n" +
            "Download this certificate immediately to secure your wallet credentials.\n\n" +
            "⚠️ This image will self-destruct in 20 seconds!\n\n" +
            "*CRITICAL SECURITY INFORMATION*\n" +
            "• Save these details in a secure location\n" +
            "• Never share private keys or recovery phrases\n" +
            "• We don't store your private keys\n" +
            "• Lost credentials CANNOT be recovered",
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            Markup.button.callback("💾 Save Certificate", "download_certificate"),
          ]),
        }
      );

      // Delete certificate after delay
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(certificateMsg.message_id);
          await ctx.reply(
            "✅ Certificate deleted for security.\n" +
              "Make sure you have saved your wallet credentials!"
          );

          // Show welcome message
          await ctx.reply(
            `*Welcome to KATZ!* 🐈‍⬛\n\n` +
              `*${userInfo.username}*, your wallets are ready.\n\n` +
              `_Let's start finding gems in the trenches..._ 💎\n\n` +
              "Type /help to see available commands.",
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                Markup.button.callback("🚀 Let's Go!", "start_menu"),
              ]),
            }
          );
        } catch (error) {
          console.error("Error in certificate cleanup:", error);
        }
      }, 20000);

      return true;
    } catch (error) {
      console.error("Error during registration:", error);

      if (loadingMsg) {
        await ctx.deleteMessage(loadingMsg.message_id);
      }

      await ctx.reply(
        "❌ An error occurred during registration. Please try again later."
      );
      throw error;
    }
  }
}
