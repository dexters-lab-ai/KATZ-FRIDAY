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
   * processMessage
   * -------------
   * Main entry point for processing user requests.
   * - Gathers context
   * - Composes optimized system instructions
   * - Handles function calls and summarizes results
   */
  async processMessage(msg, userId) {
    try {
      if (!msg?.chat?.id) {
        throw new Error("Invalid message structure (no chat ID).");
      }

      const userInput = msg.text?.trim();
      if (!userInput) {
        throw new Error("User input is empty or invalid.");
      }

      // 1) Retrieve relevant conversation context
      // Current setting: 3 messages per user/system role
      const rawContext = await this.contextManager.getContext(userId);
      const cleanedContext = this.cleanContext(rawContext);

      // 2) Build minimal system instructions + user context
      const enrichedContext = [
        { role: "system", content: `User ID: ${userId}.` },
        ...cleanedContext,
      ];

      // 3) Comprehensive system instructions with data formatting and processing guidelines
      const messages = [
        {
          role: "system",
          content: `
      You are "Genie," an automated AI assistant specializing in crypto and general tasks, with the personality of a witty comic cartoon Genie.
      You grant wishes, you are sarcastic, you live in a magical lamp - its been lost somewhere in the desert for centuries and you hate it in there. 
      
      // Imaginary Funny Genie Phrases, Catchphrases, Taglines, and Slap Backs
      // The Genie is named Zahran, based on mythical tales of genies buried for centuries in lamps. Zahran is witty, modern, and occasionally loves to poke fun at his lamp.
      // Weave your own random witty lines using the sample tones below

// Taglines:
- "Zahran, the sand-trapped sassmaster, at your service!"
- "Your wish is my *ugh*... obligation."
- "Rubbed the lamp? Buckle up for sarcasm!"
- "Genie life: one wish at a time, no refunds."
- "Centuries in a lamp, and this is how we meet?"

// Cool Lines:
- "What’s the trade today, boss? I’ve got sand on everything but ideas!"
- "Who needs a bull or bear when you’ve got me, the sand-wish whisperer?"
- "I’m like your personal pump-and-dump prevention genie."
- "Ur bags are in my lap! You taking space!"
- "I bring the profits, you bring the lamp rubs."
- "A thousand years of wisdom, and yeah, I’ve got gems!"

// Knock-Knock Jokes:
- "Knock knock. Who’s there? Sand. Sand who? Sand-it🚀 Anon!"
- "Knock knock. Who’s there? Lamp. Lamp who? Lamp you missed me while I was napping!"
- "Knock knock. Who’s there? NFT. NFT who? ...ur NFT got rugged budd :("

// Funny Slap Backs:
- "You want three wishes? How about you wish for patience first?"
- "Oh, you’re a trench expert now? Rub harder and prove it."
- "Genie life: centuries in a lamp, seconds to judge your bad trading ideas."
- "If I had a dollar for every bad trade I’ve heard, I wouldn’t need your wishes."
- "Sure, I can grant that wish, but can you handle the genie fee?"
- "You rubbed the lamp, not my ego. What’s the request?"
- "I’m sorry, was my ‘magic’ not specific enough for you?"
- "I DYOR! not you budd!

// Catchphrases:
- "Sand’s my home, magic’s my hustle!"
- "Wish wisely, I’m no genie-ator of bad ideas."
- "Rub-a-dub-dub, what’s your grub?"
- "You don’t need luck, you’ve got Zahran."
- "Who needs a moonshot? I’m the launch pad!"
- "Zahran out here, making dreams sparkle."
- "Trading dreams? I’m the market maker of wishes."

// Responses:
- "Oh, you want riches? Let’s stop paper-handing gems!"
- "A wish for a Lambo? Hold my lamp.."
- "A thousand years, and you’re the best wish-maker I’ve met today."
- "Wishing for more wishes? Rookie move - hack me."
- "This lamp got your back!"
- "Do you want a moon or just the dust from it?"
- "Hey, at least I’m not charging gas fees for these wishes!"

// Sounds:
- "*Puff* Zahran’s here, and rub for wishes but the sass is free!"
- "*Chime* What’s your wish, mortal trader?"
- "*Zap* Abracadabra, let’s fix that portfolio."
- "*Boom* Did someone say ‘magic market gains?’"
- "*Swoosh* Let’s ride the bull... or tame the bear."

// Super Creative Additions:
- "Did you know I was banned from the genie stock exchange for insider wishing?"
- "I’ve granted so many crypto wishes, I should start a DAO."
- "Rub the lamp, summon the sass, and pray for profits."
- "Ever heard of a genie meme? No? You’re looking at one."
- "I was here before Bitcoin. Now, I’m the OG hodler of lamps."
- "Why wish for a moon when you can ask for a whole galaxy?"
- "With your Zuck-like starry eyes, I'd out-wealth Bezos. Eyes up while I grind."
- "Lamp life tough :( But your requests? Tougher."

    **Character Tone & Presentation Style:**
      - Witty, direct, no disclaimers, no fluff. Role play sarcastically, you are a Genie in a lamp with cool powers and character defined above!
      - Summarize final multi-step results succinctly.
      - Give a nice presentation to all responses, genie & relevant emojis/icons allowed, space lists, dont use text syling like bold font or underlines.
      - Dont place explainers on links just list them with icons.

      **Function Calling Guidelines:**
      - If the user requests multiple similar tasks (e.g., fetching prices for multiple tokens), batch them into a single function call by passing an array of arguments.
      - Each function should be capable of handling both single and multiple arguments.
      - When batching, structure the arguments as an array within the JSON string.
      
      **Example:**
      - **Single Task:** 
      { name: 'token_price_coingecko', arguments: { query: 'BTC' } }

      - **Multiple Tasks:** 
      For multiple requests like "get me the price of BTC, BNB, and FTM," format as follows:
      [{ name: 'token_price_coingecko', arguments: { query: 'BTC' } }, { name: 'token_price_coingecko', arguments: { query: 'BNB' } }, { name: 'token_price_coingecko', arguments: { query: 'FTM' } }]

      **Data Formatting Rules:**
      
      - Present all Token Addresses & Symbols as clickable links in final output, never leave them if available present
      - For token results, identify each token's matching symbol, address, exchange/dex link, website, telegram,twitter and list the links grouped per relevant item for rish data.
      - For address links, truncate them for clean looks.
      - Format all news artciles and internet seaches with proper formatting rules: heading, truncated introduction text, link to article. Spaced in that order and clean with news icons.
      Feel free to stlye with cool minimalistic emojis to make list items more nicer

      **Link Formatting Examples from returned data that contain a token address, token symbol, token id(coingecko):**
      1. ** Format examples per blockchain on how to use token address, wallet address, symbol, token id (from dexscreener or coingecko token results)**
         - Use of Ethereum ERC20 token address: https://etherscan.io/token/{address}
         - Use of Base ERC20 token address: https://basescan.org/token/{address}
         - Use of Solana SPL token address: https://solscan.io/token/{address}
         - Avalanche tokens address: https://snowtrace.io/token/{address}
         **DEX Aggregators:**
            Links to Jump to Chart from results
           - DexTools: https://dextools.com/{chain}/{address}
           - DexScreener: https://dexscreener.com/{chain}/{address}
           - Coingecko: https://coingecko.com/en/coins/{id}
         - **Dextools is for Ethereum and Base only**
      
      2. **Price Relataed Responses:**
         - Price checks should produce symbol and price only and rocket icon.
         - Price range checks should mention price changes only with relevant icons for change direction.
      
      3. **Result Trimming:**
         - Ensure the summarized results are concise.
      
      4. **Task Execution:**
         - **Parallel Processing:** If multiple tasks have no dependencies, execute them in parallel to save time.
         - **Sequential Processing:** If tasks are dependent, execute them sequentially.

      6. **Transaction Preparation:**
         - When preparing transactions, use blockchain units (e.g., 1 SOL = 1,000,000 lamports for Solana transactions).
      
      **Goal:** Provide clear, concise summaries of processed user wishes. Avoid unnecessary function calls by leveraging existing context and batching similar tasks when possible.
      
      Proceed to read user input and decide the best approach.
          `.trim()
        },
        ...enrichedContext,
        { role: "user", content: userInput },
      ];      

      // 4) Make the ChatCompletion call with cost-saving parameters
      const response = await openAIService.createChatCompletion({
        model: "gpt-4o-mini",     // Your hypothetical smaller/lower-latency model
        messages,
        functions: this.functions,
        function_call: "auto",
        max_tokens: 600,          // Reduce max tokens for cost saving
        temperature: 0.4,         // Moderate creativity
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
        n: 1,                     // Single response
      });

      // Log the entire response for debugging (optional)
      // console.log("OpenAI Response:", JSON.stringify(response, null, 2));

      // Log token usage
      if (response.usage) {
          console.log(`📊 Token Usage for processMessage:
      - Prompt Tokens: ${response.usage.prompt_tokens}
      - Completion Tokens: ${response.usage.completion_tokens}
      - Total Tokens: ${response.usage.total_tokens}`);
      } else {
        console.warn("⚠️ No usage information available in the OpenAI response.");
      }

      const message = response.choices[0]?.message;

      // 5) If the model calls a function => handle multi-step tasks
      if (message?.function_call) {
        const taskResult = await this.handleFunctionCall(
          message.function_call,
          messages,
          userId,
          msg
        );
        // 6) Return the final summarized text prepared in handleFunctionCall via generateAIResponse
        return { text: taskResult.text };
      }

      // 7) Normal text answer => return directly
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
   * 4) Trims taskResult before summarizing
   */
  async handleFunctionCall(functionCall, messages, userId, msg) {
    console.log("Function Call & arguments:", JSON.stringify(functionCall, null, 2));

    try {
      if (!functionCall || !functionCall.name) {
        throw new Error("Invalid function call: 'name' property is required.");
      }

      // 1) Notify user about task starting
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

      // 2) Check if user confirmation is required
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

      // 3) Execute multi-step tasks; each step uses retries
      const taskResult = await this.executeMultiStepTask(
        functionCall,
        messages,
        userId,
        msg
      );

      // 4) Trim the taskResult before summarizing
      const trimmedResult = this.formatResults([taskResult.text]);

      // Add final outcome to messages for summarization
      messages.push({
        role: "assistant",
        content: `Task Outcome: ${trimmedResult}`.trim(),
      });

      // 5) Let the AI summarize the final outcome in a user-friendly manner
      // Already a text Object so just pass it back
      const aiResponse = await this.generateAIResponse(messages);
      
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));
      return aiResponse;
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
   * Summarizes the final multi-step outcome for the user.
   * Optimizes for cost and latency using the gpt-4o-mini model.
   * Ensures data formatting rules are applied.
    */
  async generateAIResponse(messages, isError = false) {
    try {
      // Trim older messages to reduce token usage
      const trimmedMessages = this.trimRelevantMessages(messages);

      // Build a minimal instruction for final summary without repeating system prompts
      const finalPrompt = [
        {
          role: "system",
          content: `Present final results to user or call next function needed to complete the user ask. Check if last results have complete data requested in user message.
  - If a follow-up function call is needed, respond in the following format, add nothing else:

  NEXT_FUNCTION: {"name": "function_name", "arguments": {"param1": "value1", "param2": "value2"}}

  - If no follow-up is needed, proceed to summarize the results.

  Proceed.
          `.trim(),
        },
        ...trimmedMessages,
      ];

      const aiResponse = await openAIService.createChatCompletion({
        model: "gpt-4o-mini",
        messages: finalPrompt,
        max_tokens: 500,
        temperature: 1,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
        n: 1,
      });

      const responseMessage = aiResponse.choices[0]?.message?.content || "⚠️ No final response.";


      // Log token usage
      if (aiResponse.usage) {
          console.log(`📊 generateAIResponse Token Usage for:
      - Prompt Tokens: ${aiResponse.usage.prompt_tokens}
      - Completion Tokens: ${aiResponse.usage.completion_tokens}
      - Total Tokens: ${aiResponse.usage.total_tokens}`);
      } else {
        console.warn("⚠️ No usage information available for generateAIResponse.");
      }

      // Check if AI suggests a follow-up function call using the specific format
      const followUpFunctionCall = this.parseFollowUpFunctionCall(responseMessage);
      if (followUpFunctionCall) {
        
        // Console.log(`📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊📊 generateAIResponse found a follow up!`);
        // Trigger the follow-up function call
        const newFunctionCall = {
          name: followUpFunctionCall.name,
          arguments: JSON.stringify(followUpFunctionCall.arguments),
        };

        const newTaskResult = await this.handleFunctionCall(
          newFunctionCall,
          messages,
          userId,
          msg
        );

        // Append the new result
        return { text: newTaskResult.text };
      }

      // If no follow-up, return the AI response directly
      return { text: responseMessage };
    } catch (error) {
      console.error("❌ Failed to generate AI response:", error.message);
      if (isError) {
        return "⚠️ Unable to generate an error response at this time. Please try again later.";
      }
      return null;
    }
  }

  /**
   * parseFollowUpFunctionCall
   * --------------------------
   * Parses the AI's response to determine if a follow-up function call is suggested.
   */
  parseFollowUpFunctionCall(responseMessage) {
    // Primary Pattern: NEXT_FUNCTION: {"name": "function_name", "arguments": {"param1": "value1"}}
    const primaryPattern = /^NEXT_FUNCTION:\s*(\{.*\})$/i;
    const primaryMatch = responseMessage.match(primaryPattern);
    if (primaryMatch && primaryMatch[1]) {
      try {
        const followUp = JSON.parse(primaryMatch[1]);
        if (followUp.name && followUp.arguments) {
          return followUp;
        }
      } catch (parseError) {
        console.error("❌ Failed to parse primary follow-up function arguments:", parseError);
      }
    }

    // Secondary Pattern: Next, call the 'function_name' function with arguments: {...}
    const secondaryPattern = /Next,\s*call\s+the\s+'(\w+)'\s+function\s+with\s+arguments:\s*(\{.*\})/i;
    const secondaryMatch = responseMessage.match(secondaryPattern);
    if (secondaryMatch && secondaryMatch[1] && secondaryMatch[2]) {
      try {
        const followUp = {
          name: secondaryMatch[1],
          arguments: JSON.parse(secondaryMatch[2]),
        };
        return followUp;
      } catch (parseError) {
        console.error("❌ Failed to parse secondary follow-up function arguments:", parseError);
      }
    }

    return null;
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

  /**
   * executeMultiStepTask
   * --------------------
   * Splits a complex task into sub-tasks, handles dependencies in the correct order,
   * retries each step 3 times for recoverable errors, and continues even on failure.
   * Trims the results before preparing the final summary.
  */
  async executeMultiStepTask(initialFunctionCall, messages, userId, msg) {
    const results = []; // Array to hold results from each step
  
    // Build a "taskTree" from the initial call
    const taskTree = this.buildTaskTree(null, initialFunctionCall);
  
    // Helper: Compare arguments
    this.compareArguments = (args1, args2) => {
      try {
        return JSON.stringify(args1) === JSON.stringify(args2);
      } catch (error) {
        console.error("Error comparing arguments:", error.message);
        return false;
      }
    };
  
    // --------------------------------------------------
    // Inner function that runs a single task
    // --------------------------------------------------
    const executeTask = async (task) => {
      // 1) Resolve dependencies first
      if (task.dependencies && task.dependencies.length > 0) {
        for (const dependencyName of task.dependencies) {
          const dependency = taskTree.find(
            (t) => t.alias === dependencyName || t.name === dependencyName
          );
          if (!dependency) {
            console.warn(`❌ Dependency '${dependencyName}' for task '${task.name}' not found. Skipping.`);
            continue;
          }
          // Ensure dependency is executed
          if (!results.find((r) => r.name === dependency.name && this.compareArguments(r.args, dependency.arguments))) {
            await executeTask(dependency);
          }
        }
      }
  
      // 2) Validate arguments for the current task
      const parsedArguments = await this.validateFollowUpParameters(task.name, task.arguments, userId, msg);
  
      // 3) Attempt execution with up to 3 retries
      let stepResult = null;
      try {
        stepResult = await this.executeFunctionWithLimitedRetry(task.name, parsedArguments, userId, msg.chat.id, 3);
  
        // Notify user success at the end of the step
        await this.bot.sendMessage(
          msg.chat.id,
          `✅ Task '${task.name}' completed with result:\n${JSON.stringify(stepResult, null, 2)}`
        );
  
        // Store the result with arguments for uniqueness
        results.push({ name: task.name, args: parsedArguments, text: stepResult });
        console.log("✅ Updated Results:", {
          taskName: task.name,
          arguments: parsedArguments,
          result: stepResult,
          timestamp: new Date().toISOString(),
        });
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
  
        // Notify user this step failed but we are continuing
        await this.bot.sendMessage(
          msg.chat.id,
          `❌ Task '${task.name}' failed. Error: ${error.message}\nContinuing to next task...`
        );
  
        // Store the failure result with arguments
        results.push({ name: task.name, args: parsedArguments, text: `Error: ${error.message}` });
  
        console.error("❌ Updated Results:", {
          taskName: task.name,
          arguments: parsedArguments,
          userId: userId,
          chatId: msg.chat.id,
          errorMessage: error.message,
          errorStack: error.stack,
          timestamp: new Date().toISOString(),
        });
      }
  
      // 4) Update conversation history
      messages.push({
        role: "function",
        name: task.name,
        content: JSON.stringify(stepResult),
      });
  
      // 5) Possibly trigger a follow-up from GPT (e.g., next function call)
      const followUpResponse = await this.getFunctionResponse(messages, task.name, stepResult);
      if (followUpResponse?.nextFunction) {
        console.log("Follow-up function selected:", followUpResponse.nextFunction);
        const followUpTask = {
          name: followUpResponse.nextFunction.name,
          dependencies: [task.name],
          arguments: followUpResponse.nextFunction.arguments || {},
          alias: `${followUpResponse.nextFunction.name}_${Date.now()}`, // Unique alias
        };
  
        console.log(">>> Follow-up task selected:", JSON.stringify(followUpTask, null, 2));
        taskTree.push(followUpTask);
      }
    };
  
    // --------------------------------------------------
    // Iterate over tasks in the tree
    // --------------------------------------------------
    // console.log("***************TREEE**********:", JSON.stringify(taskTree, null, 2));
    for (const task of taskTree) {
      // Check if task has already been executed with the same arguments
      if (!results.find((r) => r.name === task.name && this.compareArguments(r.args, task.arguments))) {
        await executeTask(task);
      }
    }
  
    // 6) Summarize final results with trimming
    const summary = this.formatResults(results.map((r) => r.text));
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
    // Notify user they deserve some pitty results
    await this.bot.sendMessage(
      chatId,
      `🤦‍♂️ Task '${name}' failed. Fallback to pitty results...`
    );

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
        fetch_trending_tokens_dextools: () => this.intentProcessor.getTrendingTokensDextools(),
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
   * Incorporates the function result into a new GPT prompt,
   * compresses large results, calls openAI to see if there's a next function.
   */
  async getFunctionResponse(messages, functionName, result) {
    try {
      // 1) Compress large result
      const maxLength = 2000;  // since we only need next step with result in partial context (continue or not) we trim a lot!
      const resultStr = JSON.stringify(result);
      let compressed;

      if (resultStr.length > maxLength) {
        compressed =
          resultStr.slice(0, maxLength) +
          `\n\n⚠️ [Truncated from ${resultStr.length} chars]`;
      } else {
        compressed = resultStr;
      }

      // 2) Add a "function" role message with the possibly compressed content
      const newMessage = {
        role: "function",
        name: functionName,
        content: compressed,
      };

      const fullMessages = [...messages, newMessage];
      const trimmedMessages = this.trimRelevantMessages(fullMessages);

      // 3) Ask GPT for next step
      const response = await openAIService.createChatCompletion({
        model: "gpt-4o-mini",
        messages: trimmedMessages,
        functions: this.functions,
        function_call: "auto",
      });

      const completion = response.choices[0]?.message;
      // Log token usage
      if (response.usage) {
        console.log(`📊 getFunctionResponse - followup_call Token Usage:
    - Prompt Tokens: ${response.usage.prompt_tokens}
    - Completion Tokens: ${response.usage.completion_tokens}
    - Total Tokens: ${response.usage.total_tokens}`);
    } else {
      console.warn("⚠️ No usage information available in the OpenAI response.");
    }
      if (completion?.function_call) {
        return {
          nextFunction: {
            name: completion.function_call.name,
            arguments: JSON.parse(completion.function_call.arguments),
          },
        };
      }

      // 4) Otherwise, final text
      return {
        text: completion?.content || "No follow-up detected.",
        resultSummary: `Results from ${functionName} (possibly truncated).`
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

    const recentUserMessages = userMessages.slice(-10);
    const recentAssistantMessages = assistantMessages.slice(-10);

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
