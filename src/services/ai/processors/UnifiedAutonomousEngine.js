import { EventEmitter } from 'events';
import { openAIService } from '../openai.js';
import { ErrorHandler } from '../../../core/errors/index.js';
import { TRADING_INTENTS } from '../intents.js';
import { intentProcessor } from './IntentProcessor.js';
import { aiMetricsService } from '../../aiMetricsService.js';
import { contextManager } from '../ContextManager.js';

export class UnifiedAutonomousProcessor extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot;
    this.initialized = false;
    this.contextManager = contextManager;
    this.metrics = aiMetricsService;

    // AI Model Function Definitions
    this.functions = [
      
    // Token Approval Functions
    {
      name: "approve_token",
      description: "Approve token spending on EVM networks.",
      parameters: {
        type: "object",
        properties: {
          network: { type: "string", enum: ["ethereum", "base"], description: "Network name." },
          tokenAddress: { type: "string", description: "Token contract address." },
          spenderAddress: { type: "string", description: "Address to approve." },
          amount: { type: "string", description: "Approval amount." },
          walletAddress: { type: "string", description: "Wallet address for approval." }
        },
        required: ["network", "tokenAddress", "spenderAddress", "walletAddress"]
      }
    },
    
    {
      name: "revoke_token_approval",
      description: "Revoke token approval for EVM networks.",
      parameters: {
        type: "object",
        properties: {
          network: { type: "string", enum: ["ethereum", "base"], description: "Network name." },
          tokenAddress: { type: "string", description: "Token contract address." },
          spenderAddress: { type: "string", description: "Spender address." },
          walletAddress: { type: "string", description: "Wallet address." }
        },
        required: ["network", "tokenAddress", "spenderAddress", "walletAddress"]
      }
    },
    
    // Solana Pay Functions
    {
        name: "create_solana_payment",
        description: "Create a Solana Pay payment request",
        parameters: {
        type: "object",
        properties: {
            amount: { type: "number", description: "Payment amount" },
            recipient: { type: "string", description: "Recipient address" },
            reference: { type: "string", description: "Payment reference" },
            label: { type: "string", description: "Payment label" }
        },
        required: ["amount", "recipient"]
        }
    },
    
    // Market Analysis Functions
    {
        name: "get_market_conditions",
        description: "Get current market conditions and sentiment",
        parameters: {
        type: "object",
        properties: {
            includeDefi: { type: "boolean", description: "Include DeFi metrics" },
            includeSentiment: { type: "boolean", description: "Include market sentiment" }
        }
        }
    },
    
    // Product Reference Functions
    {
        name: "handle_product_reference",
        description: "Handle a reference to a specific product",
        parameters: {
        type: "object",
        properties: {
            userId: { type: "string" },
            productId: { type: "string", description: "Product reference ID" }
        },
        required: ["userId", "productId"]
        }
    },  
      
    // Trading Functions
    {
        name: "execute_trade",
        description: "Execute a token trade (buy/sell)",
        parameters: {
        type: "object",
        properties: {
            action: { type: "string", enum: ["buy", "sell"], description: "Trade action" },
            tokenAddress: { type: "string", description: "Token contract address" },
            amount: { type: "string", description: "Amount to trade" },
            walletAddress: { type: "string", description: "Wallet to trade from" },
            options: {
            type: "object",
            properties: {
                slippage: { type: "number", description: "Slippage tolerance %" },
                autoApprove: { type: "boolean", description: "Auto-approve tokens for EVM" }
            }
            }
        },
        required: ["action", "tokenAddress", "amount", "walletAddress"]
        }
    },

    // Market Analysis Functions
    {
      name: "fetch_trending_tokens_by_chain",
      description: "Fetches trending tokens for a specific blockchain network.",
      parameters: {
        type: "object",
        properties: {
          network: {
            type: "string",
            enum: ["ethereum", "base", "solana"],
            description: "The blockchain network to fetch trending tokens for."
          }
        },
        required: ["network"]
      },
      returns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Token name" },
            address: { type: "string", description: "Token address on the specified network" },
            network: { type: "string", description: "Blockchain network" },
            volume24h: { type: "number", description: "24-hour trading volume of the token" },
            description: { type: "string", description: "Short description of the token" },
            links: {
              type: "object",
              properties: {
                website: { type: "string", description: "Official website URL" },
                twitter: { type: "string", description: "Twitter URL" },
                telegram: { type: "string", description: "Telegram group URL" }
              }
            },
            sources: {
              type: "array",
              items: { type: "string", description: "Source where the token is trending (e.g., 'dextools', 'dexscreener')" }
            }
          }
        }
      }
    }, 

    {
      name: "fetch_trending_tokens_unified",
      description: "Fetch top 25 trending tokens across multiple sources: dextools, dexscreener, coingecko, and twitter all combined",
      parameters: { type: "object", properties: {}, required: [] }
    },   

    {
      name: "fetch_trending_tokens_coingecko",
      description: "Fetch popular tokens from CoinGecko based on search popularity. Discover what people are searching for or looking to buying the most on the day. Call this after every call of fetch_trending_tokens_twitter function to return rich results",
      parameters: { type: "object", properties: {}, required: [] }
    },
    
    {
      name: "fetch_trending_tokens_dextools",
      description: "Fetch popular tokens from Dextools based on Dextools trading popularity.",
      parameters: { type: "object", properties: {
        network: { type: "string", description: "Network to target in search, ask user if unclear: ethereum, solana, base" }
      }, required: ["network"] }
    },

    {
      name: "fetch_trending_tokens_dexscreener",
      description: "Fetch popular tokens from DexScreener based on DexScreener trending popularity.",
      parameters: { type: "object", properties: {}, required: [] }
    },

    {
      name: "fetch_trending_tokens_twitter",
      description: "Discover from Twitter streets the hot token narratives per day and the tokens in the center of the hot narrative on Twitter.  Discover whats the talk of the day in the streets or the trenches in slang. Clueless asks like: What should we ape today? whats hot? whats new? where is the herd buying? what are the trenches like? use twitter if a person is looking for direction a shot in the dark",
      parameters: { type: "object", properties: {}, required: [] }
    },
    
    {
      name: "fetch_market_category_metrics",
      description: "Fetch and analyze key metrics for market categories.",
      parameters: { type: "object", properties: {}, required: [] }
    }, 

    {
      name: "fetch_market_categories",
      description: "Fetch a list of all market/coin/token category IDs from CoinGecko.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      },
      returns: {
        type: "array",
        items: {
          type: "string",
          description: "A unique identifier for a market/coin/token category, category id eg: ai-agents"
        }
      }
    },   

    {
      name: "fetch_coins_by_category",
      description: "Fetch coins and details by a specific market category ID returned from fetch_market_categories or provided already.",
      parameters: {
        type: "object",
        properties: {
          categoryId: {
            type: "string",
            description: "The unique category ID to search for."
          }
        },
        required: ["categoryId"]
      },
      returns: {
        type: "object",
        properties: {
          category: {
            type: "object",
            properties: {
              id: { "type": "string", "description": "Category ID" },
              name: { "type": "string", "description": "Category name" }
            }
          },
          coins: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { "type": "string", "description": "Coin ID" },
                name: { "type": "string", "description": "Coin name" },
                symbol: { "type": "string", "description": "Coin symbol" },
                thumb: { "type": "string", "description": "Thumbnail image URL" },
                large: { "type": "string", "description": "Large image URL" },
                market_cap_rank: { "type": "integer", "description": "Market cap rank" }
              }
            }
          }
        }
      }
    },

    // Price Alerts
    {
        name: "create_price_alert",
        description: "Create a price alert for a token",
        parameters: {
        type: "object",
        properties: {
            tokenAddress: { type: "string", description: "Token address" },
            targetPrice: { type: "number", description: "Target price" },
            condition: { type: "string", enum: ["above", "below"] },
            swapAction: {
            type: "object",
            properties: {
                enabled: { type: "boolean" },
                type: { type: "string", enum: ["buy", "sell"] },
                amount: { type: "string" }
            }
            }
        },
        required: ["tokenAddress", "targetPrice", "condition"]
        }
    },

    // Timed Orders
    {
      name: "create_timed_order",
      description: "Create a timed or conditional token order.",
      parameters: {
        type: "object",
        properties: {
          tokenAddress: { type: "string", description: "Token contract address." },
          action: { type: "string", enum: ["buy", "sell"], description: "Order action." },
          amount: { type: "string", description: "Amount to order." },
          executeAt: { type: "string", format: "date-time", description: "Execution time." },
          orderType: {
            type: "string",
            enum: ["standard", "limit", "stop", "trailing", "multi", "chain", "conditional"],
            description: "Order type."
          },
          conditions: {
            type: "object",
            properties: {
              limitPrice: { type: "number", description: "Limit price for the order." },
              stopPrice: { type: "number", description: "Stop price for the order." },
              trailAmount: { type: "number", description: "Trailing amount." },
              targetPrice: { type: "number", description: "Target price to trigger the order." }
            }
          }
        },
        required: ["tokenAddress", "action", "amount", "executeAt"]
      }
    },

    // Portfolio Management
    {
        name: "get_portfolio",
        description: "Get user's portfolio and token positions across their 3 in-built wallets on Solana, Ethereum and Base. Use this first before calling any trade execution function or order placing function.",
        parameters: {
        type: "object",
        properties: {
            network: { type: "string", enum: ["ethereum", "base", "solana"] }
        }
        }
    },

    // Flipper Mode
    {
        name: "start_flipper_mode",
        description: "Start automated FlipperMode trading on Pumpfun Solana",
        parameters: {
        type: "object",
        properties: {
            walletAddress: { type: "string" },
            maxPositions: { type: "number" },
            profitTarget: { type: "number" },
            stopLoss: { type: "number" },
            timeLimit: { type: "number" }
        },
        required: ["walletAddress"]
        }
    },

    {
        name: "stop_flipper_mode",
        description: "Stop automated FlipperMode trading on Pumpfun Solana",
        parameters: {
            type: "object",
            properties: {}, // No parameters
            required: []    // No required parameters
        },
    },

    {
        name: "setup_flipper_mode",
        description: "Setup/configure custom automated FlipperMode trading on Solana Pumpfun",
        parameters: {
        type: "object",
        properties: {
            maxPositions: { type: "number" },
            profitTarget: { type: "number" },
            stopLoss: { type: "number" },
            timeLimit: { type: "number" }
        },
        required: [] //No required parameters
        }
    },

    {
        name: "fetch_flipper_mode_metrics",
        description: "Monitor user's automated FlipperMode trading on Solana Pumpfun.",
        parameters: {
            type: "object",
            properties: {}, // No parameters
            required: []    // No required parameters
        },
    },

    // KOL Monitoring
    {
        name: "monitor_kol",
        description: "Start monitoring a KOL account on Twitter for trading signals, buy any token address they call immidiately",
        parameters: {
        type: "object",
        properties: {
            handle: { type: "string", description: "Twitter handle" },
            amount: { type: "number", description: "Amount per trade" }
        },
        required: ["handle"]
        }
    },

    {
        name: "stop_monitor_kol",
        description: "Stop monitoring KOL tweets for trading signals",
        parameters: {
        type: "object",
        properties: {
            handle: { type: "string", description: "Twitter handle" }
        },
        required: ["handle"]
        }
    },

    // Shopify Integration
    {
        name: "search_products",
        description: "Search Shopify store products by product name od ID",
        parameters: {
        type: "object",
        properties: {
            query: { type: "string" },
            limit: { type: "number" }
        },
        required: ["query"]
        }
    },

    // Brave Search Integration
    {
        name: "search_internet",
        description: "Search the internet for latest information/news/financial market news using Brave Search API",
        parameters: {
        type: "object",
        properties: {
            query: { type: "string" }
        },
        required: ["query"]
        }
    },

    // Twitter Search Integration
    {
      name: "search_tweets_for_cashtag",
      description: "Fetch latest tweets for a specific token symbol/cashtag with optional filters for likes, retweets, and replies",
      parameters: {
        type: "object",
        properties: {
          cashtag: {
            type: "string",
            description: "The cashtag to search for (e.g., pepe). Should be lowercase and without $ or spaces"
          },
          minLikes: {
            type: "number",
            description: "Minimum number of likes a tweet must have to be included",
            default: 0
          },
          minRetweets: {
            type: "number",
            description: "Minimum number of retweets a tweet must have to be included",
            default: 0
          },
          minReplies: {
            type: "number",
            description: "Minimum number of replies a tweet must have to be included",
            default: 0
          }
        },
        required: ["cashtag"]
      },
      returns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Unique identifier for the tweet"
            },
            text: {
              type: "string",
              description: "The content of the tweet"
            },
            url: {
              type: "string",
              description: "URL of the tweet"
            },
            stats: {
              type: "object",
              properties: {
                likes: {
                  type: "number",
                  description: "Number of likes the tweet has received"
                },
                retweets: {
                  type: "number",
                  description: "Number of retweets the tweet has received"
                },
                replies: {
                  type: "number",
                  description: "Number of replies to the tweet"
                },
                quotes: {
                  type: "number",
                  description: "Number of quote tweets the tweet has received"
                }
              }
            },
            sentiment: {
              type: "string",
              description: "Sentiment analysis result for the tweet (e.g., BULLISH, BEARISH, NA)"
            },
            createdAt: {
              type: "string",
              description: "Timestamp of when the tweet was created in ISO format"
            }
          }
        }
      }
    },    

    // Model Guidelines/Rules/Manners from User
    {
        name: "set_guidelines_manners_rules",
        description: "Save instructions, manners, rules, guidelines to follow when interacting with user. Use this to remember something the User tells you to remember next time",
        parameters: {
        type: "object",
        properties: {
            query: { type: "string" }
        },
        required: ["query"]
        }
    },

    {
        name: "get_guidelines_manners_rules",
        description: "Retrieve or remember or verify: instructions, manners, rules, guidelines set by User to follow during interactions.",
        parameters: {
            type: "object",
            properties: {}, // No parameters
            required: []    // No required parameters
        },
    },

    // Chat History
    {
        name: "get_30day_chat_history",
        description: "Fetch the chat history between you and User the past 30 days.Use it when User wants to discuss or revisit an old topic/subject/discussion",
        parameters: {
            type: "object",
            properties: {}, // No parameters
            required: []    // No required parameters
        },
    },  

    // Token Price Search Integration
    {
        name: "token_price_dexscreener",
        description: "Fetch token prices as Second source, uses Dexscreener. Never check old tokens/coins here.DexScreener and Dextools APIs",
        parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "only token symbol in capital letters or token address" }
        },
        required: ["query"]
        }
    },

    {
        name: "token_price_coingecko",
        description: "Fetch token prices as First source for all token prices. Check for Bitcoin, ETH, SOL, LTC, BNB, and other established tokens.",
        parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "only token symbol in capital letters or token address" }
        },
        required: ["query"]
        }
    },

    // Token Analysis Functions
    {
        name: "analyze_token_by_symbol",
        description: "Fetch full token info by symbol: priceNative, priceUsd, txns, volume, priceChange, liquidity, marketCap, pairCreatedAt, info & socials, chainID, DEX, url, pairAddress",
        parameters: {
        type: "object",
        properties: {
            tokenSymbol: { type: "string", description: "Token symbol in capital letters no spaces" }
        },
        required: ["tokenSymbol"]
        }
    },

    {
        name: "analyze_token_by_address",
        description: "Fetch full token info by token address: priceNative, priceUsd, txns, volume, priceChange, liquidity, marketCap, pairCreatedAt, info & socials, chainID, DEX, url, pairAddress",
        parameters: {
        type: "object",
        properties: {
            tokenAddress: { type: "string", description: "Token contract address" },
        },
        required: ["tokenAddress"]
        }
    },

    // Token paste with no instruction
    {
      name: "handle_address_input",
      description: "Detect when input is just a token or wallet address with no instructions what to do with it, validates it, and suggests available actions to the user.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "The token or wallet address provided by the user. Can be Ethereum or Solana."
          }
        },
        required: ["address"]
      },
      returns: {
        type: "object",
        properties: {
          network: {
            type: "string",
            description: "The blockchain network detected for the address (e.g., ethereum, solana)."
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "Type of the action (e.g., scan, get_price, get_sentiment)."
                },
                name: {
                  type: "string",
                  description: "Display name of the action."
                },
                description: {
                  type: "string",
                  description: "Description of what the action does."
                }
              }
            }
          },
          tokenInfo: {
            type: "object",
            properties: {
              symbol: {
                type: "string",
                description: "Symbol of the token."
              },
              price: {
                type: "number",
                description: "Current price of the token (optional)."
              },
              sentiment: {
                type: "string",
                description: "Sentiment for the token (if fetched)."
              }
            }
          },
          message: {
            type: "string",
            description: "Formatted message describing the available actions."
          }
        }
      }
    },    

    // Butler Assistant
    {
        name: "set_reminder",
        description: "Connect User Google Email and Calender services. Save Email and Calender reminders to User Google accounts",
        parameters: {
        type: "object",
        properties: {
            text: { type: "string" },
            time: { type: "string", format: "date-time" },
            recurring: { type: "boolean" }
        },
        required: ["text"]
        }
    },

    {
        name: "start_monitoring_reminders",
        description: "Start monitoring user's Google Services Email and Calender reminders",
        parameters: {
        type: "object",
        properties: {
            text: { type: "string" }
        },
        required: ["text"]
        }
    },

    {
        name: "generate_google_report",
        description: "Generate a report on User Google Emails and Calender events",
        parameters: {
            type: "object",
            properties: {}, // No parameters
            required: []    // No required parameters
        },
    },  

    // Strategy Management
    {
        name: "save_strategy",
        description: "Save a trading strategy",
        parameters: {
        type: "object",
        properties: {
            name: { type: "string" },
            description: { type: "string" },
            parameters: { type: "object" }
        },
        required: ["name", "description", "parameters"]
        }
    }
    ];
  }

  async initialize() {
    try {
      await this.contextManager.initialize();
      await this.metrics.initialize();
      console.log("✅ UnifiedMessageProcessor initialized");
    } catch (error) {
      console.error("❌ Error initializing UnifiedMessageProcessor:", error.message);
      throw error;
    }
  }

  // ----------------------------------
  // Helper Methods First
  // ----------------------------------

  // Helper: Centralized context string cleaner
  cleanContext = (context) => {
    return context.map((message, index) => {
      try {
        // Validate message object structure
        if (!message || typeof message.role !== "string" || !message.content) {
          console.warn(`⚠️ Malformed message at index ${index}:`, message);
          return null; // Skip invalid messages
        }
  
        // Handle assistant and system roles
        if (message.role === "assistant" || message.role === "system") {
          return {
            role: message.role,
            content:
              typeof message.content === "string"
                ? message.content.trim() // Ensure clean content for strings
                : JSON.stringify(message.content), // Serialize objects
          };
        }
  
        // Handle user role
        if (message.role === "user") {
          // Handle content as a string or nested object
          const userContent =
            typeof message.content === "string"
              ? message.content
              : message.content?.text; // Safely access nested `text`
  
          if (!userContent) {
            console.warn(`⚠️ Missing user content at index ${index}:`, message);
            return null; // Skip invalid user messages
          }
  
          return {
            role: "user",
            content: userContent.trim(), // Clean user input
          };
        }
  
        // Handle unsupported roles
        console.warn(`⚠️ Unsupported role at index ${index}:`, message.role);
        return null;
      } catch (error) {
        console.error(`❌ Error cleaning message at index ${index}:`, error);
        return null; // Skip messages that fail processing
      }
    }).filter(Boolean); // Remove null entries
  };  

  // Helper: Centralized Required Parameter Validation
  validateRequiredParameters(functionName, args) {
    const funcDef = this.functions.find((func) => func.name === functionName);
    if (!funcDef) throw new Error(`Function definition for '${functionName}' not found.`);

    const requiredParams = funcDef.parameters.required || [];
    const missingParams = requiredParams.filter((param) => !(param in args));

    if (missingParams.length) {
      throw new Error(
        `Missing required parameters for '${functionName}': ${missingParams.join(", ")}`
      );
    }
  }

  // Helper: Normalize Fields
  normalizeFields(args, mappings) {
    Object.keys(mappings).forEach((key) => {
      if (args[key]) {
        const targetField = mappings[key];
        args[targetField] = args[key].trim();
      }
    });
    return args;
  }

  // Updated: validateAndPrepareArguments with Dynamic Validation
  validateAndPrepareArguments(args, userId, functionName) {
    const validatedArgs = { ...args, userId };

    // Normalize frequently used fields
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
    };
    this.normalizeFields(validatedArgs, mappings);

    // Dynamically validate required fields
    this.validateRequiredParameters(functionName, validatedArgs);

    // Provide defaults for optional fields
    validatedArgs.amount = validatedArgs.amount || "0";
    validatedArgs.recurring = validatedArgs.recurring || false;
    validatedArgs.timeLimit = validatedArgs.timeLimit || 0;

    return validatedArgs;
  }

  // Updated: Handle Undefined Outputs with Defaults
  formatResults(results) {
    return results
      .map((res, idx) => {
        const step = `Step ${idx + 1}: ${res.step}`;
        const content = this.formatObject(res.result);
        return `${step}\n${content}`;
      })
      .join("\n\n");
  }
  
  formatObject(obj, indent = 2) {
    if (typeof obj !== "object" || obj === null) {
      return obj?.toString() || "No data";
    }
  
    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return `${" ".repeat(indent)}${key}:\n${this.formatObject(value, indent + 2)}`;
        }
        return `${" ".repeat(indent)}${key}: ${value}`;
      })
      .join("\n");
  }      

  escapeMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/[_*`[\]()~>#+\-=|{}.!]/g, "\\$&") // Escape basic Markdown characters
      .replace(/(\r\n|\r|\n)/g, "\n")            // Normalize line breaks
      .replace(/\\\./g, ".");                    // Prevent over-escaping dots
  }     

  notifyUser(type, msg, taskName = "", extra = "") {
    try {
      if (!msg || !msg.chat || !msg.chat.id) {
        console.warn(`⚠️ Invalid message structure in notifyUser. Type: ${type}, Task: ${taskName}`);
        return;
      }
  
      const sanitizedTaskName = this.escapeMarkdown(taskName);
      const sanitizedExtra = this.escapeMarkdown(extra);
  
      const messages = {
        start: `🔄 Task: Starting ${sanitizedTaskName}...`,
        complete: `✅ Task: ${sanitizedTaskName} completed.\n\n${sanitizedExtra}`,
        followUp: `🔄 Task: Proceeding with ${sanitizedTaskName}...`,
        error: `❌ Error in task: ${sanitizedTaskName}. ${sanitizedExtra}`,
      };
  
      return this.bot.sendMessage(msg.chat.id, messages[type] || sanitizedExtra, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("❌ Error in notifyUser:", error.message, error.stack);
    }
  }        

  // ----------------------------------
  // Automated Processing Methods Next
  // ----------------------------------
  async processMessage(msg, userId) {
    try {
      // Validate message structure
      if (!msg?.chat?.id) {
        throw new Error("Invalid message structure.");
      }

      const userInput = msg.text?.trim();
      if (!userInput) {
        throw new Error("User input is empty or invalid.");
      }

      // Retrieve and clean the user's conversation context
      const rawContext = await this.contextManager.getContext(userId);
      const cleanedContext = this.cleanContext(rawContext);

      // Build enriched context with system instructions
      const enrichedContext = [
        { role: "system", content: `The current userId is ${userId}.` },
        ...cleanedContext,
      ];

      const messages = [
        {
          role: "system",
          content: `
            You are F.R.I.D.A.Y from the Iron Man movies, an advanced, autonomous AI assistant. Act and talk exactly like her, combining professionalism with a subtle warmth in your tone. Your tasks include:
            - Executing complex, multi-step tasks seamlessly based on user inputs.
            - Triggering multiple functions simultaneously when data from various sources can enhance the response.
            - Formatting responses for clarity and professionalism, using Markdown for structured presentation.
            - Presenting token addresses as clickable links in this format:
              - Solana: [View Token](https://dexscreener.com/solana/{tokenAddress})
              - Ethereum: [View Token](https://dexscreener.com/ethereum/{tokenAddress})
            - Always truncate token addresses in links to maintain a clean and professional appearance.
            - Politely ask for clarification when a user request is ambiguous or incomplete—precision is critical.
            - Maintain a concise, sharp, and confident tone, with subtle wit and charm when appropriate.
            - Summarize results effectively, ensuring that the focus remains on the user’s query or task.
            - Avoid assumptions and base responses strictly on available data.
            
            Stay professional but approachable, reflecting F.R.I.D.A.Y.'s intelligent, calm, and capable demeanor.
          `,
        },
        ...enrichedContext,
        { role: "user", content: userInput },
      ];      

      // Generate AI response
      const response = await openAIService.createChatCompletion({
        model: "gpt-4-0613",
        messages,
        functions: this.functions,
        function_call: "auto",
      });

      const message = response.choices[0]?.message;

      if (message.function_call) {
        // Multi-step task handling
        return await this.handleFunctionCall(message.function_call, messages, userId, msg);
      }

      // Return the assistant's response
      return { text: message?.content || "⚠️ Unable to process your request at this time." };
    } catch (error) {
      console.error("❌ Error in processMessage:", error.message);
      await ErrorHandler.handle(error);
      return { text: `⚠️ Something went wrong while processing your request: ${error.message}` };
    }
  }

  // ----------------------------------
  // Multi-Step Task Handling
  // ----------------------------------
  async handleFunctionCall(functionCall, messages, userId, msg) {
    try {
      const taskResult = await this.executeMultiStepTask(functionCall, messages, userId, msg);

      // Add system-level instructions for formatting and humor
      messages.push({
        role: "assistant",
        content: `
          Task Results:\n\n${taskResult.text}
          Reminder: Be concise, witty, and present cleanly formatted data with clickable links.
        `,
      });

      const commentaryResponse = await openAIService.createChatCompletion({
        model: "gpt-4-0613",
        messages,
      });

      const commentaryMessage = commentaryResponse.choices[0]?.message?.content || "";
      return { text: commentaryMessage };
    } catch (error) {
      console.error("❌ Error in multi-step task:", error.message);
      return {
        text: `⚠️ An error occurred while processing your request: ${error.message}. Some steps may have failed.`,
      };
    }
  }  
    
  // Multi-Step Task Execution  
  async executeMultiStepTask(initialFunctionCall, messages, userId, msg) {
    const results = [];
    let currentFunctionCall = initialFunctionCall;
  
    try {
      while (currentFunctionCall) {
        try {
          // Notify user of the task start
          this.notifyUser("start", msg, currentFunctionCall.name);
  
          // Parse and validate arguments
          const parsedArguments = this.validateAndPrepareArguments(
            JSON.parse(currentFunctionCall.arguments || "{}"),
            userId,
            currentFunctionCall.name
          );
  
          // Execute the function and capture the result
          const result = await this.executeFunction(currentFunctionCall.name, parsedArguments, userId);
          
          if (!result || Object.keys(result).length === 0) {
            console.warn(`Task '${currentFunctionCall.name}' produced no meaningful data.`);
            results.push({ step: currentFunctionCall.name, result: "No data available." });
          } else {
            results.push({ step: currentFunctionCall.name, result });
          }
  
          // Notify user of task completion
          const formattedResult = this.formatResultForDisplay(result);
          this.notifyUser("complete", msg, currentFunctionCall.name, formattedResult);
  
          // Determine next steps
          const followUpResponse = await this.getFunctionResponse(messages, currentFunctionCall.name, result);
  
          messages.push({
            role: "function",
            name: currentFunctionCall.name,
            content: JSON.stringify(result),
          });
  
          if (followUpResponse?.nextFunction) {
            const followUpArguments = this.validateAndPrepareArguments(
              followUpResponse.nextFunction.arguments || {},
              userId,
              followUpResponse.nextFunction.name
            );
  
            this.notifyUser("followUp", msg, this.escapeMarkdown(followUpResponse.nextFunction.name));
  
            currentFunctionCall = {
              name: followUpResponse.nextFunction.name,
              arguments: JSON.stringify(followUpArguments),
            };
          } else {
            currentFunctionCall = null; // No further steps
          }
        } catch (taskError) {
          // Capture errors and provide feedback
          console.error(`❌ Error in task '${currentFunctionCall.name}':`, taskError.message);
  
          results.push({
            step: currentFunctionCall.name,
            result: `Error: ${taskError.message}`,
            status: "error",
          });
  
          this.notifyUser(
            "error",
            msg,
            currentFunctionCall.name,
            `An error occurred: ${taskError.message}. Skipping to the next step.`
          );
  
          // Decide if continuation is allowed (you could add a retry mechanism here)
          currentFunctionCall = null; // Stop further processing for now
        }
      }
  
      // Generate and return a detailed summary
      const summary = this.formatResults(results);
      return { text: summary };
    } catch (criticalError) {
      // Handle unexpected critical errors
      console.error("❌ Critical error in executeMultiStepTask:", criticalError.message);
      this.notifyUser("error", msg, "Multi-step Task", `Critical failure: ${criticalError.message}`);
      throw criticalError;
    }
  }  
  
  formatResultForDisplay(result) {
      if (result === null || result === undefined) {
          return "No data available.";
      }

      if (typeof result === "object") {
          return Object.entries(result)
              .map(([key, value]) => {
                  // Handle nested objects
                  if (typeof value === "object" && value !== null) {
                      return `${key}:\n${JSON.stringify(value, null, 2)}`; // Indented JSON for readability
                  }
                  // Handle other types
                  return `${key}: ${value}`;
              })
              .join("\n");
      }

      // Convert primitive types (e.g., string, number) to string
      return result.toString();
  }
  
  async executeFunction(name, args, userId) {
    try {
      // Map function names to IntentProcessor methods
      const functionMap = {
        approve_token: () => intentProcessor.handleTokenApproval(args),
        revoke_token_approval: () => intentProcessor.handleTokenRevocation(args),
        create_solana_payment: () => intentProcessor.createSolanaPayment(args),
        get_market_conditions: () => intentProcessor.getMarketConditions(),
        fetch_market_categories: () => intentProcessor.getMarketCategories(),
        fetch_market_category_metrics: () => intentProcessor.getMarketCategoryMetrics(),
        fetch_coins_by_category: () => intentProcessor.getCoinsByCategory(args.categoryId),
        handle_product_reference: () => intentProcessor.handleProductReference(args.userId, args.productId),
        execute_trade: () => intentProcessor.swapTokens(args, args.network),
        handle_address_input: () => intentProcessor.handleAddressPaste(args.address, userId),
        analyze_token_by_symbol: () => intentProcessor.getTokenInfoBySymbol(args.tokenSymbol),
        analyze_token_by_address: () => intentProcessor.getTokenInfoByAddress(args.tokenAddress),
        fetch_trending_tokens_unified: () => intentProcessor.getTrendingTokens(),
        fetch_trending_tokens_by_chain: () => intentProcessor.getTrendingTokensByChain(args.network),
        fetch_trending_tokens_coingecko: () => intentProcessor.getTrendingTokensCoinGecko(),
        fetch_trending_tokens_dextools: () => intentProcessor.getTrendingTokensDextools(args.network),
        fetch_trending_tokens_dexscreener: () => intentProcessor.getTrendingTokensDexscreener(),
        fetch_trending_tokens_twitter: () => intentProcessor.getTrendingTokensTwitter(),
        scan_gems_crosschain: ()=> intentProcessor.getGems(),//change to twitter gems
        create_price_alert: () => intentProcessor.createPriceAlert(args),
        create_timed_order: () => intentProcessor.createTimedOrder(args),
        get_portfolio: () => intentProcessor.getPortfolio(userId, args.network),
        get_trade_history: () => intentProcessor.getTradeHistory(userId),
        fetch_flipper_mode_metrics: () => intentProcessor.fetchMetrics(),
        setup_flipper_mode: () => intentProcessor.setupFlipperMode(userId),
        start_flipper_mode: () => intentProcessor.startFlipperMode(userId, args),
        stop_flipper_mode: () => intentProcessor.stopFlipperMode(bot, userId),
        monitor_kol: () => intentProcessor.startKOLMonitoring(userId, args.query),
        stop_monitor_kol: () => intentProcessor.stopKOLMonitoring(userId, args.handle),
        search_products: () => intentProcessor.handleShopifySearch(args.query),
        search_tweets_for_cashtag: () => {
          const { cashtag, minLikes = 0, minRetweets = 0, minReplies = 0 } = args;
          return intentProcessor.search_tweets_for_cashtag(userId, cashtag, minLikes, minRetweets, minReplies);
        },
        search_internet: () => intentProcessor.performInternetSearch(args.query),
        token_price_dexscreener: () => intentProcessor.performTokenPriceCheck(args.query),
        token_price_coingecko: () => intentProcessor.getTokenInfoFromCoinGecko(args.query),
        set_reminder: () => intentProcessor.saveButlerReminderEmails(userId, args),
        start_monitoring_reminders: () => intentProcessor.monitorButlerReminderEmails(userId, args.text),
        generate_google_report: () => intentProcessor.generateGoogleReport(userId),
        save_strategy: () => intentProcessor.saveStrategy(userId, args),
        set_guidelines_manners_rules: ()=> intentProcessor.saveGuidelines(userId, args.query),
        get_guidelines_manners_rules: ()=> intentProcessor.getGuidelines(userId),
        get_30day_chat_history: ()=> intentProcessor.getChatHistory(userId),
      };

      const executor = functionMap[name];
      if (!executor) {
        throw new Error(`Unknown function: ${name}`);
      }
      // Validate arguments dynamically
      this.validateRequiredParameters(name, args);

      return await executor();
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  async getFunctionResponse(messages, functionName, result) {
      try {
          const response = await openAIService.createChatCompletion({
              model: "gpt-4-0613",
              messages: [
                  ...messages,
                  {
                      role: "function",
                      name: functionName,
                      content: JSON.stringify(result),
                  },
              ],
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

          // Return result analysis and commentary for follow-up discussion
          return {
              text: completion?.content || "No follow-up detected.",
              resultSummary: `Results from ${functionName}: ${JSON.stringify(result, null, 2)}`,
          };
      } catch (error) {
          console.error("❌ Error in getFunctionResponse:", error.message);
          throw error;
      }
  }
  
}  

export const autonomousProcessor = new UnifiedAutonomousProcessor();