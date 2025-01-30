// Core imports
import axios from 'axios';
import { EventEmitter } from 'events';
import { ErrorHandler } from '../../../core/errors/index.js';
import { retryManager } from '../../queue/RetryManager.js';

// AI Services
import { FlowManager } from '../flows/FlowManager.js';

// External Services
import { braveSearch } from '../../brave/BraveSearchService.js';
import { shopifyService } from '../../shopify/ShopifyService.js';
import { dextools } from '../../dextools/index.js';
import { timedOrderService } from '../../timedOrders.js';
import { priceAlertService } from '../../priceAlerts.js';
import { walletService } from '../../wallet/index.js';
import { twitterService } from '../../twitter/index.js';
import { solanaPayService } from '../../solanaPay/SolanaPayService.js';
import { butlerService } from '../../butler/ButlerService.js';
import { dbAIInterface } from '../../db/DBAIInterface.js';
import { gemsService } from '../../gems/GemsService.js';
import { flipperMode } from '../../pumpfun/FlipperMode.js';
import { dexscreener } from '../../dexscreener/index.js';

export class IntentProcessHandler {
    constructor() {
        this.flowManager = new FlowManager();
        this.activeFlows = new Map();

        this.axiosInstance = axios.create({
            baseURL: 'https://api.coingecko.com/api/v3',
            headers: {
              'accept': 'application/json',
              'x-cg-demo-api-key': 'CG-LFDubYkjAMbfAkjQ4NsNjVeV'
            }
        });
        this.marketDataCache = {
            data: null,
            timestamp: 0,
            ttl: 5 * 60 * 1000 // 5 minutes cache
        };

        this.categoryCache = {
          data: null,
          timestamp: 0,
          ttl: 10 * 60 * 1000 // 10 minutes cache for market categories
        };
    }

    // Handlers to intents
    isDemoRequest(text) {
        const demoPatterns = [
        /show.*demo/i,
        /demonstrate/i,
        /showcase/i,
        /example.*capability/i
        ];
        return demoPatterns.some(pattern => pattern.test(text));
    }
    
    async handleDemoMode(text) {
        try {
        const demo = await demoManager.runRandomDemo();
        return {
            text: this.formatDemoResponse(demo),
            type: 'demo'
        };
        } catch (error) {
        await ErrorHandler.handle(error);
        throw error;
        }
    }
    
    async handleTokenAddress(address, userId) {
      try {
        // Validate address format
        const network = this.detectNetwork(address);
        if (!network) {
          return { 
            message: "Invalid token or wallet address format.", 
            actions: [] 
          };
        }
    
        // Retrieve token information
        const tokenInfo = await retryManager.executeWithRetry(
          async () => await dexscreener.getTokenInfoByAddress(address)
        );
    
        if (!tokenInfo) {
          return { 
            message: "Token information not found.", 
            actions: [] 
          };
        }
    
        // Get available actions
        const actions = await this.getAvailableActions(network, address, userId);
    
        // Add Twitter sentiment as a suggestion
        actions.push({
          type: "get_sentiment",
          name: "📊 Get Sentiment",
          description: "Fetch Twitter sentiment using the token's symbol."
        });
    
        // If symbol exists, fetch sentiment analysis
        let sentiment = "NA";
        if (tokenInfo.symbol) {
          sentiment = await twitterService.searchTweets(userId, tokenInfo.symbol);
        }
    
        // Format response
        return {
          network,
          actions,
          tokenInfo: {
            symbol: tokenInfo.symbol,
            price: tokenInfo.price || "Unknown",
            sentiment
          },
          message: this.formatResponse(tokenInfo, actions)
        };
      } catch (error) {
        await ErrorHandler.handle(error);
        return { 
          message: "Failed to process the token or wallet address.", 
          actions: [] 
        };
      }
    }

