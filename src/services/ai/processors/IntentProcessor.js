import { EventEmitter } from 'events';
import { networkState } from '../../networkState.js';
import { ErrorHandler } from '../../../core/errors/index.js';
import { TRADING_INTENTS } from '../intents.js';
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
import { tokenApprovalService } from '../../tokens/TokenApprovalService.js';
import { solanaPayService } from '../../solanaPay/SolanaPayService.js';
import { shopifyService } from '../../shopify/ShopifyService.js';
import { butlerService } from '../../butler/ButlerService.js';
import { dbAIInterface } from '../../db/DBAIInterface.js';
import { contextManager } from '../ContextManager.js';
import { dexscreener } from '../../dexscreener/index.js';

export class IntentProcessor extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.intentProcessHandler = new IntentProcessHandler(); 
    this.dextools = dextools;
    this.dexscreener = dexscreener;
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
  async swapTokens(params, network) {
    if (!params.tokenAddress || !params.amount) {
      throw new Error('Missing required trade parameters');
    }

    return await tradeService.executeTrade({
      network,
      userId: params.userId,
      action: params.action,
      tokenAddress: params.tokenAddress,
      amount: params.amount,
      options: params.options
    });
  }

  async createPriceAlert(params, network) {
    return await priceAlertService.createAlert(params.userId, {
      tokenAddress: params.tokenAddress,
      targetPrice: params.targetPrice,
      condition: params.condition,
      network,
      walletAddress: params.walletAddress,
      swapAction: params.swapAction
    });
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

  async getTokenInfoBySymbol(text) {
    return await this.dexscreener.getTokenInfoBySymbol(text);
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
      return await twitterService.searchTweets(userId, cleanCashtag, minLikes, minRetweets, minReplies);
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
      console.warn("==================== Sanitized Input ==========>>", sanitizedToken);
  
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