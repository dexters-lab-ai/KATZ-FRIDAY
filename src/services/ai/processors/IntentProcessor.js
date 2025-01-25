import { EventEmitter } from 'events';
import { Telegraf } from 'telegraf';
import { networkState } from '../../networkState.js';
import { ErrorHandler } from '../../../core/errors/index.js';
import { IntentProcessHandler } from '../handlers/IntentProcessHandler.js';
import { validateParameters, getParameterConfig, formatParameters } from '../config/parameterConfig.js';

// Service imports
import { addressBookService } from '../../addressBook/AddressBookService.js';
import { tradeService } from '../../trading/TradeService.js';
import { dextools } from '../../dextools/index.js';
import { trendingService } from '../../trending/TrendingService.js';
import { gemsService } from '../../gems/GemsService.js';
import { twitterService } from '../../twitter/index.js';
import { flipperMode } from '../../pumpfun/FlipperMode.js';
import { priceAlertService } from '../../priceAlerts.js';
import { timedOrderService } from '../../timedOrders.js';
import { walletService } from '../../wallet/index.js';
import { SolanaSwapService } from '../../trading/SolanaSwapService.js';
import { tokenApprovalService } from '../../tokens/TokenApprovalService.js';
import { solanaPayService } from '../../solanaPay/SolanaPayService.js';
import { shopifyService } from '../../shopify/ShopifyService.js';
import { butlerService } from '../../butler/ButlerService.js';
import { dbAIInterface } from '../../db/DBAIInterface.js';
import { contextManager } from '../ContextManager.js';
import { dexscreener } from '../../dexscreener/index.js';
import BitrefillService from "../../bitrefill/BitrefillService.js";

