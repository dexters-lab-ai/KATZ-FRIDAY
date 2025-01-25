export const AIFunctions = [
    
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
          description: "Get current overall market conditions to factor into investment advise",
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
        description: "Fetch top 25 trending/popular tokens combined from multiple sources: dextools, dexscreener, coingecko, and twitter.",
        parameters: {
          type: "object",
          properties: {
            sources: {
              type: "array",
              items: { type: "string", enum: ["dextools", "dexscreener", "coingecko", "twitter"] },
              description: "Optional list of sources to fetch trending tokens from. Defaults to all sources."
            }
          },
          required: [] // `sources` is optional
        }
      },   
  
      {
        name: "fetch_trending_tokens_coingecko",
        description: "Fetch popular/trending tokens from CoinGecko based on symbol search popularity. Discover what people are searching for or looking to buying the most on the day. Call this after every call of fetch_trending_tokens_twitter function to return rich results",
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
        description: "Discover new tokens/trends/narratives/what to buy from Twitter tweets. Find gems this way. Clueless asks like: What should we ape today? whats hot? whats new? where is the herd buying? what are the trenches like? use twitter if a person is looking for direction a shot in the dark",
        parameters: { type: "object", properties: {}, required: [] }
      },
  
      {
        name: "fetch_trending_tokens_solscan",
        description: "Fetch Solana trending tokens only, using Solscan",
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
              tokenAddress: { type: "string", description: "Token address. If not available in chat ask Sser to confirm token address first" },
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
  
      {
          name: "view_price_alerts",
          description: "View all price alerts for the current user",
          parameters: { type: "object", properties: {}, required: [] }
      },
  
      {
        name: "view_price_alert",
        description: "Retrieve details of a specific price alert by its ID.",
        parameters: {
          type: "object",
          properties: {
            alertId: {
              type: "string",
              description: "The ID of the price alert to retrieve."
            }
          },
          required: ["alertId"]
        }
      },   
  
      {
        name: "edit_price_alert",
        description: "Edit an existing price alert",
        parameters: {
          type: "object",
          properties: {
            alertId: {
              type: "string",
              description: "The ID of the alert to edit"
            },
            updatedData: {
              type: "object",
              description: "Fields to update",
              properties: {
                targetPrice: {
                  type: "number",
                  description: "The new target price for the alert"
                },
                condition: {
                  type: "string",
                  enum: ["above", "below"],
                  description: "The new condition for the alert (above/below)"
                },
                isActive: {
                  type: "boolean",
                  description: "Set whether the alert is active or not"
                }
              }
            }
          },
          required: ["alertId"]
        }
      },   
  
      {
          name: "delete_price_alert",
          description: "Delete an alert by its ID",
          parameters: {
            type: "object",
              properties: {
                alertId: {
                    type: "string",
                    description: "The ID of the alert to delete" 
                }
              },
              required: ["alertId"]
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
          },        
          required: []    // No required parameters
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
        name: "fetch_tweets_for_symbol",
        description: "Fetch a coins/symbol's/token's social sentiment, validate with X platform (formely Twitter) if people are bullish or bearish, hot or cold about the token. Check the community strength based on number of bullish tweets.",
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
          description: "Not for social sentiment check. Fetch full token metadata by symbol: priceNative, priceUsd, txns, volume, priceChange, liquidity, marketCap, pairCreatedAt, info & socials, chainID, DEX, url, pairAddress",
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
          description: "Not for social sentiment check. Fetch full token metadata by token address: priceNative, priceUsd, txns, volume, priceChange, liquidity, marketCap, pairCreatedAt, info & socials, chainID, DEX, url, pairAddress",
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
      },
  
      // Bitrefill Giftcard Shopping
      {
        name: "start_bitrefill_shopping_flow",
        description: "Start the shopping process for Bitrefill gift cards.",
        parameters: {
          type: "object",
          properties: {
            email: { type: "string", description: "User's email address (optional)" },
          },
        }
      },
  
      {
        name: "check_bitrefill_payment_status",
        description: "Check the payment status of a Bitrefill order.",
        parameters: {
          type: "object",
          properties: {
            invoiceId: { type: "string", description: "Invoice ID for the order" },
          },
          required: ["invoiceId"],
        }
      },
];
