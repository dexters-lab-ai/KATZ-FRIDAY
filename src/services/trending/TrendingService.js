import { EventEmitter } from 'events';
import { dextools } from '../dextools/index.js';
import { dexscreener } from '../dexscreener/index.js';
import { cacheService } from '../cache/CacheService.js';
import { ErrorHandler } from '../../core/errors/index.js';
import { IntentProcessHandler } from '../ai/handlers/IntentProcessHandler.js';
import { twitterService } from '../twitter/index.js';

const CACHE_DURATION = 60000; // 1 minute

class TrendingService extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.intentProcessHandler = new IntentProcessHandler(); 
  }

  async initialize() {
    if (this.initialized) return;
    try {
      this.startCacheUpdates();
      this.initialized = true;
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  // Expanded engine-specific functions
  async get_trending_solana() {
    return this.getTrendingTokensByChain('solana');
  }

  async get_trending_ethereum() {
    return this.getTrendingTokensByChain('ethereum');
  }

  async get_trending_base() {
    return this.getTrendingTokensByChain('base');
  }

  async get_trending_twitter() {
    try {
      const fullResults = await twitterService.discoverTrenches();
  
      // Trim results to half (or a maximum of 6 if too large)
      const maxResults = Math.ceil(fullResults.cashtagList.length / 2);
      const trimmedCashtagList = fullResults.cashtagList.slice(0, maxResults);
      const trimmedRelevantTweets = fullResults.relevantTweetTexts.slice(0, maxResults);
  
      return {
        message: fullResults.message || "Twitter trends retrieved successfully.",
        cashtagList: trimmedCashtagList || [],
        relevantTweetTexts: trimmedRelevantTweets || [],
      };
    } catch (error) {
      console.error('❌ Error in get_trending_twitter:', error.message);
      return {
        message: "Error fetching Twitter trends.",
        cashtagList: [],
        relevantTweetTexts: [],
      };
    }
  }  

  async get_trending_coingecko() {
    const cacheKey = 'trending:coingecko';
    try {
        // Check the cache
        const cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
            // Always limit cached results to the top 6
            return cachedData.slice(0, 6);
        }

        // Fetch trending tokens from CoinGecko
        const trendingTokens = await this.intentProcessHandler.getCoinGeckoTrendingTokens();

        // Limit results to top 6
        const limitedTokens = trendingTokens.slice(0, 6);

        // Cache the results
        await cacheService.set(cacheKey, limitedTokens, CACHE_DURATION);

        return limitedTokens;
    } catch (error) {
        console.error('❌ Error fetching CoinGecko trending tokens:', error.message);
        await ErrorHandler.handle(error);
        return [];
    }
  }

  // Fetches trending tokens for a specific network
  async getTrendingTokensByChain(network) {
    const cacheKey = `trending:chain:${network}`;
    try {
        // Check the cache
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            // Always limit cached results to the top 5
            return cached.slice(0, 5);
        }

        // Fetch trending tokens from Dextools
        const dextoolsTokens = await dextools.fetchTrendingTokens(network);

        // Format tokens
        const formattedTokens = dextoolsTokens.map(token => this.formatterNeeded(token));

        // Limit results to top 5
        const limitedTokens = formattedTokens.slice(0, 5);

        // Cache the results
        await cacheService.set(cacheKey, limitedTokens, CACHE_DURATION);

        return limitedTokens;
    } catch (error) {
        await ErrorHandler.handle(error);
        throw error;
    }
  }

  formatterNeeded(token) {
    return {
        rank: token.rank,
        name: token.tokenName || token.mainToken?.name || "Unknown",
        symbol: token.tokenSymbol || token.mainToken?.symbol || "Unknown",
        address: token.tokenAddress || token.mainToken?.address || "Unknown",
    };
  }

  // Combines and formats top trending tokens across all sources
  async getTrendingTokens() {
    try {
      const [
        solanaTokens,
        ethereumTokens,
        baseTokens,
        twitterResults, // Includes both cashtagList and relevantTweetTexts
        coingeckoTokens,
      ] = await Promise.all([
        this.get_trending_solana(),
        this.get_trending_ethereum(),
        this.get_trending_base(),
        this.get_trending_twitter(),
        this.get_trending_coingecko(),
      ]);
  
      // Extract cashtagList and relevantTweetTexts from Twitter results
      const twitterTokens = twitterResults.cashtagList || [];
      const relevantTweets = twitterResults.relevantTweetTexts || [];
  
      // Combine all tokens
      const allTokens = [
        ...this.ensureArray(solanaTokens),
        ...this.ensureArray(ethereumTokens),
        ...this.ensureArray(baseTokens),
        ...this.ensureArray(twitterTokens),
        ...this.ensureArray(coingeckoTokens),
      ];
  
      // Shuffle the combined tokens
      const shuffledTokens = this.shuffleArray(allTokens);
  
      // Limit tokens to 20
      const limitedTokens = shuffledTokens.slice(0, 20);

      console.log("LIMITED TOKENS======================", limitedTokens);
  
      // Return combined result with tokens and tweets
      return {
        tokens: limitedTokens,
        tweets: relevantTweets, // Include the trimmed list of tweets
      };
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  // Utility to ensure the input is always an array
  ensureArray(input) {
    if (Array.isArray(input)) {
      return input;
    }
    return input ? [input] : []; // Wrap non-array inputs in an array, or return an empty array
  }
  
  shuffleArray(array) {
    const shuffled = array.slice(); // Create a shallow copy to avoid modifying the original array
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
    }
    return shuffled;
  }  
  
  async getBoostedTokens() {
    const cacheKey = 'trending:boosted';
    try {
      const cached = await cacheService.get(cacheKey);
  
      if (cached) {
        console.log('📦 Returning cached boosted tokens.');
        // Trim cached results to the latest 8
        return cached.slice(0, 6);
      }
  
      // Fetch boosted pairs
      const pairs = await dexscreener.getBoostedPairs();
  
      // Format the pairs for Telegram
      const formattedPairs = pairs.map(pair => this.generateTelegramMessage(this.formatPair(pair)));
  
      // Cache the results for a predefined duration
      await cacheService.set(cacheKey, formattedPairs, CACHE_DURATION);
  
      // Return only the latest 8 formatted pairs
      return formattedPairs.slice(0, 6);
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }  

  filterPairsByNetwork(pairs, network) {
    if (!Array.isArray(pairs)) return [];
    return pairs
      .filter(pair => pair.chainId?.toLowerCase() === network?.toLowerCase())
      .map(pair => this.formatPair(pair));
  }

  formatPair(pair) {
    return {
      network: pair.chainId?.toLowerCase() || 'Unknown',
      address: pair.tokenAddress || 'Unknown',
      name: pair.name || 'Unknown',
      description: pair.description || 'No description available.',
      icon: pair.icon || null,
      links: this.formatLinks(pair.links),
      metrics: {
        totalAmount: pair.totalAmount || 'N/A',
        amount: pair.amount || 'N/A',
        volume24h: pair.volume24h || 0,
      },
      dexscreener: {
        url: pair.url || '#',
        header: pair.header || null,
        openGraph: pair.openGraph || null,
      },
    };
  }

  formatLinks(links) {
    if (!Array.isArray(links)) return {};
    const formattedLinks = {};
    links.forEach(link => {
      if (link.type) {
        formattedLinks[link.type] = link.url;
      } else if (link.label === 'Website') {
        formattedLinks.website = link.url;
      }
    });
    return formattedLinks;
  }

  generateTelegramMessage(token) {
    const {
      network = 'Unknown',
      address = 'Unknown',
      name = 'Unknown',
      description = 'No description available.',
      icon,
      links = {},
      metrics = {},
      dexscreener = {},
    } = token;

    const { totalAmount = 'N/A', amount = 'N/A', volume24h = 0 } = metrics;

    const message = `
🌟 **[${name !== 'Unknown' ? name : 'Token'}](${dexscreener.url || '#'})**  
_${description}_

🪙 **Address:** [${address}](${dexscreener.url || '#'})  
🔗 **Network:** ${network}  
📊 **Total Supply:** ${totalAmount}  
📈 **Available:** ${amount}  
💰 **24h Volume:** ${volume24h.toLocaleString()} USD

🔗 **Links:**  
${links.website ? `• [Website](${links.website})` : ''}
${links.twitter ? `• [Twitter](${links.twitter})` : ''}
${links.telegram ? `• [Telegram](${links.telegram})` : ''}
    `.trim();

    const images = [];
    if (icon) images.push(icon);
    if (dexscreener.header) images.push(dexscreener.header);
    if (dexscreener.openGraph) images.push(dexscreener.openGraph);

    const buttons = [];
    if (dexscreener.url && this.isValidUrl(dexscreener.url)) {
      buttons.push({ text: 'View on DexScreener', url: dexscreener.url });
    }
    if (links.website && this.isValidUrl(links.website)) {
      buttons.push({ text: 'Website', url: links.website });
    }
    if (links.twitter && this.isValidUrl(links.twitter)) {
      buttons.push({ text: 'Twitter', url: links.twitter });
    }
    if (links.telegram && this.isValidUrl(links.telegram)) {
      buttons.push({ text: 'Telegram', url: links.telegram });
    }

    return { message, buttons, images };
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  startCacheUpdates() {
    setInterval(async () => {
      try {
        await this.getTrendingTokens();
        await this.getBoostedTokens();
      } catch (error) {
        await ErrorHandler.handle(error);
      }
    }, CACHE_DURATION);
  }

  cleanup() {
    this.initialized = false;
    this.removeAllListeners();
  }
}

export const trendingService = new TrendingService();