export class IntentProcessor extends EventEmitter {
  constructor(bot) {
    super();
    this.bot = bot; 
    this.initialized = false;
    this.intentProcessHandler = new IntentProcessHandler(); 
    this.dextools = dextools;
    this.dexscreener = dexscreener;
    this.bitrefillService = new BitrefillService(bot);
    this.solanaSwapService = new SolanaSwapService();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize required services
      await Promise.all([
        tradeService.initialize(),
        shopifyService.initialize(),
        solanaPayService.initialize(),
        butlerService.initialize(),
      ]);

      this.initialized = true;
      console.log('✅ IntentProcessor initialized');
    } catch (error) {
      console.error('❌ Error initializing IntentProcessor:', error);
      throw error;
    }
  }

  // Helper methods for intent execution
  async swapTokens(params) {
    // Validate parameters
    if (!params.wallet || !params.inputMint || !params.outputMint || !params.amount) {
        throw new Error('Missing required trade parameters: wallet, inputMint, outputMint, and amount are mandatory.');
    }

    try {
        console.log('🔄 Initiating token swap...');

        // Pass parameters to SolanaSwapService for processing
        const swapResult = await this.solanaSwapService.startJupiterSwap({
            wallet: params.wallet,            // User's wallet (Keypair instance)
            inputMint: params.inputMint,      // Mint address of the token to swap
            outputMint: params.outputMint,    // Mint address of the token to receive
            amount: params.amount,            // Amount to swap in smallest token units
        });

        console.log('✅ Swap completed successfully:', swapResult);
        return { swapResult };
    } catch (error) {
        console.error('❌ Error during token swap:', error.message);
        throw new Error('Failed to complete token swap.');
    }
  }

  async createPriceAlert(userId, chatId, params) {
    let logMessageId = null;
  
    const log = async (chatId, message) => {
      if (!chatId) return; // Skip logging if chatId is unavailable
      try {
        if (!logMessageId) {
          const sentMessage = await this.bot.sendMessage(chatId, message);
          logMessageId = sentMessage.message_id;
        } else {
          await this.bot.telegram.editMessageText(chatId, logMessageId, null, message);
        }
      } catch (err) {
        console.warn('⚠️ Error logging message:', err.message);
      }
    };
  
    try {
  
      // Step 1: Log the start of the operation
      await log(chatId, '🚀 Creating price alert...');
  
      // Step 2: Determine the network and token info
      const tokenData = await this.getTokenNetwork(params.tokenAddress);
      if (!tokenData) {
        throw new Error('Unable to determine the network or find token information.');
      }
  
      const { network, tokenInfo } = tokenData;
      await log(chatId, `✅ Network determined: ${network}\n\nToken Info:\n- Symbol: ${tokenInfo.symbol}\n- Address: ${tokenInfo.address}`);
  
      // Step 3: Get user wallet address
      const wallets = await walletService.getWalletsByNetwork(userId, network);
      if (!wallets.length) {
        throw new Error(`No wallets found for network ${network}. Please add a wallet for this network.`);
      }
  
      const walletAddress = wallets[0].address;
      await log(chatId, `✅ Using wallet: ${walletAddress}`);
  
      // Step 4: Validate and prepare alert data
      if (!params.targetPrice || typeof params.targetPrice !== 'number' || params.targetPrice <= 0) {
        throw new Error('Invalid target price. It must be a positive number.');
      }
  
      if (!['above', 'below'].includes(params.condition)) {
        throw new Error('Invalid condition. Must be "above" or "below".');
      }
  
      const alertData = {
        tokenAddress: params.tokenAddress,
        network,
        targetPrice: params.targetPrice,
        condition: params.condition,
        walletType: 'internal', // Default to internal wallet type
        swapAction: params.swapAction || { enabled: false }, // Default swapAction structure
        walletAddress,
      };
  
      // Step 5: Create the price alert
      const alert = await priceAlertService.createAlert(userId, alertData);
  
      await log(chatId, `🎉 Price alert created successfully!\nToken: ${tokenInfo.symbol}\nTarget Price: ${params.targetPrice}\nCondition: ${params.condition}`);
  
      // Schedule deletion of the log message after 30 seconds
      setTimeout(async () => {
        try {
          if (logMessageId) {
            await this.bot.telegram.deleteMessage(chatId, logMessageId);
          }
        } catch (err) {
          console.warn('⚠️ Could not delete log message:', err.message);
        }
      }, 30000);
  
      return alert;
    } catch (error) {
      const chatId = params.chatId;
      await log(chatId, `❌ Error: ${error.message}`);
  
      // Schedule deletion of the error log message after 30 seconds
      setTimeout(async () => {
        try {
          if (logMessageId) {
            await this.bot.telegram.deleteMessage(chatId, logMessageId);
          }
        } catch (err) {
          console.warn('⚠️ Could not delete error log message:', err.message);
        }
      }, 30000);
  
      throw error;
    }
  }

  async viewPriceAlerts() {    
    return await priceAlertService.viewAlerts();
  }

  /**
   * Fetch a specific price alert by its ID.
   * @param {string} alertId - The ID of the alert to fetch.
   * @returns {Object} - The price alert details.
   */
  async getPriceAlert(alertId) {
    try {
      if (!alertId) {
        throw new Error("Alert ID is required");
      }

      const alert = await priceAlertService.getAlertById(alertId);

      if (!alert) {
        throw new Error(`Alert with ID ${alertId} not found`);
      }

      return alert; // Return the full alert object
    } catch (error) {
      console.error("Error fetching price alert:", error.message);
      throw error;
    }
  }

  async editPriceAlert(alertId, updatedData) {
    try {
      if (!alertId) {
        throw new Error("Alert ID is required");
      }
  
      if (!updatedData || Object.keys(updatedData).length === 0) {
        throw new Error("Updated data is required to edit the alert");
      }
  
      const updatedAlert = await priceAlertService.editAlert(alertId, updatedData);
  
      if (!updatedAlert) {
        throw new Error(`Alert with ID ${alertId} not found or could not be updated`);
      }
  
      return updatedAlert; // Return the updated alert
    } catch (error) {
      console.error("Error editing price alert:", error.message);
      throw error;
    }
  }  

  /**
   * Delete a specific price alert by its ID.
   * @param {string} alertId - The ID of the alert to delete.
   * @returns {Object} - Confirmation of the deletion.
   */
  async deletePriceAlert(alertId) {
    try {
      if (!alertId) {
        throw new Error("Alert ID is required");
      }

      const result = await priceAlertService.deleteAlert(alertId);

      if (!result.success) {
        throw new Error(`Failed to delete alert with ID ${alertId}`);
      }

      return result; // Return success response with deleted alert ID
    } catch (error) {
      console.error("Error deleting price alert:", error.message);
      throw error;
    }
  }

  async getTokenNetwork(input) {
    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // Solana address regex
    const evmRegex = /^0x[a-fA-F0-9]{40}$/; // EVM address regex

    try {
      // Step 1: Check if the input is a token address
      if (solanaRegex.test(input)) {
        console.log(`🔍 Detected Solana address: ${input}`);
        const solanaToken = await this.dexscreener.getTokenInfoByAddress(input, 'solana');
        if (solanaToken) {
          return { network: 'solana', tokenInfo: solanaToken };
        }
      }

      if (evmRegex.test(input)) {
        console.log(`🔍 Detected EVM address: ${input}`);

        // Query Ethereum
        const ethereumToken = await this.dexscreener.getTokenInfoByAddress(input, 'ethereum').catch(() => null);
        if (ethereumToken) {
          return { network: 'ethereum', tokenInfo: ethereumToken };
        }

        // Query Base
        const baseToken = await this.dexscreener.getTokenInfoByAddress(input, 'base').catch(() => null);
        if (baseToken) {
          return { network: 'base', tokenInfo: baseToken };
        }
      }

      // Step 2: If it's not an address, treat it as a symbol
      console.log(`🔍 Input is not a recognized address. Treating as symbol: ${input}`);
      const tokenInfo = await this.getTokenInfoBySymbol(input);
      if (tokenInfo && !tokenInfo.error) {
        const network = this.determineNetworkForSymbol(tokenInfo);
        if (network) {
          console.log(`✅ Network determined for symbol: ${network}`);
          return { network, tokenInfo };
        }
      }

      console.warn(`❌ No token found for input: ${input}`);
      return null;
    } catch (error) {
      console.error('❌ Error in getTokenNetwork:', error);
      throw error;
    }
  } 
  
  determineNetworkForSymbol(tokenInfo) {
    const networkHints = {
      ethereum: ['eth', 'ethereum'],
      base: ['base'],
      solana: ['sol', 'solana'],
    };
  
    const symbol = tokenInfo.symbol.toLowerCase();
    for (const [network, hints] of Object.entries(networkHints)) {
      if (hints.some((hint) => symbol.includes(hint) || tokenInfo.network?.toLowerCase() === network)) {
        return network;
      }
    }
  
    console.warn('⚠️ Could not determine network for token symbol:', symbol);
    return null;
  }  

  async createTimedOrder(params, network) {
    return await timedOrderService.createOrder(params.userId, {
      tokenAddress: params.tokenAddress,
      action: params.action,
      amount: params.amount,
      executeAt: params.timing,
      network
    });
  }

  async handleTokenApproval(params, network) {
    return await tokenApprovalService.approveToken(network, {
      tokenAddress: params.tokenAddress,
      spenderAddress: params.spenderAddress,
      amount: params.amount,
      walletAddress: params.walletAddress
    });
  }

  async handleTokenRevocation(params, network) {
    return await tokenApprovalService.revokeApproval(network, {
      tokenAddress: params.tokenAddress,
      spenderAddress: params.spenderAddress,
      walletAddress: params.walletAddress
    });
  }

  async createSolanaPayment(params) {
    return await solanaPayService.createPayment({
      amount: params.amount,
      recipient: params.recipient,
      reference: params.reference,
      label: params.label
    });
  }

  async handleAddressPaste(address, userId) {
    return await this.intentProcessHandler.handleTokenAddress(address, userId);
  }

  async getTokenInfoBySymbol(symbol) {
    try {
      // Step 1: Try CoinGecko first
      const coingeckoData = await this.getTokenInfoFromCoinGecko(symbol);
      if (coingeckoData) {
        console.log('✅ Token found on CoinGecko:', coingeckoData);
        return coingeckoData;
      }
  
      console.log('⚠️ Token not found on CoinGecko. Trying Dextools...');
  
      // Step 2: Fallback to Dextools
      const dextoolsData = await this.dextools.getTokenInfo(symbol).catch(() => null);
      if (dextoolsData) {
        console.log('✅ Token found on Dextools:', dextoolsData);
        return dextoolsData;
      }
  
      console.log('⚠️ Token not found on Dextools. Trying DexScreener...');
  
      // Step 3: Fallback to DexScreener
      const dexscreenerData = await this.dexscreener.getTokenInfo(symbol).catch(() => null);
      if (dexscreenerData) {
        console.log('✅ Token found on DexScreener:', dexscreenerData);
        return dexscreenerData;
      }
  
      // Step 4: All sources failed
      console.log('❌ Token not found on any source.');
      return { error: 'Failed to retrieve token data from CoinGecko, Dextools, and DexScreener.' };
  
    } catch (error) {
      console.error('❌ Error in getTokenInfoBySymbol:', error);
      return { error: 'An unexpected error occurred while retrieving token information.' };
    }
  }  

  async getTokenInfoByAddress(text) {
    return await this.dexscreener.getTokenInfoByAddress(text);
  }
  
  async getTrendingTokens() {
    return await trendingService.getTrendingTokens();
  }

  async getTrendingTokensByChain(network) {
    return await trendingService.getTrendingTokensByChain(network);
  }

  async getTrendingTokensCoinGecko() {
    return await trendingService.get_trending_coingecko();
  }

  async getTrendingTokensDextools(network) {
    return await dextools.fetchTrendingTokens(network);
  }

  async getTrendingTokensDexscreener() {
    return await trendingService.getBoostedTokens();
  }

  async getTrendingTokensTwitter() {
    return await twitterService.discoverTrenches();
  }

  async getGems() {
    return await twitterService.discoverTrenches();
  }

  async search_tweets_for_cashtag(userId, cashtag, minLikes = 0, minRetweets = 0, minReplies = 0) {
    try {
      // Validate and process input parameters
      const cleanCashtag = cashtag.toLowerCase().trim();
      if (!cleanCashtag) throw new Error('Cashtag cannot be empty');
  
      // Prepare and call the searchTweets function with filters
      return await twitterService.searchTweetsByCashtag(userId, cleanCashtag, minLikes, minRetweets, minReplies);
    } catch (error) {
      console.error(`❌ Error fetching tweets for cashtag "${cashtag}":`, error);
      throw error;
    }
  }  

  async getMarketConditions() {
    return await this.intentProcessHandler.getMarketConditions();
  }

  async getMarketCategories() {
    return await this.intentProcessHandler.fetchMarketCategories();
  }

  async getMarketCategoryMetrics() {
    return await this.intentProcessHandler.fetchMarketCategoryMetrics();
  }

  async getCoinsByCategory(categoryId) {
    return await this.intentProcessHandler.fetchCoinsByCategory(categoryId);
  }

  async getPortfolio(userId, network) {
    const walletBalances = await walletService.getWallets(userId);
    const openPositions = await flipperMode.getOpenPositions(userId);
    return {walletBalances, openPositions};
  }

  async getTradeHistory(userId) {
    return await walletService.getTradeHistory(userId);
  }
  
  async fetchMetrics() {
    return await flipperMode.fetchMetrics();
  }

  async startFlipperMode(userId, parameters) {
    return await flipperMode.start(userId, parameters.walletAddress, parameters);
  }

  async stopFlipperMode(bot, userId) {
    return await flipperMode.stop(bot, userId);
  }

  async performInternetSearch(text) {
    return await this.intentProcessHandler.performInternetSearch(text);
  }

  async saveGuidelines(userId, text) {
    return await dbAIInterface.saveUserGuideline(userId, text);
  }

  async getGuidelines(userId) {
    return await dbAIInterface.getUserGuidelines(userId);
  }

  async getChatHistory(userId) {
    return {
        text: await contextManager.getContext(userId),
        type: 'history'
      };
  }

  async saveButlerReminderEmails(userId, text) {
    return await butlerService.setReminder(userId, text);
  }

  async monitorButlerReminderEmails(userId, text) {
    return await butlerService.startMonitoring(userId, text);
  }

  async generateGoogleReport(userId) {
    return await butlerService.generateReport(userId);
  }

  async performTokenPriceCheck(token) {
    try {
      // Sanitize the input by trimming spaces and removing non-printable characters
      const sanitizedToken = token.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  
      // Determine if input is a symbol or address
      const isAddress = /^[a-zA-Z0-9]{35,42}$/.test(sanitizedToken); // Solana/EVM addresses
      const isSymbol = /^[a-zA-Z0-9]{2,10}$/.test(sanitizedToken); // Token symbols
  
      // Query DexScreener based on input type
      const dexscreenerData = isAddress
        ? await this.dexscreener.getTokenInfoByAddress(sanitizedToken)
        : isSymbol
        ? await this.dexscreener.getTokenInfoBySymbol(sanitizedToken)
        : null;
  
      // If DexScreener fails, fallback to Dextools
      const tokenData = dexscreenerData
        ? this.extractFirstObject(dexscreenerData)
        : await this.dextools.getTokenInfo(sanitizedToken).catch(() => null);
  
      return tokenData || { error: "Failed to retrieve token data from both sources." };
    } catch (error) {
      // If an error occurs, fallback to CoinGecko as the last resort
      const fallbackData = await this.getTokenInfoFromCoinGecko(token).catch(() => null);
  
      if (fallbackData) return fallbackData;
  
      console.error("Error fetching token data:", error);
      return { error: "Unexpected error occurred while fetching token data." };
    }
  }   

  async getTokenInfoFromCoinGecko(input) {
    try {
      // Attempt to fetch token info from CoinGecko
      return await this.intentProcessHandler.getTokenInfoFromCoinGecko(input);
    } catch (error) {
      console.warn("CoinGecko failed, falling back to DexScreener:", error.message);
  
      // Determine if the input is a symbol or an address
      const isAddress = /^0x[a-fA-F0-9]{40}$/.test(input) || input.length === 44;
  
      // Fallback to DexScreener methods
      if (isAddress) {
        console.log("Input detected as token address, using getTokenInfoByAddress.");
        return await this.getTokenInfoByAddress(input);
      } else {
        console.log("Input detected as token symbol, using getTokenInfoBySymbol.");
        return await this.getTokenInfoBySymbol(input);
      }
    }
  } 
  
  async startBitrefillShoppingFlow(chatId, email) {
    
    await this.bitrefillService.handleShoppingFlow(chatId, email),
        
    await this.bitrefillService.notifyPaymentStatus(chatId, invoiceId);
  }

  async bitRefillService(chatId) {
    try {
      // Simulate AI intent matching for simplicity
      if (msg.text?.toLowerCase().includes("shop gift cards")) {
        return await this.bitrefillService.handleShoppingFlow(chatId);
      }

      throw new Error("No matching intent found.");
    } catch (error) {
      console.error("❌ Error in processMessage:", error.message);
      await this.bot.sendMessage(
        chatId,
        "❌ An error occurred while processing your request."
      );
    }
  }
  
  extractFirstObject(data) {
    try {
      if (!data || !data.pairs || !Array.isArray(data.pairs) || data.pairs.length === 0) {
        return null;
      }
      const firstPair = data.pairs[0];
  
      // Extract socials and website if available
      const socials = (firstPair.info?.socials || []).reduce((acc, social) => {
        acc[social.type] = social.url;
        return acc;
      }, {});
  
      const website = firstPair.info?.websites?.[0]?.url || null;
  
      return {
        dexId: firstPair.dexId || null,
        pairAddress: firstPair.pairAddress || null,
        priceUsd: parseFloat(firstPair.priceUsd) || 0,
        priceNative: parseFloat(firstPair.priceNative) || 0,
        priceChange24h: firstPair.priceChange?.h24 || 0,
        priceChange6h: firstPair.priceChange?.h6 || 0,
        txnCount24h: firstPair.txns?.h24?.buys + firstPair.txns?.h24?.sells || 0,
        liquidityUsd: firstPair.liquidity?.usd || 0,
        liquidityBase: firstPair.liquidity?.base || 0,
        liquidityQuote: firstPair.liquidity?.quote || 0,
        volumeUsd24h: firstPair.volume?.h24 || 0,
        url: firstPair.url || null,
        baseToken: firstPair.baseToken?.symbol || null,
        quoteToken: firstPair.quoteToken?.symbol || null,
        socials,
        website,
      };
    } catch (error) {
      console.error("Error extracting first object:", error);
      return null;
    }
  }  

  async startKOLMonitoring(userId, parameters) {
    let amount = parameters.amount !== null && parameters.amount !== undefined ? parameters.amount : 0; 
    return await twitterService.startKOLMonitoring(userId, parameters.handle, amount);
  }

  async stopKOLMonitoring(userId, handle) {
    return await twitterService.stopKOLMonitoring(userId, handle);
  }

  async handleShopifySearch(text) {
    const products = await shopifyService.searchProducts(text);
    if (!products?.length) {
      return {
        text: "No products found matching your search.",
        type: 'search'
      };
    }

    return products.length === 1 
      ? this.formatSingleProduct(products[0])
      : this.formatShopifyResults(products);
  }

  formatSingleProduct(product) {
    return {
      text: [
        `*${product.title}* 🛍️\n`,
        product.description ? `${product.description}\n` : '',
        `💰 ${product.currency} ${parseFloat(product.price).toFixed(2)}`,
        `${product.available ? '✅ In Stock' : '❌ Out of Stock'}`,
        `\n🔗 [View Product](${product.url})`,
        `\nReference: \`product_${product.id}\``
      ].filter(Boolean).join('\n'),
      type: 'single_product',
      parse_mode: 'Markdown',
      product: {
        ...product,
        reference: `product_${product.id}`
      }
    };
  }

  formatShopifyResults(products) {
    const formattedProducts = products.map(product => ({
      ...product,
      reference: `product_${product.id}`
    }));

    return {
      text: [
        '*KATZ Store Products* 🛍️\n',
        ...formattedProducts.map((product, i) => [
          `${i + 1}. *${product.title}*`,
          `💰 ${product.currency} ${parseFloat(product.price).toFixed(2)}`,
          product.description ? `${product.description.slice(0, 100)}...` : '',
          `${product.available ? '✅ In Stock' : '❌ Out of Stock'}`,
          `🔗 [View Product](${product.url})`,
          `Reference: \`${product.reference}\`\n`
        ].filter(Boolean).join('\n')).join('\n')
      ].join('\n'),
      type: 'product_list',
      parse_mode: 'Markdown',
      products: formattedProducts
    };
  }

  async handleProductReference(userId, productId) {
    const product = await shopifyService.getProductById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    return this.formatSingleProduct(product);
  }

  cleanup() {
    this.removeAllListeners();
    this.initialized = false;
  }
}

export const intentProcessor = new IntentProcessor();