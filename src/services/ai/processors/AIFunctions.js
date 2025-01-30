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
        name: "execute_solana_swap",
        description: `
          Swap tokens on Solana using Jupiter. 
          Provide a valid wallet (Keypair or user ID reference), the input SPL mint, 
          the output SPL mint, and the amount in smallest token units (e.g. lamports).
        `,
        parameters: {
          type: "object",
          properties: {
            wallet: {
              type: "string",
              description: `
                The Solana wallet to use. This could be a direct "Keypair" reference 
                or a user ID from which we can derive the Keypair. 
                If you store the wallet on the server, pass the user ID.`
            },
            inputMint: {
              type: "string",
              description: "SPL mint address of the token to swap from."
            },
            outputMint: {
              type: "string",
              description: "SPL mint address of the token to swap to."
            },
            amount: {
              type: "string",
              description: `
                The amount in smallest token units (e.g. lamports) to swap. 
                For example, if you're swapping 1 SOL, that's 1000000000 lamports.`
            }
          },
          required: ["wallet", "inputMint", "outputMint", "amount"]
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
        description: "Fetch popular/trending tokens from CoinGecko based on token search popularity.  No parameters required to call this.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      
      {
        name: "fetch_trending_tokens_dextools",
        description: "Fetch Ethereum or Base blockchain trending tokens on Dextools.  No parameters required to call this.",
        parameters: { type: "object", properties: {}, required: [] }
      },
  
      {
        name: "fetch_trending_tokens_dexscreener",
        description: "Fetch trending tokens from DexScreener. Solana trending tokens main source. No parameters required to call this.",
        parameters: { type: "object", properties: {}, required: [] }
      },
  
      {
        name: "fetch_trending_tokens_twitter",
        description: "Discover new tokens/trends/narratives/what to buy from Twitter tweets. No parameters required to call this.",
        parameters: { type: "object", properties: {}, required: [] }
      },
  
      {
        name: "fetch_trending_tokens_solscan",
        description: "Fetch Solana trending tokens only, using Solscan. No parameters required to call this.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      
      {
        name: "fetch_market_category_metrics",
        description: "Fetch and analyze key metrics for market categories. No parameters required to call this.",
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
              tokenAddress: { 
                type: "string", 
                description: `When processing function call results, extract only the wallet address or token address from returned URLs. Do not use full links; extract only the address part from the URL.
              - If an EVM address, it will be a 42-character hexadecimal string (0xB24C..)
              - If a Solana address, it will be a Base58 string (typically 32-44 characters eg HwQfC1W3Fuvp8Cqay).
              - If any other blockchain format is present, ignore it unless explicitly required.
              - Example:
                  - Given: "https://etherscan.io/token/0x123456789abcdef..."
                  - Extracted: "0x123456789abcdef"
                  - Given: "https://solscan.io/token/HwQfC1W3Fuvp8Cqay..."
                  - Extracted: "HwQfC1W3Fuvp8Cqay..."
              `},
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
        description: "Search the internet for the latest information, news, and financial market updates using the Brave Search API.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search term for internet queries, e.g., 'current events' or 'BTC price'."
            },
            queries: {
              type: "array",
              items: { type: "string" },
              description: "Array of search terms for batch processing, e.g., ['BTC', 'FTM', 'BNB']."
            }
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
              description: "Use 0 unless specified by user. Minimum number of likes a tweet must have to be included",
              default: 0
            },
            minRetweets: {
              type: "number",
              description: "Use 0 unless specified by user. Minimum number of retweets a tweet must have to be included",
              default: 0
            },
            minReplies: {
              type: "number",
              description: "Use 0 unless specified by user. Minimum number of replies a tweet must have to be included",
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
        description: "Fetch token prices using DexScreener. Use for tokens with known activity on DexScreener.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Token symbol or address for single query, e.g., 'BTC' or '0xabc...'."
            },
            queries: {
              type: "array",
              items: { type: "string" },
              description: "Array of token symbols or addresses for batch processing."
            }
          },
          required: ["query"]
        }
      },
  
      {
        name: "token_price_coingecko",
        description: "Fetch token prices from CoinGecko as the primary source. Use for most token queries.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Token symbol or address for single query, e.g., 'BTC' or '0xabc...'."
            },
            queries: {
              type: "array",
              items: { type: "string" },
              description: "Array of token symbols or addresses for batch processing."
            }
          },
          required: ["query"]
        }
      },
  
      // Token Analysis Functions
      {
        name: "analyze_token_by_symbol",
        description: "Fetch token metadata by symbol including price, volume, liquidity, and social info.",
        parameters: {
          type: "object",
          properties: {
            tokenSymbol: {
              type: "string",
              description: "Token symbol, e.g., 'BTC'."
            },
            tokenSymbols: {
              type: "array",
              items: { type: "string" },
              description: "Array of token symbols for batch processing."
            }
          },
          required: ["tokenSymbol"]
        }
      },
  
      {
        name: "analyze_token_by_address",
        description: "Fetch token metadata by address including price, volume, liquidity, and social info.",
        parameters: {
          type: "object",
          properties: {
            tokenAddress: {
              type: "string",
              description: "Token address, e.g., '0xabc...'."
            },
            tokenAddresses: {
              type: "array",
              items: { type: "string" },
              description: "Array of token addresses for batch processing."
            }
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

      // Wormhole Bridging: Solana, Base, Avalanche, Arbitrum - ETH is dead to me...
      {
        name: "bridge_tokens",
        description: `
          Perform a cross-chain bridging of tokens among these mainnet chains:
          [solana, base, avalanche, arbitrum].
          Support only [NATIVE, wSOL, wETH, USDC].
          The bridging logic will pick the correct addresses for wSOL or wETH 
          based on chain, or treat "NATIVE" accordingly (SOL, ETH, AVAX, etc.).
        `,
        parameters: {
          type: "object",
          properties: {
            sourceChain: {
              type: "string",
              enum: ["solana", "ethereum", "avalanche"],
              description: "The chain to bridge from (mainnet)."
            },
            targetChain: {
              type: "string",
              enum: ["solana", "ethereum", "avalanche"],
              description: "The chain to bridge to (mainnet)."
            },
            tokenSymbol: {
              type: "string",
              enum: ["NATIVE", "wSOL", "wETH", "USDC"],
              description: `
                Which token to bridge? 
                - NATIVE means the main chain asset: SOL (Solana), ETH (Base/Arbitrum), AVAX (Avalanche).
                - wSOL/wETH are wrapped versions on certain chains.
                - USDC is on all four chains in mainnet form.
              `
            },
            amount: {
              type: "string",
              description: "Amount of tokens to bridge, as a decimal string"
            },
            recipientAddress: {
              type: "string",
              description: `
                The address on targetChain to receive bridged tokens. 
                For Solana, expect a base58 address. 
                For EVM (Base, Avalanche, Arbitrum), expect a 0x address.
              `
            }
          },
          required: [
            "sourceChain",
            "targetChain",
            "tokenSymbol",
            "amount",
            "recipientAddress"
          ]
        }
      },

      // Fetch bridge receipts from wormhole
      {
        name: "fetch_bridge_receipts",
        description: "Fetch the user's bridging records from DB, optionally limit the number of results.",
        parameters: {
          type: "object",
          properties: {
            telegramId: {
              type: "string",
              description: "User's telegram ID"
            },
            limit: {
              type: "number",
              description: "Number of records to return (default 10)"
            }
          },
          required: ["telegramId"]
        }
      },
      
];