    detectNetwork(address) {
        // Detect network from address format
        if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return 'ethereum'; // or 'base' - will need additional logic
        } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
            return 'solana';
        }
        return null;
    }
    
    async getAvailableActions(network, address, userId) {
    const actions = [];

    try {
        // Check if user has wallet for this network
        const hasWallet = await this.userHasWallet(userId, network);

        // Add available actions
        actions.push({
        type: 'analyze_token_by_address',
        name: '🔍 Scan Token',
        description: 'Analyze token metrics and risks'
        });

        if (hasWallet) {
        actions.push({
            type: 'buy',
            name: '💰 Buy Token',
            description: 'Purchase this token'
        });

        const balance = await this.getTokenBalance(userId, network, address);
        if (balance > 0) {
            actions.push({
            type: 'sell',
            name: '💱 Sell Token',
            description: `Sell your ${balance} tokens`
            });
        }

        if (network === 'solana') {
            actions.push({
            type: 'solana_pay',
            name: '💸 Solana Pay',
            description: 'Send/receive using Solana Pay'
            });
        } else {
            actions.push({
            type: 'transfer',
            name: '📤 Transfer',
            description: 'Send tokens to another address'
            });
        }
        }

        return actions;
    } catch (error) {
        await ErrorHandler.handle(error);
        return actions; // Re
    }
    }

    async userHasWallet(userId, network) {
        try {
          const wallets = await walletService.getWallets(userId);
          return wallets.some(w => w.network === network);
        } catch (error) {
          return false;
        }
    }

    hasRiskLimitPattern(text) {
      const riskPatterns = [
        /risk\s*(?:less than|under|max|maximum)?\s*([\d.]+)%/i,
        /only\s*([\d.]+)%\s*of\s*(?:my)?\s*portfolio/i,
        /use\s*([\d.]+)%\s*of\s*(?:my)?\s*balance/i,
        /limit\s*(?:to|at)?\s*([\d.]+)%/i
      ];
  
      return riskPatterns.some(pattern => pattern.test(text));
    }
    
    async getTokenBalance(userId, network, address) {
        try {
            const wallets = await walletService.getWallets(userId);
            const wallet = wallets.find(w => w.network === network);
            if (!wallet) return 0;
        
            const balance = await walletService.getTokenBalance(
            userId,
            wallet.address,
            address
            );
            return balance;
        } catch (error) {
            return 0;
        }
    }
    
    formatResponse(token, actions) {
    return `*Token Detected* 🪙\n\n` +
            `Symbol: ${token.symbol}\n` +
            `Network: ${token.network}\n` +
            `Price: $${token.price || 'Unknown'}\n\n` +
            `*Available Actions:*\n` +
            actions.map(action => 
                `• ${action.name}: ${action.description}`
            ).join('\n');
    }
    
    formatDemoResponse(demo) {
        return `${demo.title}\n\n` +
            `${demo.description}\n\n` +
            this.formatDemoResults(demo);
    }
    
    formatDemoResults(demo) {
        switch (demo.type) {
        case 'twitter_search':
            return demo.results.map(tweet =>
            `🐦 @${tweet.author}:\n${tweet.text}\n` +
            `❤️ ${tweet.stats.likes} | 🔄 ${tweet.stats.retweets}\n`
            ).join('\n');
    
        case 'token_analysis':
            return demo.results;
    
        case 'news_search':
            return demo.results.map(article =>
            `📰 ${article.title}\n${article.description}\n`
            ).join('\n');
    
        case 'market_analysis':
            return Object.entries(demo.results).map(([chain, tokens]) =>
            `*${chain}*\n` +
            tokens.map(token => `• ${token.symbol}: $${token.price}`).join('\n')
            ).join('\n\n');
    
        default:
            return JSON.stringify(demo.results, null, 2);
        }
    }

    async performInternetSearch(text) {
      try {
        // Log search attempt
        console.log('🔍 Performing internet search:', text);
    
        // Execute search using BraveSearchService
        const { news, video } = await braveSearch.search(text);
    
        // Build response text
        const newsSection = news
          ? `📰 *News Result*\n` +
            `• *Title:* ${news.title}\n` +
            `• *Description:* ${news.description}\n` +
            `• [Read More](${news.url})\n\n`
          : `📰 *No relevant news found.*\n\n`;
    
        const videoSection = video
          ? `🎥 *Video Result*\n` +
            `• *Title:* ${video.title}\n` +
            `• *Description:* ${video.description}\n` +
            `• [Watch Video](${video.url})\n\n`
          : `🎥 *No relevant videos found.*\n\n`;
    
        // Combine sections into final response
        const response = {
          text: `*Search Results* 🔍\n\n${newsSection}${videoSection}`,
          type: 'search',
          parse_mode: 'Markdown'
        };
    
        console.log('✅ Search completed successfully:', response);
        return response;
      } catch (error) {
        console.error('❌ Search error:', error);
        await ErrorHandler.handle(error);
    
        return {
          text: "I encountered an error performing the search. Please try again.",
          type: 'error'
        };
      }
    }      

    async getTokenInfoFromCoinGecko(symbol) {
      try {
        const sanitizedSymbol = symbol.trim().toLowerCase();
    
        const { data: searchData } = await this.axiosInstance.get('/search', {
          params: { query: sanitizedSymbol },
        });
    
        const token = searchData.coins.find(coin => coin.symbol.toLowerCase() === sanitizedSymbol);
    
        if (!token) {
          console.warn(`Token with symbol '${symbol}' not found on CoinGecko.`);
          return null;
        }
    
        const { data: tokenDetails } = await this.axiosInstance.get(`/coins/${token.id}`, {
          params: {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: true,
            developer_data: false,
            sparkline: false,
          },
        });
    
        let description = tokenDetails.description.en || "No description available.";
        description = description.split('\n')[0].trim();
        if (description.length > 250) {
          description = description.slice(0, 250).trim() + "...";
        }
    
        return {
          general: {
            id: tokenDetails.id,
            name: tokenDetails.name,
            symbol: tokenDetails.symbol.toUpperCase(),
            description,
            categories: tokenDetails.categories || [],
            image: tokenDetails.image.large || null,
            website: tokenDetails.links.homepage?.[0] || null,
            explorers: tokenDetails.links.blockchain_site.filter(url => url) || [],
            socials: {
              twitter: tokenDetails.links.twitter_screen_name
                ? `https://twitter.com/${tokenDetails.links.twitter_screen_name}`
                : null,
              telegram: tokenDetails.links.telegram_channel_identifier
                ? `https://t.me/${tokenDetails.links.telegram_channel_identifier}`
                : null,
            },
          },
          market: {
            currentPriceUsd: tokenDetails.market_data.current_price?.usd || null,
            marketCapUsd: tokenDetails.market_data.market_cap?.usd || null,
            volume24hUsd: tokenDetails.market_data.total_volume?.usd || null,
            priceChangePercentage24h: tokenDetails.market_data.price_change_percentage_24h || null,
            priceChangePercentage7d: tokenDetails.market_data.price_change_percentage_7d || null,
            priceChangePercentage30d: tokenDetails.market_data.price_change_percentage_30d || null,
            allTimeHighUsd: tokenDetails.market_data.ath?.usd || null,
            allTimeHighDate: tokenDetails.market_data.ath_date?.usd || null,
            allTimeLowUsd: tokenDetails.market_data.atl?.usd || null,
            allTimeLowDate: tokenDetails.market_data.atl_date?.usd || null,
          },
          sentiment: {
            upvotesPercentage: tokenDetails.sentiment_votes_up_percentage || null,
            downvotesPercentage: tokenDetails.sentiment_votes_down_percentage || null,
          },
        };
      } catch (error) {
        console.error('CoinGecko fetch error:', error.message);
        await ErrorHandler.handle(error);
        return null; // Ensure null is returned on failure
      }
    } 
    
    /**
     * Fetch market categories from CoinGecko with caching
     * @returns {Promise<Array>} List of category IDs
     */
    async fetchMarketCategories() {
      try {
        // Check if cache is valid
        if (
          this.categoryCache.data &&
          Date.now() - this.categoryCache.timestamp < this.categoryCache.ttl
        ) {
          return this.categoryCache.data;
        }

        // Fetch market categories
        const response = await this.axiosInstance.get('/coins/categories/list');
        const categoryIds = response.data.map(category => category.category_id);

        // Cache the result
        this.categoryCache = {
          data: categoryIds,
          timestamp: Date.now()
        };

        console.log('Fetched Market Categories:', categoryIds);
        return categoryIds;
      } catch (error) {
        console.error('Error fetching market categories:', error.message);
        throw new Error('Failed to fetch market categories');
      }
    }

    /**
     * Fetch market categories and format key data
     * @returns {Promise<Array>} Formatted market category metrics
     */
    async fetchMarketCategoryMetrics() {
      try {
        const response = await this.axiosInstance.get('/coins/categories', {
          params: { order: 'name_asc' }
        });
    
        const categories = response.data || [];
    
        // Limit the number of categories to 20
        const limitedCategories = categories.slice(0, 20);
    
        // Format key metrics
        return limitedCategories.map(category => ({
          id: category.id,
          name: category.name,
          marketCap: category.market_cap || "N/A",
          marketCapChange24h: category.market_cap_change_24h || "N/A",
          volume24h: category.volume_24h || "N/A",
          description: category.content?.substring(0, 100) || "No description available"
        }));
      } catch (error) {
        console.error("Error fetching market category metrics:", error.message);
        return [];
      }
    }    

    /**
     * Fetch coins and details by category
     * @param {string} categoryId - The category ID to search for
     * @returns {Promise<Object>} Coins and category details
     */
    async fetchCoinsByCategory(categoryId) {
      if (!categoryId) throw new Error('Category ID is required');
    
      try {
        const response = await this.axiosInstance.get('/search', {
          params: { query: categoryId }
        });
    
        const categoryInfo = response.data.categories?.find(
          category => category.id === categoryId
        ) || { id: categoryId, name: 'Unknown Category' };
    
        let coins = response.data.coins || [];
    
        // Log the category info and coins fetched
        console.log(`Category Info for '${categoryId}':`, categoryInfo);
        console.log(`Coins in Category '${categoryId}':`, coins);
    
        // 1) Remove large images (keeping only the 'thumb' image or no image at all)
        coins = coins.map(coin => {
          if (coin.large) {
            delete coin.large; // Remove the 'large' image if it exists
          }
          return coin;
        });
    
        // 2) Create a string summary of the coin data (without large images)
        let coinDetails = coins.map(coin => {
          return `${coin.name} (${coin.symbol}): Rank ${coin.market_cap_rank} - [More Info](https://www.coingecko.com/en/coins/${coin.id})`;
        }).join("\n");
    
        // 3) Check if the combined string exceeds the Telegram limit
        const maxTelegramLength = 4096;
        if (coinDetails.length > maxTelegramLength) {
          console.warn(`⚠️ Telegram message is too long. Trimming... raw length: `, coinDetails.length);
          coinDetails = coinDetails.slice(0, maxTelegramLength - 200) + "...";
        }
    
        // 4) Return the result to be sent to the Telegram bot
        return {
          category: categoryInfo,
          coins: coinDetails
        };
        
      } catch (error) {
        console.error(`Error fetching coins for category '${categoryId}':`, error.message);
        throw new Error(`Failed to fetch coins for category '${categoryId}'`);
      }
    }    

    async getCoinGeckoTrendingTokens() {
      try {
        // Fetch trending tokens
        const { data } = await this.axiosInstance.get('/search/trending');
    
        // Fetch details for each token
        const trendingTokens = await Promise.all(
          data.coins.map(async (token) => {
            const { item } = token;
    
            // Fetch detailed token info
            const { data: tokenDetails } = await this.axiosInstance.get(`/coins/${item.id}`, {
              params: {
                localization: false,
                tickers: false,
                market_data: true,
                community_data: false,
                developer_data: false,
                sparkline: false,
              },
            });
    
            return {
              id: item.id,
              name: item.name,
              symbol: item.symbol.toUpperCase(),
              // marketCapRank: item.market_cap_rank,
              priceUsd: tokenDetails.market_data.current_price.usd || 0,
              volumeUsd: tokenDetails.market_data.total_volume.usd || 0,
              // marketCapUsd: tokenDetails.market_data.market_cap.usd || 0,
              score: item.score,
              detailsUrl: `https://www.coingecko.com/en/coins/${item.id}`,
            };
          })
        );
    
        return trendingTokens;
      } catch (error) {
        console.error('Error fetching trending tokens:', error.message);
        await ErrorHandler.handle(error);
        return [];
      }
    }         
    
    // Result formmaters before output
    formatSingleProduct(product) {
        return {
        text: [
            `*${product.title}* 🛍️\n`,
            product.description ? `${product.description}\n` : '',
            `💰 ${product.currency} ${parseFloat(product.price).toFixed(2)}`,
            `${product.available ? '✅ In Stock' : '❌ Out of Stock'}`,
            `\n🔗 [View Product](${product.url})`,
            `\nReference: \`product_${product.id}\``, // For follow-up commands
        ].filter(Boolean).join('\n'),
        type: 'single_product',
        parse_mode: 'Markdown',
        product: {
            ...product,
            reference: `product_${product.id}`
        },
        metadata: {
            timestamp: new Date().toISOString()
        }
        };
    }
    
    formatShopifyResults(products) {
        const formattedProducts = products.map(product => ({
        ...product,
        reference: `product_${product.id}`
        }));
    
        const message = [
        '*KATZ Store Products* 🛍️\n',
        ...formattedProducts.map((product, i) => [
            `${i + 1}. *${product.title}*`,
            `💰 ${product.currency} ${parseFloat(product.price).toFixed(2)}`,
            product.description ? `${product.description.slice(0, 100)}...` : '',
            `${product.available ? '✅ In Stock' : '❌ Out of Stock'}`,
            `🔗 [View Product](${product.url})`,
            `Reference: \`${product.reference}\`\n`
        ].filter(Boolean).join('\n'))
        ].join('\n');
    
        return {
        text: message,
        type: 'product_list',
        parse_mode: 'Markdown',
        products: formattedProducts,
        metadata: {
            total: products.length,
            timestamp: new Date().toISOString()
        }
        };
    }
    
    async handleProductReference(userId, reference) {
        const productId = reference.replace('product_', '');
        const product = await shopifyService.getProductById(productId);
        
        if (!product) {
        throw new Error('Product not found');
        }
        
        return this.formatSingleProduct(product);
    }

    // Market Overview Handlers
    async getMarketConditions() {
        try {
          // Check cache first
          if (this.isMarketDataCacheValid()) {
            return this.marketDataCache.data;
          }
    
          // Fetch both global market data and DeFi data
          const [marketData, defiData] = await Promise.all([
            this.axiosInstance.get('/global'),
            this.axiosInstance.get('/global/decentralized_finance_defi')
          ]);
    
          // Format and combine the data
          const conditions = {
            overview: {
              total_market_cap_usd: marketData.data.data.total_market_cap.usd,
              total_volume_usd: marketData.data.data.total_volume.usd,
              market_cap_change_24h: marketData.data.data.market_cap_change_percentage_24h_usd,
              active_cryptocurrencies: marketData.data.data.active_cryptocurrencies,
              active_markets: marketData.data.data.markets
            },
            dominance: {
              ...marketData.data.data.market_cap_percentage
            },
            defi: {
              total_value_locked: defiData.data.data.defi_market_cap,
              defi_dominance: defiData.data.data.defi_dominance,
              top_protocol: defiData.data.data.top_coin_name,
              top_protocol_dominance: defiData.data.data.top_coin_defi_dominance,
              eth_market_cap: defiData.data.data.eth_market_cap,
              trading_volume_24h: defiData.data.data.trading_volume_24h
            },
            market_sentiment: this.calculateMarketSentiment(marketData.data.data),
            timestamp: new Date().toISOString()
          };
    
          // Update cache
          this.marketDataCache = {
            data: conditions,
            timestamp: Date.now(),
            ttl: 5 * 60 * 1000
          };
    
          return conditions;
        } catch (error) {
          await ErrorHandler.handle(error);
          console.error('Error fetching market conditions:', error);
          
          // Return cached data if available, even if expired
          if (this.marketDataCache.data) {
            return {
              ...this.marketDataCache.data,
              stale: true
            };
          }
          
          // Return minimal data if no cache available
          return {
            overview: {
              total_market_cap_usd: 0,
              market_cap_change_24h: 0,
              active_cryptocurrencies: 0,
              active_markets: 0
            },
            error: 'Failed to fetch market data',
            timestamp: new Date().toISOString()
          };
        }
    }
    
    isMarketDataCacheValid() {
        return (
          this.marketDataCache.data &&
          Date.now() - this.marketDataCache.timestamp < this.marketDataCache.ttl
        );
    }
    
    calculateMarketSentiment(data) {
        // Calculate market sentiment based on various metrics
        const metrics = {
            cap_change: data.market_cap_change_percentage_24h_usd,
            btc_dom: data.market_cap_percentage?.btc || 0,
            eth_dom: data.market_cap_percentage?.eth || 0
        };

        let sentiment = 'neutral';
        let confidence = 0.5;

        // Basic sentiment logic
        if (metrics.cap_change > 5) {
            sentiment = 'bullish';
            confidence = Math.min(0.5 + (metrics.cap_change / 20), 0.9);
        } else if (metrics.cap_change < -5) {
            sentiment = 'bearish';
            confidence = Math.min(0.5 + (Math.abs(metrics.cap_change) / 20), 0.9);
        }

        // Adjust based on BTC dominance changes
        const btcDomChange = metrics.btc_dom - 40; // 40% as baseline
        if (Math.abs(btcDomChange) > 5) {
            confidence += 0.1;
        }

        return {
            overall: sentiment,
            confidence: parseFloat(confidence.toFixed(2)),
            metrics
        };
    }

    formatChatHistory(history) {
        if (!history?.length) return 'No chat history available.';

        return history.map((msg, i) => {
        const role = msg.role === 'user' ? '👤' : '🤖';
        const content = msg.content.trim();
        return `${role} ${content}`;
        }).join('\n\n');
    }

    formatSearchResults(results) {
        if (!results?.length) return 'No results found.';

        const formatted = results.map((result, i) => [
        `${i + 1}. *${result.title}*`,
        `${result.description}`,
        `[Read more](${result.url})`,
        '' // Spacing
        ].join('\n'));

        return {
        text: formatted.join('\n'),
        type: 'search_results',
        parse_mode: 'Markdown',
        metadata: {
            count: results.length,
            timestamp: new Date().toISOString()
        }
        };
    }

    formatPaymentDetails(payment) {
        return {
        text: [
            '*Payment Details* 💰\n',
            `Amount: ${payment.amount} ${payment.currency}`,
            `Recipient: \`${payment.recipient}\``,
            payment.label ? `Label: ${payment.label}` : '',
            '\nScan QR code or click payment link to complete purchase.'
        ].filter(Boolean).join('\n'),
        type: 'payment',
        parse_mode: 'Markdown',
        payment_url: payment.paymentUrl,
        qr_code: payment.qrCode,
        reference: payment.reference
        };
    }
}