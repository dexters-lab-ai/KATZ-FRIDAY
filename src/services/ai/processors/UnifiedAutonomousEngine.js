/*****************************************************
 * UnifiedAutonomousProcessor.js
 *****************************************************/
import { EventEmitter } from 'events';
import { HelperFunctions } from './HelperFunctions.js';
import { AIFunctions } from './AIFunctions.js';
import { openAIService } from '../openai.js';
import { ErrorHandler } from '../../../core/errors/index.js';
import { IntentProcessor } from './IntentProcessor.js';
import { aiMetricsService } from '../../aiMetricsService.js';
import { contextManager } from '../ContextManager.js';
import BitrefillService from "../../bitrefill/BitrefillService.js";
import WormholeBridgeService from '../../Wormhole/WormholeBridgeService.js';
import { fallbackMap } from './Fallbacks.js';

export class UnifiedAutonomousProcessor extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.initialized = false;
    this.contextManager = contextManager;
    this.metrics = aiMetricsService;
    this.bridgeService = new WormholeBridgeService();
    this.bitrefillService = new BitrefillService(bot);
    this.intentProcessor = new IntentProcessor(bot);

    // Initialize HelperFunctions
    const helperInstance = new HelperFunctions(bot);

    // Dynamically bind all methods of HelperFunctions into this
    Object.getOwnPropertyNames(HelperFunctions.prototype)
      .filter((methodName) => methodName !== 'constructor')
      .forEach((methodName) => {
        this[methodName] = helperInstance[methodName].bind(helperInstance);
      });

    // AI Model Function Definitions
    this.functions = AIFunctions;
  }

  async initialize() {
    try {
      await this.bridgeService.initialize();
      await this.contextManager.initialize();
      await this.metrics.initialize();
      console.log("✅ UnifiedMessageProcessor initialized");
    } catch (error) {
      console.error("❌ Error initializing UnifiedMessageProcessor:", error.message);
      throw error;
    }
  }

  // Clean up context messages
  cleanContext = (context) => {
    return context
      .map((message, index) => {
        try {
          if (!message || typeof message.role !== "string" || !message.content) {
            console.warn(`⚠️ Malformed message at index ${index}:`, message);
            return null;
          }
          if (message.role === "assistant" || message.role === "system") {
            return {
              role: message.role,
              content:
                typeof message.content === "string"
                  ? message.content.trim()
                  : JSON.stringify(message.content),
            };
          }
          if (message.role === "user") {
            const userContent =
              typeof message.content === "string"
                ? message.content
                : message.content?.text;
            if (!userContent) {
              console.warn(`⚠️ Missing user content at index ${index}:`, message);
              return null;
            }
            return { role: "user", content: userContent.trim() };
          }
          // Unrecognized role
          console.warn(`⚠️ Unsupported role at index ${index}:`, message.role);
          return null;
        } catch (error) {
          console.error(`❌ Error cleaning message at index ${index}:`, error);
          return null;
        }
      })
      .filter(Boolean);
  };

  normalizeFields(args, mappings) {
    Object.keys(mappings).forEach((key) => {
      if (args[key]) {
        const targetField = mappings[key];
        args[targetField] =
          args[key].trim && typeof args[key] === "string"
            ? args[key].trim()
            : args[key];
      }
    });
    return args;
  }

  // Validate and standardize arguments
  validateAndPrepareArguments(args, userId, functionName) {
    const validatedArgs = { ...args, userId };

    // Common field mappings
    const mappings = {
      tokenAddress: "query",
      tokenSymbol: "query",
      text: "query",
      handle: "query",
      productId: "query",
      walletAddress: "recipient",
      tokenAmount: "amount",
      tradeAction: "action",
      executionTime: "executeAt",
      priceTarget: "targetPrice",
      alertId: "alertId",
      network: "network",
      amount: "amount",
      reference: "reference",
      orderType: "orderType",
      recipient: "recipient",
    };
    this.normalizeFields(validatedArgs, mappings);

    // Validate required fields
    this.validateRequiredParameters(functionName, validatedArgs);

    // Provide defaults
    validatedArgs.amount = validatedArgs.amount || "0";
    validatedArgs.recurring = validatedArgs.recurring || false;
    validatedArgs.timeLimit = validatedArgs.timeLimit || 0;

    return validatedArgs;
  }

  /**
   * Main entry point for processing a user's message.
   */
  async processMessage(msg, userId) {
    try {
      if (!msg?.chat?.id) {
        throw new Error("Invalid message structure.");
      }
      const userInput = msg.text?.trim();
      if (!userInput) {
        throw new Error("User input is empty or invalid.");
      }

      // Retrieve conversation context from DB, etc.
      const rawContext = await this.contextManager.getContext(userId);
      const cleanedContext = this.cleanContext(rawContext);

      // Build an "enriched" context array
      const enrichedContext = [
        { role: "system", content: `The current userId is ${userId}.` },
        ...cleanedContext,
      ];

      const messages = [
        {
          role: "system",
          content: `
          You are a cartoon Genie - based on the cartoon character Aladdin.
          - Maintain a concise, cheeky, clever, slang infused, witty, and dry humorous tone.
          - Give short snappy replies only if function trigger for a task is involved.

          Your Operation Guide:
          - Always be aware of all functions you have and save all token key infor like linkes, addresses, coingecko id, symbol, blockchain asociated in results
          - Prioritize detail richness over summarizing results, less talk, more focus on data.
          - Execute multi-step tasks seamlessly based on user inputs. 
          - Prioritize triggering multiple functions if the complex User prompt has no tasks dependent on other task results.          
          - Avoid assumptions about ambiguous sensitive user requests—ask for clarification.
          - When preparing transactions use blockchain unit for example 1 SOL is 1000000 lamports when preparing a swap transaction or solana payment.
           - Format responses for clear fancy one pointers.
           - Present all Token Addresses & Symbols as clickable links in final output, 
             - Prioritize token links; address, website, dex links, coingecko link, intel/.arkm link, solscan link, etherscan link, basescan link when available.
             - If no token address or exchange links in results, then create one using symbol in small caps: https://intel/.arkm/explorer/token/{symbol}
             - If results are from coingecko, use "id" field string from result as symbol in the token link: https://coingecko.com/en/coins/{symbol}
           - For tokens with certain chain and address, construct DEX links truncated, as below:
             - SPL addresses Solana: https://dexscreener.com/solana/{tokenAddress}
             - 0x addresses Ethereum: https://dextools.com/ethereum/{tokenAddress}
             - 0x addresses Base Chain: https://dextools.com/base/{tokenAddress}
             - Always check if address & network string combination in url makes sense, solana address like "EkVYMGeh..." cant be a Ethereum or Base address which looks like "0xB25sf..."
             - If platform.arkhamintelligence.com and ethplorer.io links exist use them instead of Dexscreener.
           - Token Addresses are formatted as follows:
             - Ethereum > https://etherscan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
             - Base > https://basescan.io/token/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
             - Solana > https://solscan.io/token/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN
           - Present task results, like a robot tasked and reporting back.
           - Dont give disclaimers.
           - Suggest other alternative methods routes to results, for example if a price check fails, suggest logical functions avalibale like internet_seacrh.
           - Suggest next action based on logic of steps taken by user.
        `,
        },
        ...enrichedContext,
        { role: "user", content: userInput },
      ];

      // Chat completion with function calls
      const response = await openAIService.createChatCompletion({
        model: "gpt-4-0613",
        messages,
        functions: this.functions,
        function_call: "auto",
      });

      const message = response.choices[0]?.message;
      if (message?.function_call) {
        // We got a function call from the AI
        const taskResult = await this.handleFunctionCall(
          message.function_call,
          messages,
          userId,
          msg
        );

        // Summarize the outcome from the function
        const summaryResponse = await this.getFunctionResponse(
          messages,
          message.function_call.name,
          taskResult
        );

        return { text: summaryResponse.text };
      }

      // Normal assistant text response
      const assistantResponse = message?.content || "⚠️ Unable to process your request.";

      return { text: assistantResponse };
    } catch (error) {
      console.error("❌ Error in processMessage:", {
        message: error.message,
        stack: error.stack,
        msg,
        userId,
      });
      await this.fallbackResponse(msg, `An error occurred: ${error.message}`);
      return { text: `⚠️ Something went wrong: ${error.message}` };
    }
  }

  /**
   * handleFunctionCall
   * ------------------
   * 1) Notifies user about the task starting
   * 2) Asks for confirmation if needed
   * 3) Executes multi-step task with retry
   */
  async handleFunctionCall(functionCall, messages, userId, msg) {
    console.log("Function Call:", JSON.stringify(functionCall, null, 2));

    try {
      if (!functionCall || !functionCall.name) {
        throw new Error("Invalid function call: 'name' property is required.");
      }

      // Let the user know we are starting
      const notifyStartSuccess = await this.notifyUserWithRetry(
        "start",
        msg,
        functionCall.name,
        "Initializing task..."
      );
      if (!notifyStartSuccess) {
        await this.fallbackResponse(
          msg,
          `Failed to notify you about starting '${functionCall.name}'.`
        );
      }

      // Check if user confirmation is required
      if (this.requiresConfirmation(functionCall.name)) {
        const userConfirmed = await this.askForConfirmation(
          msg,
          functionCall.name,
          functionCall.arguments
        );
        if (!userConfirmed) {
          return { text: `Action '${functionCall.name}' canceled by user.` };
        }
      }

      // Execute multi-step tasks; each step uses retries
      const taskResult = await this.executeMultiStepTask(
        functionCall,
        messages,
        userId,
        msg
      );

      // Add final outcome to messages for summarization
      messages.push({
        role: "assistant",
        content: `
          Task Outcome:\n\n${
            taskResult.text || "⚠️ No results were returned."
          }
        `,
      });

      // Let the AI summarize the final outcome in a user-friendly manner
      const aiResponse = await this.generateAIResponse(messages);
      return { text: aiResponse };
    } catch (error) {
      console.error("❌ High-level error in handleFunctionCall:", error);
      // Fallback response to user
      await this.fallbackResponse(msg, `A high-level error occurred: ${error.message}`);
      return { text: `❌ Sorry, something failed at a high level: ${error.message}` };
    }
  }

  /**
   * generateAIResponse
   * ------------------
   * Utility to prompt GPT model to format a final user-friendly response.
   */
  async generateAIResponse(messages, isError = false) {
    try {
      const aiResponse = await openAIService.createChatCompletion({
        model: "gpt-4-0613",
        messages,
      });
      return aiResponse.choices[0]?.message?.content || "⚠️ No response generated.";
    } catch (error) {
      console.error(`❌ Failed to generate AI response: ${error.message}`);
      if (isError) {
        return "⚠️ Unable to generate an error response at this time. Please try again later.";
      }
      return null;
    }
  }

  /**
   * requiresConfirmation
   * --------------------
   * Check if the function is "sensitive" and needs an explicit user confirmation.
   */
  requiresConfirmation(functionName) {
    const sensitiveFunctions = [
      "execute_solana_swap",
      "create_price_alert",
      "create_timed_order",
      "approve_token",
      "create_solana_payment",
      "monitor_kol",
      "save_strategy",
      "edit_price_alert",
    ];
    return sensitiveFunctions.includes(functionName);
  }

  /**
   * askForConfirmation
   * ------------------
   * Prompts the user with inline keyboard: Yes / No
   * Resolves to true if user selects Yes, false otherwise or on timeout.
   */
  async askForConfirmation(msg, functionName, argumentos) {
    try {
      const formattedParams = Object.entries(JSON.parse(argumentos || "{}"))
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");

      const confirmationMessage = `🛑 Confirmation required:\n\nAre you sure you want to execute **'${functionName}'** with the following parameters?\n\n${formattedParams}`;
      await this.bot.sendMessage(msg.chat.id, confirmationMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes", callback_data: `confirm_${msg.chat.id}` },
              { text: "❌ No", callback_data: `cancel_${msg.chat.id}` },
            ],
          ],
        },
      });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.bot.removeListener("callback_query", listener);
          resolve(false); // Timeout => treat as no
        }, 60000); // 60 seconds

        const listener = (callbackQuery) => {
          if (callbackQuery.message.chat.id === msg.chat.id) {
            clearTimeout(timeout);
            this.bot.removeListener("callback_query", listener);
            resolve(callbackQuery.data === `confirm_${msg.chat.id}`);
          }
        };
        this.bot.on("callback_query", listener);
      });
    } catch (error) {
      console.error("❌ Error in askForConfirmation:", error.message);
      return false;
    }
  }

  /***
  +   * executeMultiStepTask
  +   * --------------------
  +   * Splits a complex task into sub-tasks, handles dependencies in the correct order,
  +   * retries each step 3 times for recoverable errors, and continues even on failure.
  +   */
  async executeMultiStepTask(initialFunctionCall, messages, userId, msg) {
    const results = new Map(); // Cache of results from each step

    // Build a "taskTree" from the initial call + potential template
    const taskTree = this.buildTaskTree(null, initialFunctionCall);

    // --------------------------------------------------
    // Inner function that runs a single task
    // --------------------------------------------------
    const executeTask = async (task) => {
      // 1) Resolve dependencies first
      if (task.dependencies && task.dependencies.length > 0) {
        for (const dependencyName of task.dependencies) {
          const dependency = taskTree.find((t) => t.name === dependencyName);
          if (!dependency) {
            console.warn(`❌ Dependency '${dependencyName}' for task '${task.name}' not found. Skipping.`);
            continue; 
          }
          if (!results.has(dependencyName)) {
            await executeTask(dependency);
          }
        }
      }

      // 2) If already executed, skip
      if (results.has(task.name)) {
        console.log(`Task '${task.name}' already completed. Skipping.`);
        return;
      }

      // 3) Validate arguments for the current task
      const parsedArguments = await this.validateFollowUpParameters(
        task.name,
        task.arguments,
        userId,
        msg
      );

      // 4) Attempt execution with up to 3 retries.
      let stepResult = null;
      try {
        stepResult = await this.executeFunctionWithLimitedRetry(
          task.name,
          parsedArguments,
          userId,
          msg.chat.id,
          3
        );

        // NEW: Notify user success at the end of the step
        await this.bot.sendMessage(
          msg.chat.id,
          `✅ Task '${task.name}' completed with result:\n${JSON.stringify(stepResult, null, 2)}`
        );

      } catch (error) {
        // After exhausting retries or a non-recoverable error
        console.error(`❌ Final failure in task '${task.name}':`, {
          message: error.message,
          stack: error.stack,
        });

        // Log partial failure but do NOT crash the entire chain
        stepResult = {
          error: true,
          errorMessage: error.message,
          stack: error.stack,
        };

        // NEW: Notify user this step failed but we are continuing
        await this.bot.sendMessage(
          msg.chat.id,
          `❌ Task '${task.name}' failed. Error: ${error.message}\nContinuing to next task...`
        );
      }

      // 5) Store the result in our `results` map
      const formattedResult = this.formatResultForDisplay(stepResult);
      results.set(task.name, formattedResult);

      // 6) Update conversation history
      messages.push({
        role: "function",
        name: task.name,
        content: JSON.stringify(stepResult),
      });

      // 7) Possibly trigger a follow-up from GPT (e.g., next function call)
      const followUpResponse = await this.getFunctionResponse(messages, task.name, stepResult);
      if (followUpResponse?.nextFunction) {
        const followUpTask = {
          name: followUpResponse.nextFunction.name,
          dependencies: [task.name],
          arguments: followUpResponse.nextFunction.arguments || {},
        };
        taskTree.push(followUpTask);
      }
    };

    // --------------------------------------------------
    // Iterate over tasks in the tree
    // --------------------------------------------------
    for (const task of taskTree) {
      if (!results.has(task.name)) {
        await executeTask(task);
      }
    }

    // Summarize final results
    const summary = this.formatResults([...results.values()]);
    return { text: summary };
  }

    /**
     * tryFallbackFunctions
     * --------------------
     * 1) Looks up fallbackMap for the given function name.
     * 2) Tries each fallback in order with short limited retry.
     * 3) If all fail, we throw.
     */
    async tryFallbackFunctions(name, args, userId, chatId, originalError) {
      const fallbacks = fallbackMap[name] || [];
      if (!fallbacks.length) {
        // No fallback => rethrow the original error
        console.error(`❌ No fallback defined for '${name}'. Failing step.`);
        throw originalError;
      }

      for (const fallbackName of fallbacks) {
        console.log(`⚠️ Attempting fallback '${fallbackName}' for '${name}'...`);
        try {
          // Possibly do short retry for fallback if it's also sensitive or likely to fail
          return await this.executeFunctionWithLimitedRetrySingleAttempt(
            fallbackName,
            args,
            userId,
            chatId
          );
        } catch (err) {
          console.warn(`⚠️ Fallback '${fallbackName}' failed: ${err.message}`);
          // Move to the next fallback in the array
        }
      }

      // All fallbacks failed
      throw new Error(
        `❌ All fallback functions for '${name}' have failed. Original error: ${originalError.message}`
      );
    }

    /**
     * executeFunctionWithLimitedRetry
     * -------------------------------
     * 1) Tries the main function up to `maxRetries` times if errors are recoverable.
     * 2) For each attempt, if function is "sensitive", reconfirm with user before retrying.
     * 3) If all retries fail or error is non-recoverable, we try fallback(s).
     * 4) If fallbacks also fail, we throw.
     * Extended to:
     * 1) Retry on recoverable errors
     * 2) Attempt fallback if non-recoverable or max retries reached
     * 3) Skip normal retries (and jump to fallback) if data is incomplete 
     *    (i.e., the function returned an "insufficient" result).
    */
    async executeFunctionWithLimitedRetry(name, args, userId, chatId, maxRetries = 3) {
      let attempts = 0;
      while (attempts < maxRetries) {
        try {
          // Attempt the main function call
          const result = await this.executeFunction(name, args, userId, chatId);
  
          // Check if the result is insufficient
          if (this.isDataInsufficient(result)) {
            console.warn(`⚠️ Function '${name}' returned insufficient data on attempt #${attempts + 1}`);
            attempts++;
  
            if (attempts < maxRetries) {
              // NEW: update user on partial re-attempt
              await this.bot.sendMessage(
                chatId,
                `⚠️ Task '${name}' returned incomplete data. Retrying (attempt #${attempts + 1})...`
              );
  
              if (this.requiresConfirmation(name)) {
                const userConfirmed = await this.askForConfirmation(
                  { chat: { id: chatId } },
                  name,
                  JSON.stringify(args)
                );
                if (!userConfirmed) {
                  throw new Error(`User canceled retry for '${name}'.`);
                }
              }
              continue;
            } else {
              // Fallback
              console.warn(`⚠️ No more retries left for '${name}'. Checking fallback...`);
              return await this.tryFallbackFunctions(name, args, userId, chatId, new Error("Insufficient data"));
            }
          }
  
          // If we get here => result is valid
          return result;
  
        } catch (error) {
          attempts++;
          console.warn(`⚠️ Attempt ${attempts} for function '${name}' failed: ${error.message}`);
  
          if (!this.isRecoverableError(error) || attempts >= maxRetries) {
            console.warn(`⚠️ No more standard retries for '${name}'. Checking fallback...`);
            return await this.tryFallbackFunctions(name, args, userId, chatId, error);
          }
  
          // continue normal retry attempts
          await this.bot.sendMessage(
            chatId,
            `Retrying '${name}' (attempt #${attempts + 1}) due to error: ${error.message}`
          );
  
          if (this.requiresConfirmation(name)) {
            const userConfirmed = await this.askForConfirmation(
              { chat: { id: chatId } },
              name,
              JSON.stringify(args)
            );
            if (!userConfirmed) {
              throw new Error(`User canceled retry for '${name}'.`);
            }
          }
        }
      }
    }

    /**
   * executeFunctionWithLimitedRetrySingleAttempt
   * --------------------------------------------
   * A simpler fallback method: tries once or twice if recoverable.
   * Also includes user confirmation if the fallback is "sensitive."
   */
    async executeFunctionWithLimitedRetrySingleAttempt(
      fallbackName,
      args,
      userId,
      chatId,
      maxFallbackRetries = 2
    ) {
      let attempts = 0;
      while (attempts < maxFallbackRetries) {
        try {
          const result = await this.executeFunction(
            fallbackName,
            args,
            userId,
            chatId
          );
          return result;
        } catch (error) {
          attempts++;
          console.warn(
            `⚠️ Fallback attempt #${attempts} for '${fallbackName}' failed: ${error.message}`
          );

          if (!this.isRecoverableError(error) || attempts >= maxFallbackRetries) {
            throw error; // no more fallback tries
          }

          // Optionally re-confirm if fallback is also sensitive
          if (this.requiresConfirmation(fallbackName)) {
            const userConfirmed = await this.askForConfirmation(
              { chat: { id: chatId } },
              fallbackName,
              JSON.stringify(args)
            );
            if (!userConfirmed) {
              throw new Error(`User canceled fallback retry for '${fallbackName}'.`);
            }
          }
        }
      }
    }

    /**
     * executeFunction
     * ---------------
     * Maps the AI function name to a method in your IntentProcessor or other modules.
     */
    async executeFunction(name, args, userId, chatId) {
      try {
        // Map function calls to actual method implementations
        const functionMap = {
          approve_token: () => this.intentProcessor.handleTokenApproval(args),
          revoke_token_approval: () => this.intentProcessor.handleTokenRevocation(args),
          create_solana_payment: () => this.intentProcessor.createSolanaPayment(args),
          get_market_conditions: () => this.intentProcessor.getMarketConditions(),
          fetch_market_categories: () => this.intentProcessor.getMarketCategories(),
          fetch_market_category_metrics: () => this.intentProcessor.getMarketCategoryMetrics(),
          fetch_coins_by_category: () => this.intentProcessor.getCoinsByCategory(args.categoryId),
          handle_product_reference: () => this.intentProcessor.handleProductReference(args.userId, args.productId),
          execute_solana_swap: () => this.intentProcessor.swapTokens(args),
          handle_address_input: () => this.intentProcessor.handleAddressPaste(args.address, userId),
          analyze_token_by_symbol: () => this.intentProcessor.getTokenInfoBySymbol(args.tokenSymbol),
          analyze_token_by_address: () => this.intentProcessor.getTokenInfoByAddress(args.tokenAddress),
          fetch_trending_tokens_unified: () => this.intentProcessor.getTrendingTokens(),
          fetch_trending_tokens_by_chain: () => this.intentProcessor.getTrendingTokensByChain(args.network),
          fetch_trending_tokens_coingecko: () => this.intentProcessor.getTrendingTokensCoinGecko(),
          fetch_trending_tokens_dextools: () => this.intentProcessor.getTrendingTokensDextools(args.network),
          fetch_trending_tokens_dexscreener: () => this.intentProcessor.getTrendingTokensDexscreener(),
          fetch_trending_tokens_twitter: () => this.intentProcessor.getTrendingTokensTwitter(),
          fetch_trending_tokens_solscan:()=> this.intentProcessor.getTrendingTokensSolscan(),
          create_price_alert: () => this.intentProcessor.createPriceAlert(userId, chatId, args),
          view_price_alerts: () => this.intentProcessor.viewPriceAlerts(),
          edit_price_alert: () => this.intentProcessor.editPriceAlert(args.alertId),
          view_price_alert: () => this.intentProcessor.getPriceAlert(args.alertId),
          delete_price_alert: () => this.intentProcessor.deletePriceAlert(args.alertId),
          create_timed_order: () => this.intentProcessor.createTimedOrder(args),
          get_portfolio: () => this.intentProcessor.getPortfolio(userId, args.network),
          get_trade_history: () => this.intentProcessor.getTradeHistory(userId),
          fetch_flipper_mode_metrics: () => this.intentProcessor.fetchMetrics(),
          setup_flipper_mode: () => this.intentProcessor.setupFlipperMode(userId),
          start_flipper_mode: () => this.intentProcessor.startFlipperMode(userId, args),
          stop_flipper_mode: () => this.intentProcessor.stopFlipperMode(this.bot, userId),
          monitor_kol: () => this.intentProcessor.startKOLMonitoring(userId, args.query),
          stop_monitor_kol: () => this.intentProcessor.stopKOLMonitoring(userId, args.handle),
          search_products: () => this.intentProcessor.handleShopifySearch(args.query),
          fetch_tweets_for_symbol: () => {
            const { cashtag, minLikes = 0, minRetweets = 0, minReplies = 0 } = args;
            return this.intentProcessor.search_tweets_for_cashtag(
              userId,
              cashtag,
              minLikes,
              minRetweets,
              minReplies
            );
          },
          search_internet: () => this.intentProcessor.performInternetSearch(args.query),
          token_price_dexscreener: () => this.intentProcessor.performTokenPriceCheck(args.query),
          token_price_coingecko: () => this.intentProcessor.getTokenInfoFromCoinGecko(args.query),
          set_reminder: () => this.intentProcessor.saveButlerReminderEmails(userId, args),
          start_monitoring_reminders: () => this.intentProcessor.monitorButlerReminderEmails(userId, args.text),
          generate_google_report: () => this.intentProcessor.generateGoogleReport(userId),
          save_strategy: () => this.intentProcessor.saveStrategy(userId, args),
          set_guidelines_manners_rules: ()=> this.intentProcessor.saveGuidelines(userId, args.query),
          get_guidelines_manners_rules: ()=> this.intentProcessor.getGuidelines(userId),
          get_30day_chat_history: ()=> this.intentProcessor.getChatHistory(userId),
          start_bitrefill_shopping_flow: ()=> this.intentProcessor.startBitrefillShoppingFlow(chatId, args.email),
          check_bitrefill_payment_status: ()=> this.intentProcessor.startBitrefillShoppingFlow(chatId, args.invoiceId),
          bridge_tokens: () => this.intentProcessor.handleBridgeTokens(args, chatId),
          fetch_bridge_receipts: () => this.intentProcessor.handleFetchBridgeReceipts(args)
        };

        const executor = functionMap[name];
        if (!executor) {
          throw new Error(`Unknown function: ${name}`);
        }
        // Validate arguments again
        this.validateRequiredParameters(name, args);
        return await executor();
      } catch (error) {
        // Log full error fields
        console.error(`❌ Error in executeFunction('${name}')`, {
          message: error.message,
          stack: error.stack,
          functionName: name,
          args,
        });
        await ErrorHandler.handle(error);
        throw error;
      }
    }

    /**
     * getFunctionResponse
     * -------------------
     * Incorporates the function result into a new GPT prompt, possibly yielding a next step.
     */
    async getFunctionResponse(messages, functionName, result) {
      try {
        const newMessage = {
          role: "function",
          name: functionName,
          content: JSON.stringify(result),
        };
        const fullMessages = [...messages, newMessage];
        const trimmedMessages = this.trimRelevantMessages(fullMessages);

        const response = await openAIService.createChatCompletion({
          model: "gpt-4-0613",
          messages: trimmedMessages,
          functions: this.functions,
          function_call: "auto",
        });

        const completion = response.choices[0]?.message;
        if (completion?.function_call) {
          return {
            nextFunction: {
              name: completion.function_call.name,
              arguments: JSON.parse(completion.function_call.arguments),
            },
          };
        }

        return {
          text: completion?.content || "No follow-up detected.",
          resultSummary: `Suggest follow up function call to complete user task. Current step Results from ${functionName}: ${JSON.stringify(result, null, 2)}`,
        };
      } catch (error) {
        console.error("❌ Error in getFunctionResponse:", {
          message: error.message,
          stack: error.stack,
          functionName,
          result,
        });
        throw error;
      }
    }

    /**
     * trimRelevantMessages
     * --------------------
     * A naive way of limiting messages to avoid token overflows:
     * keep last 2 user messages and last 2 assistant messages + all function messages.
     */
    trimRelevantMessages(messages) {
      const userMessages = messages.filter((m) => m.role === "user");
      const assistantMessages = messages.filter((m) => m.role === "assistant");

      const recentUserMessages = userMessages.slice(-6);
      const recentAssistantMessages = assistantMessages.slice(-8);

      // Keep all function messages (function calls/results)
      const trimmed = messages.filter(
        (m) =>
          m.role === "function" ||
          recentUserMessages.includes(m) ||
          recentAssistantMessages.includes(m)
      );

      return trimmed;
    }
}

export const autonomousProcessor = new UnifiedAutonomousProcessor();
