import { EventEmitter } from 'events';
import { AIFunctions } from './AIFunctions.js';
import { openAIService } from '../openai.js';
import { ErrorHandler } from '../../../core/errors/index.js';

export class HelperFunctions {
  constructor(bot) {
    this.bot = bot;
    this.functions = AIFunctions;
  }

  /**
   * Validates that all required parameters exist for a given function name.
   */
  validateRequiredParameters(functionName, args) {
    const def = this.functions.find((f) => f.name === functionName);
    if (!def) throw new Error(`No function definition for '${functionName}'.`);

    const required = def.parameters?.required || [];
    const missing = required.filter((p) => !(p in args));
    if (missing.length) {
      throw new Error(
        `Missing required parameters for '${functionName}': ${missing.join(", ")}`
      );
    }
  }

  /**
   * Validate or gather missing params from user
   */
  async validateFollowUpParameters(functionName, args, userId, msg) {
    let parsed;
    try {
      // Ensure we have a valid object
      parsed = (typeof args === "string")
        ? JSON.parse(args)
        : { ...args };

    } catch (parseErr) {
+     // ADDED: More robust parse error handling
      console.error("❌ Failed to parse arguments:", parseErr.message);
      throw new Error(`Invalid JSON arguments for '${functionName}': ${parseErr.message}`);
    }

    try {
      this.validateRequiredParameters(functionName, parsed);
      return parsed;
    } catch (err) {
      const match = err.message.match(/Missing required parameters for '.*?': (.+)/);
      if (!match) throw err; // It's some other error, re-throw

      const missingParams = match[1].split(", ").map((x) => x.trim());
      return await this.handleMissingParameters(functionName, parsed, missingParams, msg);
    }
  }

  /**
   * Dynamically ask user for missing fields
   */
  async handleMissingParameters(fnName, args, missing, msg) {
    try {
      const promptText = `⚠️ Missing parameters for '${fnName}': ${missing.join(", ")}.\n` +
        `Provide the values in the format "key1=val1 key2=val2".`;

      await this.bot.sendMessage(msg.chat.id, promptText, {
        reply_markup: { force_reply: true },
      });

      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          this.bot.removeListener("message", listener);
          reject(new Error("User did not respond in time for missing parameters."));
        }, 30000);

