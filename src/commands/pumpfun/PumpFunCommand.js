import { User } from "../../models/User.js";
import { Command } from "../base/Command.js";
import { flipperMode } from "../../services/pumpfun/FlipperMode.js";
import { walletService } from "../../services/wallet/index.js";
import { USER_STATES } from "../../core/constants.js";
import { circuitBreakers } from "../../core/circuit-breaker/index.js";
import { BREAKER_CONFIGS } from "../../core/circuit-breaker/index.js";
import { ErrorHandler } from "../../core/errors/index.js";
import { Markup } from "telegraf";

export class PumpFunCommand extends Command {
  constructor(bot, eventHandler) {
    super(bot, eventHandler);
    this.command = "/pump";
    this.description = "Trade on Pump.fun";
    this.pattern = /^(\/pump|💊 Pump\.fun)$/;

    // Register event handlers for FlipperMode
    this.setupFlipperModeHandlers();
  }

  setupFlipperModeHandlers() {
    flipperMode.on("entryExecuted", async ({ token, result }) => {
      try {
        await circuitBreakers.executeWithBreaker(
          "pumpFun",
          async () => {
            await this.bot.telegram.sendMessage(
              this.userId,
              `*New FlipperMode Entry* 📈\n\n` +
                `Token: ${token.symbol}\n` +
                `Price: $${result.price}\n\n`,
              { parse_mode: "Markdown" }
            );
          },
          BREAKER_CONFIGS.pumpFun
        );
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

    flipperMode.on("exitExecuted", async ({ token, reason, result }) => {
      try {
        await circuitBreakers.executeWithBreaker(
          "pumpFun",
          async () => {
            await this.bot.telegram.sendMessage(
              this.userId,
              `*FlipperMode Exit* 📉\n\n` +
                `Token: ${token.symbol}\n` +
                `Price: $${result.price}\n` +
                `Reason: ${reason}\n\n`,
              { parse_mode: "Markdown" }
            );
          },
          BREAKER_CONFIGS.pumpFun
        );
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });
  }

  async execute(msg) {
    const chatId = msg.chat.id;
    try {
      await this.handlePumpFunCommand(chatId, msg.from);
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async handlePumpFunCommand(chatId, userInfo) {
    await circuitBreakers.executeWithBreaker(
      "pumpFun",
      async () => {
        try {
          const user = await User.findByTelegramId(userInfo.id);
          if (!user) {
            await this.showWalletRequiredMessage(chatId);
            return;
          }

          const solanaWallet = user.wallets.solana?.find((w) => w.isAutonomous);
          if (!solanaWallet) {
            await this.bot.telegram.sendMessage(
              chatId,
              `❌ *No Solana wallet enabled for autonomous trading.*\n\n` +
                `Please enable autonomous trading in wallet settings.`,
              {
                parse_mode: "Markdown",
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback("⚙️ Go to Wallets", "back_to_wallets")],
                ]),
              }
            );
            return;
          }

          const loadingMsg = await this.showLoadingMessage(chatId, "🚀 Loading PumpFun data...");
          const positions = flipperMode.getOpenPositions();
          await this.deleteMessage(chatId, loadingMsg.message_id);

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback("👀 Watch New Tokens", "pump_watch")],
            [Markup.button.callback("💰 Buy Token", "pump_buy")],
            [Markup.button.callback("💱 Sell Token", "pump_sell")],
            [Markup.button.callback("🤖 FlipperMode", "flipper_mode")],
            [Markup.button.callback("📊 View Positions", "view_positions")],
            [Markup.button.callback("↩️ Back to Menu", "back_to_menu")],
          ]);

          let message = "*PumpFun Trading* 💊\n\n";
          message += `Active Wallet: \`${solanaWallet.address}\` on *Solana*\n\n`;

          if (positions.length > 0) {
            message += "*Active Positions:*\n";
            positions.forEach((pos, index) => {
              message += `${index + 1}. ${pos.token.symbol} - $${pos.currentPrice}\n`;
            });
            message += "\n";
          }

          message += "Select an action:\n\n" +
            "• Watch new token listings\n" +
            "• Buy tokens with SOL\n" +
            "• Sell tokens for SOL\n" +
            "• Enable FlipperMode\n" +
            "• Manage positions";

          await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          });
        } catch (error) {
          console.error("Error in handlePumpFunCommand:", error);
          throw error;
        }
      },
      BREAKER_CONFIGS.pumpFun
    );
  }

  async showWalletRequiredMessage(chatId) {
    await this.bot.telegram.sendMessage(
      chatId,
      `❌ *No active Solana wallet found.*\n\n` +
        `Please create a wallet or enable autonomous trading first in the wallet settings.`,
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("⚙️ Go to Wallets", "back_to_wallets")],
        ]),
      }
    );
  }

  async showLoadingMessage(chatId, message) {
    return await this.bot.telegram.sendMessage(chatId, message);
  }

  async deleteMessage(chatId, messageId) {
    try {
      await this.bot.telegram.deleteMessage(chatId, messageId);
    } catch (error) {
      console.warn(`Could not delete message: ${error.message}`);
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const action = query.data;
    const userInfo = query.from;

    try {
      switch (action) {
        case "pump_watch":
          await this.startTokenWatching(chatId);
          break;

        case "pump_buy":
          await this.showBuyForm(chatId);
          break;

        case "pump_sell":
          await this.showSellForm(chatId);
          break;

        case "flipper_mode":
          await this.startFlipperMode(chatId, userInfo);
          break;

        case "stop_flipper":
          await this.stopFlipperMode(chatId);
          break;

        case "view_positions":
          await this.showOpenPositions(chatId);
          break;

        case "pump_retry":
          await this.handlePumpFunCommand(chatId, userInfo);
          break;

        case "back_to_wallets":
          await this.showWalletRequiredMessage(chatId);
          break;

        default:
          if (action.startsWith("close_position_")) {
            const tokenAddress = action.replace("close_position_", "");
            await this.closePosition(chatId, tokenAddress);
          } else if (action.startsWith("adjust_tp_")) {
            const tokenAddress = action.replace("adjust_tp_", "");
            await this.adjustTakeProfit(chatId, tokenAddress);
          } else if (action.startsWith("adjust_sl_")) {
            const tokenAddress = action.replace("adjust_sl_", "");
            await this.adjustStopLoss(chatId, tokenAddress);
          }
      }
    } catch (error) {
      await ErrorHandler.handle(error, this.bot, chatId);
    }
  }

  async adjustTakeProfit(chatId, tokenAddress) {
    await this.bot.telegram.sendMessage(
      chatId,
      "*Adjust Take Profit* 📈\n\nEnter the new TP percentage:",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", `position_details_${tokenAddress}`)],
        ]),
      }
    );

    this.setState(chatId, USER_STATES.WAITING_TP_INPUT);
    this.setUserData(chatId, { pendingTP: { tokenAddress } });
  }

  async adjustStopLoss(chatId, tokenAddress) {
    await this.bot.telegram.sendMessage(
      chatId,
      "*Adjust Stop Loss* 📉\n\nEnter the new SL percentage:",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", `position_details_${tokenAddress}`)],
        ]),
      }
    );

    this.setState(chatId, USER_STATES.WAITING_SL_INPUT);
    this.setUserData(chatId, { pendingSL: { tokenAddress } });
  }

  async handleInput(ctx) {
    const state = await this.getState(ctx.chat.id);

    if (state === USER_STATES.WAITING_TP_INPUT) {
      await this.updateTakeProfit(ctx.chat.id, ctx.message.text);
    } else if (state === USER_STATES.WAITING_SL_INPUT) {
      await this.updateStopLoss(ctx.chat.id, ctx.message.text);
    }
  }

  async updateTakeProfit(chatId, percentage) {
    const userData = await this.getUserData(chatId);
    const tokenAddress = userData.pendingTP.tokenAddress;

    if (isNaN(percentage) || percentage <= 0) {
      await this.bot.telegram.sendMessage(chatId, "❌ Invalid percentage entered. Please try again.");
      return;
    }

    await timedOrderService.createOrder(chatId, {
      tokenAddress,
      action: "sell",
      amount: flipperMode.getOpenPositions().find((pos) => pos.token.address === tokenAddress).amount,
      executeAt: new Date(Date.now() + 1000),
      conditions: { profitTarget: percentage },
    });

    await this.bot.telegram.sendMessage(chatId, `✅ Take Profit set at ${percentage}% successfully!`);
    await this.clearState(chatId);
  }

  async updateStopLoss(chatId, percentage) {
    const userData = await this.getUserData(chatId);
    const tokenAddress = userData.pendingSL.tokenAddress;

    if (isNaN(percentage) || percentage <= 0) {
      await this.bot.telegram.sendMessage(chatId, "❌ Invalid percentage entered. Please try again.");
      return;
    }

    await timedOrderService.createOrder(chatId, {
      tokenAddress,
      action: "sell",
      amount: flipperMode.getOpenPositions().find((pos) => pos.token.address === tokenAddress).amount,
      executeAt: new Date(Date.now() + 1000),
      conditions: { stopLoss: percentage },
    });

    await this.bot.telegram.sendMessage(chatId, `✅ Stop Loss set at ${percentage}% successfully!`);
    await this.clearState(chatId);
  }

  async closePosition(chatId, tokenAddress) {
    await circuitBreakers
      .executeWithBreaker(
        "pumpFun",
        async () => {
          const loadingMsg = await this.showLoadingMessage(chatId, "🔄 Closing position...");
          try {
            const result = await flipperMode.closePosition(tokenAddress);

            await this.bot.telegram.deleteMessage(chatId, loadingMsg.message_id);
            await this.bot.telegram.sendMessage(
              chatId,
              `*Position Closed* ✅\n\n` +
                `Token: ${result.token.symbol}\n` +
                `Exit Price: $${result.price}\n` +
                `P/L: ${result.profitLoss}%`,
              {
                parse_mode: "Markdown",
                reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback("📊 View Positions", "view_positions")],
                  [Markup.button.callback("↩️ Back", "back_to_pump")],
                ]),
              }
            );
          } catch (error) {
            await this.bot.telegram.deleteMessage(chatId, loadingMsg.message_id);
            throw error;
          }
        },
        BREAKER_CONFIGS.pumpFun
      )
      .catch((error) => this.showErrorMessage(chatId, error, "retry_close"));
  }

  async showOpenPositions(chatId) {
    const positions = flipperMode.getOpenPositions();

    if (positions.length === 0) {
      await this.bot.telegram.sendMessage(
        chatId,
        "*No Open Positions* 📊\n\nStart trading or enable FlipperMode to open positions.",
        {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("🤖 FlipperMode", "flipper_mode")],
            [Markup.button.callback("↩️ Back", "back_to_pump")],
          ]),
        }
      );
      return;
    }

    const keyboard = Markup.inlineKeyboard(
      positions
        .map((pos) => [Markup.button.callback(`${pos.token.symbol} ($${pos.currentPrice})`, `position_details_${pos.token.address}`)])
        .concat([[Markup.button.callback("↩️ Back", "back_to_pump")]])
    );

    await this.bot.telegram.sendMessage(
      chatId,
      `*Open Positions* 📊\n\n` +
        positions
          .map(
            (pos, i) =>
              `${i + 1}. ${pos.token.symbol}\n` +
              `• Entry: $${pos.entryPrice}\n` +
              `• Current: $${pos.currentPrice}\n` +
              `• P/L: ${pos.profitLoss}%\n` +
              `• Time: ${pos.timeElapsed} mins`
          )
          .join("\n\n"),
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  }

  async showPositionDetails(chatId, tokenAddress) {
    const position = flipperMode.getPosition(tokenAddress);
    if (!position) {
      await this.bot.telegram.sendMessage(chatId, "❌ Position not found.", {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback("↩️ Back", "view_positions")]]),
      });
      return;
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("📈 Adjust TP", `adjust_tp_${tokenAddress}`),
        Markup.button.callback("📉 Adjust SL", `adjust_sl_${tokenAddress}`),
      ],
      [Markup.button.callback("🔄 Close Position", `close_position_${tokenAddress}`)],
      [Markup.button.callback("↩️ Back", "view_positions")],
    ]);

    await this.bot.telegram.sendMessage(
      chatId,
      `*Position Details* 📊\n\n` +
        `Token: ${position.token.symbol}\n` +
        `Entry Price: $${position.entryPrice}\n` +
        `Current Price: $${position.currentPrice}\n` +
        `Take Profit: $${position.takeProfit}\n` +
        `Stop Loss: $${position.stopLoss}\n` +
        `P/L: ${position.profitLoss}%\n` +
        `Time in Trade: ${position.timeElapsed} mins`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  }

  async showTakeProfitForm(chatId, tokenAddress) {
    await this.setState(chatId, USER_STATES.WAITING_TP_INPUT);
    await this.setUserData(chatId, { pendingTP: { tokenAddress } });

    await this.bot.telegram.sendMessage(
      chatId,
      "*Adjust Take Profit* 📈\n\nEnter new take profit percentage:",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", `position_details_${tokenAddress}`)],
        ]),
      }
    );
  }

  async showStopLossForm(chatId, tokenAddress) {
    await this.setState(chatId, USER_STATES.WAITING_SL_INPUT);
    await this.setUserData(chatId, { pendingSL: { tokenAddress } });

    await this.bot.telegram.sendMessage(
      chatId,
      "*Adjust Stop Loss* 📉\n\nEnter new stop loss percentage:",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", `position_details_${tokenAddress}`)],
        ]),
      }
    );
  }

  async startTokenWatching(chatId) {
    await this.setState(chatId, USER_STATES.WATCHING_PUMP_TOKENS);
    const msg = await this.bot.telegram.sendMessage(chatId, "👀 Watching for new tokens...");

    const callback = async (token) => {
      try {
        await this.bot.telegram.sendMessage(
          chatId,
          `🆕 *New Token Listed*\n\n` +
            `Symbol: ${token.symbol}\n` +
            `Price: ${token.price}\n` +
            `Time: ${new Date().toLocaleTimeString()}`,
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        console.error("Error in token callback:", error);
      }
    };

    pumpFunService.subscribe("newToken", callback);

    setTimeout(async () => {
      pumpFunService.unsubscribe("newToken", callback);
      await this.bot.telegram.deleteMessage(chatId, msg.message_id);
      await this.bot.telegram.sendMessage(chatId, "Token watching session ended.");
      await this.clearState(chatId);
    }, 5 * 60 * 1000);
  }

  async showBuyForm(chatId) {
    await this.bot.telegram.sendMessage(
      chatId,
      "*Buy Token* 💰\n\nEnter the token address and amount to buy:\n\nFormat: `<token_address> <amount_in_sol>`",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", "back_to_pump")],
        ]),
      }
    );
  }

  async showSellForm(chatId) {
    await this.bot.telegram.sendMessage(
      chatId,
      "*Sell Token* 💱\n\nEnter the token address and amount to sell:\n\nFormat: `<token_address> <amount_in_tokens>`",
      {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel", "back_to_pump")],
        ]),
      }
    );
  }
}