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

  async fetchTrendingEVM() {
    const supportedNetworks = ['ethereum', 'base', 'solana']; // Supported networks
    const networks = ['base', 'ethereum', 'avalanche']; // Networks to fetch
    const MAX_PAIRS = 5; // Maximum number of pairs to include in the final result
    const MAX_TELEGRAM_MESSAGE_LENGTH = 4096; // Telegram's maximum message length
    const cacheKey = 'trending:evm';
  
    try {
      // Check if all networks are supported
      const unsupportedNetworks = networks.filter(network => !supportedNetworks.includes(network.toLowerCase()));
      if (unsupportedNetworks.length > 0) {
        return `I only support Solana, Ethereum, and Base for now... Unsupported networks: ${unsupportedNetworks.join(', ')}`;
      }
  
      // Fetch cached results first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log('📦 Returning cached trending EVM tokens.');
        return cached;
      }
  
      // Fetch trending tokens from all specified networks in parallel
      const fetchPromises = networks.map(network => dextools.fetchTrendingTokens(network));
      const results = await Promise.allSettled(fetchPromises);
  
      // Extract successful results and flatten them
      const successfulResults = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .flat();
  
      // Log errors for rejected promises
      const failedResults = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);
  
      if (failedResults.length > 0) {
        failedResults.forEach((error, index) => {
          console.error(`Error fetching trending tokens for network ${networks[index]}:`, error);
        });
      }
  
      if (successfulResults.length === 0) {
        console.warn('No trending tokens fetched successfully from any EVM network.');
        return [];
      }
  
      // Sort the combined tokens by totalAmount descendingly
      const sortedTokens = successfulResults.sort((a, b) => b.totalAmount - a.totalAmount);
  
      // Select the top MAX_PAIRS tokens
      const topTokens = sortedTokens.slice(0, MAX_PAIRS);
  
      // Ensure the message length does not exceed Telegram's limit
      let currentLength = 0;
      const trimmedTokens = [];
      for (const token of topTokens) {
        const tokenString = JSON.stringify(token);
        if (currentLength + tokenString.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
          console.warn('Reached Telegram message length limit.');
          break;
        }
        trimmedTokens.push(token);
        currentLength += tokenString.length;
      }
  
      console.log(`Final tokens to be sent (under Telegram limit):`, JSON.stringify(trimmedTokens, null, 2));
  
      // Cache the final trimmed tokens
      await cacheService.set(cacheKey, trimmedTokens, CACHE_DURATION);
  
      return trimmedTokens;
    } catch (error) {
      console.error('Error in fetchTrendingEVM:', error);
      throw error;
    }
  }  
  
  async getBoostedTokens() {
    const cacheKey = 'trending:boosted';
    const MAX_TELEGRAM_MESSAGE_LENGTH = 4096; // Telegram's maximum message length
    const MAX_PAIRS = 5; // Maximum number of pairs to include

    try {
        const cached = await cacheService.get(cacheKey);

        if (cached) {
            console.log('📦 Returning cached boosted tokens.');
            // Trim cached results to the latest 5
            return cached.slice(0, MAX_PAIRS);
        }

        // Fetch boosted pairs
        const pairs = await dexscreener.getBoostedPairs();

        if (pairs.length === 0) {
            console.warn("No boosted pairs available to process.");
            return [];
        }

        // Sort the pairs by totalAmount descendingly
        const sortedPairs = pairs.sort((a, b) => b.totalAmount - a.totalAmount);

        // Select top 5 pairs
        const topPairs = sortedPairs.slice(0, MAX_PAIRS);

        //console.log(`Top pairs count after sorting and slicing: ${topPairs.length}`);

        // Optional: Ensure the combined message does not exceed Telegram's limit
        // Here, we assume each pair's data is concise enough. If not, implement additional trimming.
        let combinedMessageLength = 0;
        const trimmedTopPairs = [];

        for (const pair of topPairs) {
            // Estimate the length of each pair's string representation
            const pairString = JSON.stringify(pair);
            combinedMessageLength += pairString.length;

            if (combinedMessageLength <= MAX_TELEGRAM_MESSAGE_LENGTH) {
                trimmedTopPairs.push(pair);
            } else {
                console.warn(`Adding pair ${pair.symbol} would exceed Telegram's message limit. Skipping.`);
                break; // Exit the loop if the next pair would exceed the limit
            }
        }

        //console.log(`Trimmed top pairs count to fit Telegram's limit: ${trimmedTopPairs.length}`);

        // Cache the trimmed top pairs
        await cacheService.set(cacheKey, trimmedTopPairs, CACHE_DURATION);

        // Return the trimmed top 5 pairs
        return trimmedTopPairs;
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
      network: pair.chainId ? pair.chainId.toLowerCase() : 'unknown', // Dynamically set based on data
      address: pair.tokenAddress || 'Unknown',
      name: pair.symbol || 'Unknown', // Using 'symbol' from formatBoostedData as 'name'
      description: pair.description || 'No description available.',
      links: this.formatLinks(pair.links),
      metrics: {
        totalAmount: pair.totalAmount || 0,
        amount: pair.amount || 0,
        // Removed volume24h as it's not present in the data
      },
      dexscreener: {
        url: pair.url || '#',
        // Removed 'header' and 'openGraph' as they're unnecessary
      },
    };
  }   

  formatLinks(links) {
    return {
      website: links.website || null,
      twitter: links.twitter || null,
      telegram: links.telegram || null,
    };
  }

  generateTelegramMessage(token) {
    const {
      network = 'Unknown',
      address = 'Unknown',
      name = 'Unknown',
      description = 'No description available.',
      links = {},
      metrics = {},
      dexscreener = {},
    } = token;
  
    const { totalAmount = 'N/A', amount = 'N/A' } = metrics;
  
    const message = `
  🌟 **[${name !== 'Unknown' ? name : 'Token'}](${dexscreener.url || '#'})**  
  _${description}_
  
  🪙 **Address:** [${address}](${dexscreener.url || '#'})  
  🔗 **Network:** ${network}  
  📊 **Total Supply:** ${totalAmount}  
  📈 **Available:** ${amount}
  
  🔗 **Links:**  
  ${links.website ? `• [Website](${links.website})` : ''}
  ${links.twitter ? `• [Twitter](${links.twitter})` : ''}
  ${links.telegram ? `• [Telegram](${links.telegram})` : ''}
    `.trim();
  
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
  
    return { message, buttons };
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