        const listener = async (reply) => {
          if (reply.chat.id === msg.chat.id) {
            clearTimeout(t);
            this.bot.removeListener("message", listener);

            const text = (reply.text || "").trim();
            // ADDED: Attempt to parse each "key=value" pair from user input:
            for (const param of missing) {
              // Use flexible pattern: paramName = remainderUntilNextSpace
              const regex = new RegExp(`${param}\\s*=\\s*(\\S+)`, "i");
              const found = text.match(regex);
              if (found) {
                args[param] = found[1];
              }
            }

            try {
              this.validateRequiredParameters(fnName, args);
              resolve(args);
            } catch (valErr) {
              // If still missing, recursively prompt again
              resolve(await this.handleMissingParameters(fnName, args, missing, msg));
            }
          }
        };
        this.bot.on("message", listener);
      });
    } catch (err) {
      console.error("❌ handleMissingParameters error:", err.message);
      throw err;
    }
  }

  /**
   * Use a template or just a single step
   */
  buildTaskTree(templateName, initialTask) {
    if (!initialTask?.name) {
      throw new Error("Invalid initialTask: missing name.");
    }

    /**
     * multiTaskTemplates
     * ------------------
     * Each template is a high-level user flow. The array defines the steps in order,
     * plus any dependencies. The agent can decide to call these flows if it deems them relevant,
     * or you can explicitly name them in your logic.
     */
    const multiTaskTemplates = {

      research_scan_trade: [
        { name: "analyze_token_by_symbol", dependencies: [], arguments: {} },
        { name: "execute_trade", dependencies: ["analyze_token_by_symbol"], arguments: {} },
        { name: "create_price_alert", dependencies: ["execute_trade"], arguments: {} },
      ],

      portfolio_review_alert: [
        { name: "get_portfolio", dependencies: [], arguments: {} },
        { name: "create_price_alert", dependencies: ["get_portfolio"], arguments: {} },
      ],

      flipper_mode_setup: [
        { name: "setup_flipper_mode", dependencies: [], arguments: {} },
        { name: "start_flipper_mode", dependencies: ["setup_flipper_mode"], arguments: {} },
        { name: "fetch_flipper_mode_metrics", dependencies: ["start_flipper_mode"], arguments: {} },
      ],

      // -------------------------------
      // NEW / UPDATED FLOWS
      // -------------------------------

      /**
       * A multi-step flow for discovering new tokens using multiple sources
       * (unified, CoinGecko, Twitter) and possibly searching the internet,
       * then analyzing a chosen token and creating a price alert.
       */
      comprehensive_discovery_flow: [
        // 1) Fetch top tokens from multiple combined sources
        { name: "fetch_trending_tokens_unified", dependencies: [], arguments: {} },

        // 2) Fetch popular/trending tokens from CoinGecko
        { name: "fetch_trending_tokens_coingecko", dependencies: ["fetch_trending_tokens_unified"], arguments: {} },

        // 3) Twitter check for daily hype
        { name: "fetch_trending_tokens_twitter", dependencies: ["fetch_trending_tokens_coingecko"], arguments: {} },

        // 4) Optionally search the internet for additional background
        { name: "search_internet", dependencies: ["fetch_trending_tokens_twitter"], arguments: {} },

        // 5) Possibly analyze a single token in depth
        { name: "analyze_token_by_symbol", dependencies: ["search_internet"], arguments: {} },

        // 6) Create a price alert if user wants to track it
        { name: "create_price_alert", dependencies: ["analyze_token_by_symbol"], arguments: {} },

        // 7) Setup a reminder about this discovery (in case user wants to revisit)
        { name: "set_reminder", dependencies: ["create_price_alert"], arguments: {} },

        // 8) Start monitoring reminders
        { name: "start_monitoring_reminders", dependencies: ["set_reminder"], arguments: {} },

        // 9) Generate a final Google report to summarize everything
        { name: "generate_google_report", dependencies: ["start_monitoring_reminders"], arguments: {} },
        
        // Optionally check sentiment on Twitter
        { name: "fetch_tweets_for_symbol", dependencies: [], arguments: {} },
        
         // Optionally check price on coingecko
         { name: "token_price_coingecko", dependencies: [], arguments: {} },
        
        // Option search token by address
        { name: "analyze_token_by_address", dependencies: [], arguments: {} },

        // Optionally execute trade
        { name: "execute_trade", dependencies: [], arguments: {} },
      ],

      /**
       * A simpler flow for just discovering tokens on one chain, checking sentiment,
       * then analyzing it, and setting an alert. Could be used instead of the more
       * comprehensive approach above.
       */
      token_discovery_flow: [
        // 1) fetch trending tokens for a chosen chain
        { name: "fetch_trending_tokens_by_chain", dependencies: [], arguments: {} },
        // 2) check sentiment on Twitter
        { name: "fetch_tweets_for_symbol", dependencies: ["fetch_trending_tokens_by_chain"], arguments: {} },
        // 3) analyze token
        { name: "analyze_token_by_symbol", dependencies: ["fetch_tweets_for_symbol"], arguments: {} },
        // 4) create alert
        { name: "create_price_alert", dependencies: ["analyze_token_by_symbol"], arguments: {} },
        // Optionally execute trade
        { name: "execute_trade", dependencies: [], arguments: {} },
        // Option search token by address
        { name: "analyze_token_by_address", dependencies: [], arguments: {} },
      ],

      /**
       * A broad “research + email” flow that:
       * 1) searches the internet for info
       * 2) sets a Google reminder
       * 3) starts monitoring
       * 4) generates a summary report
       */
      research_and_email_flow: [
        { name: "search_internet", dependencies: [], arguments: {} },
        { name: "set_reminder", dependencies: ["search_internet"], arguments: {} },
        { name: "start_monitoring_reminders", dependencies: ["set_reminder"], arguments: {} },
        { name: "generate_google_report", dependencies: ["start_monitoring_reminders"], arguments: {} },
      ],

      /**
       * A multi-step flow for:
       * 1) Approving a token,
       * 2) Executing a trade,
       * 3) Then creating a price alert (and/or searching news).
       */
      defi_approval_trade: [
        // You might want to check your portfolio first
        { name: "get_portfolio", dependencies: [], arguments: {} },
        // Approve token
        { name: "approve_token", dependencies: ["get_portfolio"], arguments: {} },
        // Execute trade
        { name: "execute_trade", dependencies: ["approve_token"], arguments: {} },
        // Create alert
        { name: "create_price_alert", dependencies: ["execute_trade"], arguments: {} },
        // Optionally do a quick news search
        { name: "search_internet", dependencies: ["create_price_alert"], arguments: {} },
        // Optionally check Twitter as source of validation
        { name: "fetch_tweets_for_symbol", dependencies: [], arguments: {} },
        // Email confirmation
        { name: "set_reminder", dependencies: ["execute_trade"], arguments: {} },
      ],

       /**
       * A multi-step flow for:
       * 1) Checking the word on the street (trench)
       * 2) Executing a trade,
       * 3) Then creating a price alert (and/or searching news).
       */
       social_sentiment_trade: [
        // Optionally do a quick news search
        { name: "search_internet", dependencies: ["create_price_alert"], arguments: {} },
        // 3) Twitter check for daily hype
        { name: "fetch_trending_tokens_twitter", dependencies: [], arguments: {} },
        // Optionally check Twitter as source of validation
        { name: "fetch_tweets_for_symbol", dependencies: [], arguments: {} },
        // Optionally check price on coingecko
        { name: "token_price_coingecko", dependencies: [], arguments: {} },
        // You might want to check your portfolio first
        { name: "get_portfolio", dependencies: [], arguments: {} },
        // Approve token
        { name: "approve_token", dependencies: ["get_portfolio"], arguments: {} },
        // Execute trade
        { name: "execute_trade", dependencies: ["approve_token"], arguments: {} },
        // Create alert
        { name: "create_price_alert", dependencies: ["execute_trade"], arguments: {} },
        // Email confirmation
        { name: "set_reminder", dependencies: ["execute_trade"], arguments: {} },
      ],

      /**
       * Another example: bitrefill shopping flow
       */
      bitrefill_giftcard_flow: [
        { name: "start_bitrefill_shopping_flow", dependencies: [], arguments: {} },
        { name: "check_bitrefill_payment_status", dependencies: ["start_bitrefill_shopping_flow"], arguments: {} },
      ],

      /**
       * Solana payment workflow:
       * 1) get portfolio for sol balance
       * 2) create solana pay
       */
      solana_payment_workflow: [
        { name: "get_portfolio", dependencies: [], arguments: {} },
        { name: "create_solana_payment", dependencies: ["get_portfolio"], arguments: {} },
      ],

      /**
       * Explore categories from CoinGecko, pick a category, get coins,
       * analyze one of them.
       */
      market_category_exploration: [
        { name: "fetch_market_categories", dependencies: [], arguments: {} },
        { name: "fetch_coins_by_category", dependencies: ["fetch_market_categories"], arguments: {} },
        { name: "analyze_token_by_symbol", dependencies: ["fetch_coins_by_category"], arguments: {} },
      ],

      /**
       * KOL monitoring:
       * 1) start monitoring
       * 2) optionally stop
       */
      kol_monitoring_flow: [
        { name: "monitor_kol", dependencies: [], arguments: {} },
        { name: "stop_monitor_kol", dependencies: ["monitor_kol"], arguments: {} },
      ],
    };

    // If the user explicitly provided a templateName in the function call
    if (templateName && multiTaskTemplates[templateName]) {
      return multiTaskTemplates[templateName].map((task, i) => ({
        ...task,
        step: i + 1,
      }));
    }

    // Fallback: single-step array from the initial function call
    return [
      {
        name: initialTask.name,
        step: 1,
        dependencies: [],
        arguments: initialTask.arguments || {},
      },
    ];
  }

  /**
   * Format an object/array to string, handle large data
   */
  formatResultForDisplay(result, limit = 50) {
    if (result == null) return "No data.";

    const processValue = (val, path = "") => {
      if (val == null) return "null";
      if (Array.isArray(val)) {
        if (val.length > limit) {
          return `[${val
            .slice(0, limit)
            .map((x, i) => processValue(x, `${path}[${i}]`))
            .join(", ")}] ... truncated`;
        }
        return `[${val.map((x, i) => processValue(x, `${path}[${i}]`)).join(", ")}]`;
      }
      if (typeof val === "object") {
        const entries = Object.entries(val);
        if (entries.length > limit) {
          const partial = entries.slice(0, limit).reduce((acc, [k, v]) => {
            acc[k] = processValue(v, `${path}.${k}`);
            return acc;
          }, {});
          return JSON.stringify(partial, null, 2) + " ... truncated";
        }
        return entries
          .map(([k, v]) => `${this.escapeMarkdown(k)}: ${processValue(v, `${path}.${k}`)}`)
          .join("\n");
      }
      if (typeof val === "string") return this.escapeMarkdown(val);
      return this.escapeMarkdown(String(val));
    };

    if (typeof result === "object") {
      return processValue(result, "");
    }
    return this.escapeMarkdown(String(result));
  }

  escapeMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/[_*`[\]()~>#+\-=|{}.!]/g, "\\$&")
      .replace(/(\r\n|\r|\n)/g, "\n")
      .replace(/\\\./g, ".");
  }

  formatResults(results) {
    return results
      .map((res, i) => `Step ${i + 1}:\n${res}`)
      .join("\n\n");
  }

  async notifyUserWithRetry(type, msg, taskName, extra, max = 3) {
    let attempt = 0;
    while (attempt < max) {
      const ok = await this.notifyUser(type, msg, taskName, extra);
      if (ok) return true;
      attempt++;
    }
    await this.fallbackResponse(msg, `Cannot notify about '${taskName}' after ${max} tries.`);
    return false;
  }

  async notifyUser(type, msg, taskName = "", extra = "") {
    try {
      if (!msg?.chat?.id) return false;
      const t = this.escapeMarkdown(taskName);
      const e = this.escapeMarkdown(extra.slice(0, 1000));

      const map = {
        start: `🔄 Starting ${t}...`,
        complete: `✅ ${t} completed.\n${e}`,
        followUp: `🔄 Proceeding with ${t}...`,
        error: `❌ Error in ${t}.\n${e}`,
      };
      const textToSend = map[type] || e || "⚠️";
      await this.bot.sendMessage(msg.chat.id, textToSend, { parse_mode: "Markdown" });
      return true;
    } catch (error) {
      console.error("❌ notifyUser error:", error.message);
      return false;
    }
  }

  async fallbackResponse(msg, explanation) {
    try {
      const ex = this.escapeMarkdown(explanation);
      await this.bot.sendMessage(msg.chat.id, `⚠️ ${ex}`, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("❌ fallbackResponse error:", err.message);
    }
  }

  isRecoverableError(error) {
    const recoverable = ["ECONNRESET", "ETIMEDOUT", "NetworkError", "ENOTFOUND", "AggregateError"];
    return (
      recoverable.some((kw) => error.message.includes(kw)) ||
      (error.name && recoverable.includes(error.name))
    );
  }
  
}
