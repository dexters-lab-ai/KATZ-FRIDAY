import axios from 'axios';
import { EventEmitter } from 'events';
import { ApifyClient } from 'apify-client';
import { User } from '../../models/User.js';
import { walletService } from '../wallet/index.js';
import { tradeService } from '../trading/TradeService.js';
import { ErrorHandler } from '../../core/errors/index.js';
import { config } from '../../core/config.js';

// Rate Limits
const RATE_LIMITS = {
  searchInterval: 60000,
  maxSearchesPerInterval: 10,
};

// Retry config
const RETRY_CONFIG = {
  attempts: 3,
  delay: 1000,
  backoff: 2,
};

// Axios instance
const twitterAxios = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

class TwitterService extends EventEmitter {
  constructor() {
    super();

    this.apifyClient = new ApifyClient({ token: config.apifyApiKey });
    this.searchCache = new Map(); // Cache for search results
    this.searchCounts = new Map(); // Rate limit counters
    this.lastResetTime = Date.now();
    this.activeMonitors = new Map(); // Active monitors for KOL
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.restoreActiveMonitors();
      this.initialized = true;
      console.log('✅ TwitterService initialized');
    } catch (error) {
      console.error('❌ Error initializing TwitterService:', error);
      throw error;
    }
  }

  async restoreActiveMonitors() {
    try {
      const users = await User.find({
        'settings.kol.monitors': { $exists: true, $ne: [] },
      });

      for (const user of users) {
        for (const monitor of user.settings.kol.monitors) {
          if (monitor.enabled) {
            await this.startKOLMonitoring(user.telegramId, monitor.handle);
          }
        }
      }
    } catch (error) {
      await ErrorHandler.handle(error);
    }
  }

  async validateHandle(handle) {
    try {
      const run = await this.apifyClient.actor('danek/twitter-timeline').call({
        usernames: [handle],
        maxItems: 1,
      });
      const [profile] = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
      return !!profile;
    } catch (error) {
      return false;
    }
  }

  async startKOLMonitoring(userId, handle, amount) {
    try {
      const user = await User.findOne({ telegramId: userId.toString() });
      const monitor = user.settings.kol.monitors.find((m) => m.handle === handle);
      if (!amount) {
        amount = monitor.amount;
      }

      if (!monitor) throw new Error('Monitor configuration not found');

      const monitorId = `${userId}:${handle}`;
      if (this.activeMonitors.has(monitorId)) {
        console.log(`Monitor already active for ${handle}`);
        return;
      }

      const interval = setInterval(async () => {
        try {
          await this.checkNewTweets(userId, handle, amount);
        } catch (error) {
          await ErrorHandler.handle(error);
        }
      }, 60000); // Check every minute

      this.activeMonitors.set(monitorId, {
        userId,
        handle,
        interval,
        lastChecked: new Date(),
      });

      console.log(`✅ Started monitoring @${handle} for user ${userId}`);
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }

  async checkNewTweets(userId, handle, amount) {
    const monitorId = `${userId}:${handle}`;
    const monitor = this.activeMonitors.get(monitorId);

    if (!monitor) return;

    try {
      const run = await this.apifyClient.actor('danek/twitter-timeline').call({
        searchTerms: [`from:${handle}`],
        maxItems: 10,
        startTime: monitor.lastChecked.toISOString(),
      });

      const tweets = await this.apifyClient.dataset(run.defaultDatasetId).listItems();

      for (const tweet of tweets) {
        await this.processTweet(userId, tweet, amount);
      }

      monitor.lastChecked = new Date();
      this.activeMonitors.set(monitorId, monitor);
    } catch (error) {
      await ErrorHandler.handle(error);
    }
  }

  async processTweet(userId, tweet, amount) {
    try {
      const tokenInfo = this.extractTokenInfo(tweet.text);
      if (!tokenInfo) return;

      const { symbol, address } = tokenInfo;

      // Execute trade
      await tradeService.executeTrade({
        userId,
        network: 'solana', // Assuming Solana for now
        action: 'buy',
        tokenAddress: address,
        amount: amount.toString(),
        options: {
          slippage: 1,
          autoApprove: true,
        },
      });

      this.emit('kolTrade', {
        userId,
        symbol,
        address,
        amount,
        tweet: tweet.url,
      });
    } catch (error) {
      await ErrorHandler.handle(error);
    }
  }

  extractTokenInfo(text) {
    // Match token address pattern
    const addressMatch = text.match(/0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (!addressMatch) return null;

    // Look for token symbol/name before or after address
    const symbolMatch = text.match(/\$([A-Z0-9]+)/);

    return {
      address: addressMatch[0],
      symbol: symbolMatch ? symbolMatch[1] : 'Unknown',
    };
  }

  async stopKOLMonitoring(userId, handle) {
    const monitorId = `${userId}:${handle}`;
    const monitor = this.activeMonitors.get(monitorId);

    if (monitor) {
      clearInterval(monitor.interval);
      this.activeMonitors.delete(monitorId);

      await User.updateOne(
        { telegramId: userId.toString() },
        {
          $set: {
            'settings.kol.monitors.$[monitor].enabled': false,
          },
        },
        {
          arrayFilters: [{ 'monitor.handle': handle }],
        }
      );
    }
  }

  async searchTweetsByCashtag(userId, cashtag, minLikes = 0, minRetweets = 0, minReplies = 0) {
    try {
      // Check rate limits first
      await this.checkRateLimits(userId);
  
      // Ensure cashtag is cleaned and formatted
      const cleanCashtag = cashtag.toLowerCase().trim();
      if (!cleanCashtag) {
        console.warn('Cashtag is empty or invalid, skipping search.');
        return []; // Return empty array instead of throwing an error
      }
      console.log("Cleaned cashtag $$$$$$$$$$$$$$ ", cleanCashtag + " minLikes:", minLikes + " minRetweets:", minRetweets + " minReplies:", minReplies)
  
      // Check cache for the cashtag
      const cached = this.getFromCache(cleanCashtag);
      if (cached) {
        console.log('📦 Returning cached tweets for:', cleanCashtag);
        // Return only the latest 8 cached tweets
        return cached.slice(0, 8);
      }
  
      // Prepare Apify actor input
      const input = {
        cashtag: cleanCashtag,
        cookies: [config.apifyCookieToken],
        onlyBuleVerifiedUsers: false,
        onlyVerifiedUsers: false,
        sentimentAnalysis: true,
        sortBy: "Latest",
        maxItems: 100, // Ensure API returns only the latest 8 tweets
        minRetweets: minRetweets,
        minLikes: minLikes,
        minReplies: minReplies
      };
  
      // Call the Apify actor
      const run = await this.apifyClient
        .actor("fastcrawler/twitter-cashtag-scraper-stock-crypto-sentiment-analysis")
        .call(input);
  
      // Fetch results from the dataset
      const { items } = await this.apifyClient.dataset(run.defaultDatasetId).listItems();
  
      // Filter tweets based on the minimum criteria
      const filteredTweets = items.filter(tweet => 
        tweet.likeCount >= minLikes &&
        tweet.retweetCount >= minRetweets &&
        tweet.replyCount >= minReplies
      );
  
      // Limit to the latest 8 tweets
      const limitedTweets = filteredTweets.slice(0, 8);
  
      // Format the tweets
      const formattedTweets = this.formatTweets(limitedTweets);
  
      // Cache the results for the cashtag
      this.cacheResults(cleanCashtag, formattedTweets);
  
      return formattedTweets;
    } catch (error) {
      console.error(`❌ Error searching tweets for cashtag "${cashtag}":`, error);
      await ErrorHandler.handle(error);
      return []; // Return an empty array instead of throwing
    }
  }  
 
  formatTweets(tweets) {
    return tweets.map(tweet => ({
      id: tweet.id,
      text: tweet.text.length > 120 ? `${tweet.text.slice(0, 117)}...` : tweet.text, // Trim and add ellipsis if necessary
      url: tweet.url,
      stats: {
        likes: tweet.likeCount || 0,
        retweets: tweet.retweetCount || 0,
        replies: tweet.replyCount || 0,
      },
      sentiment: tweet.sentiment?.trim() || "NA",
      createdAt: new Date(tweet.createdAt).toISOString(),
    }));
  }

  // Add rate limiting check
  async checkRateLimits(userId) {
    const now = Date.now();
    
    // Reset counts if interval passed
    if (now - this.lastResetTime > RATE_LIMITS.searchInterval) {
      this.searchCounts.clear();
      this.lastResetTime = now;
    }
  
    // Check user's search count
    const currentCount = this.searchCounts.get(userId) || 0;
    if (currentCount >= RATE_LIMITS.maxSearchesPerInterval) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  
    // Increment count
    this.searchCounts.set(userId, currentCount + 1);
  }

  async discoverTrenches() {
    const cacheKey = 'trenches:cashtags';
    const cached = this.getFromCache(cacheKey);
    if (cached) {
        console.log('📦 Returning cached results for discoverTrenches');
        return cached;
    }

    try {
        const accounts = ['solana_daily', 'mobyagent', 'cookiedotfun'];

        // Fetch tweets from all accounts independently
        console.log('🔄 Fetching tweets sequentially from accounts...');
        const tweetsByAccount = {};
        for (const account of accounts) {
            const accountTweets = await this.fetchTweetsFromAccount(account);
            tweetsByAccount[account] = accountTweets;
        }

        // Process cashtags and tweets for each account
        console.log('✅ Tweets fetched. Processing cashtags...');
        const accountData = accounts.map((account) => {
            const cashtagData = {};
            const relevantTweets = new Map();

            const tweets = tweetsByAccount[account];
            for (const tweet of tweets) {
                const cashtags = this.extractCashtags(tweet);
                if (cashtags.length < 1) continue;

                // Calculate tweet weight
                const weight = 1 + (tweet.favorites || 0) * 0.1 + (tweet.retweets || 0) * 0.1 + (tweet.replies || 0) * 0.3;

                cashtags.forEach((cashtag) => {
                    if (!cashtagData[cashtag]) {
                        cashtagData[cashtag] = { score: 0 };
                        relevantTweets.set(cashtag, tweet.text);
                    }
                    cashtagData[cashtag].score += weight;
                });
            }

            return { account, cashtagData, relevantTweets };
        });

        // Combine cashtags and tweets from all accounts
        console.log('✅ Combining data from all accounts...');
        const combinedCashtagData = {};
        const combinedRelevantTweets = new Map();

        for (const { cashtagData, relevantTweets } of accountData) {
            for (const [cashtag, data] of Object.entries(cashtagData)) {
                if (!combinedCashtagData[cashtag]) {
                    combinedCashtagData[cashtag] = { score: 0 };
                    combinedRelevantTweets.set(cashtag, relevantTweets.get(cashtag));
                }
                combinedCashtagData[cashtag].score += data.score;
            }
        }

        // Sort and select top 12 cashtags
        console.log('✅ Sorting cashtags...');
        const sortedCashtags = Object.entries(combinedCashtagData)
            .sort(([, a], [, b]) => b.score - a.score)
            .slice(0, 12);

        const cashtagList = sortedCashtags.map(([cashtag, data]) => ({
            cashtag,
            score: Math.round(data.score),
        }));

        // Map tweets to the top 12 cashtags
        const relevantTweetTexts = cashtagList.map(({ cashtag }) => combinedRelevantTweets.get(cashtag));

        const results = { cashtagList, relevantTweetTexts };
        console.log('🔗 Final results:', results);

        // Cache the results
        this.cacheResults(cacheKey, results);

        return {
            message: 'List of popular tokens/tickers on the Twitter streets/trenches:',
            ...results,
        };
    } catch (error) {
        console.error('❌ Error in discoverTrenches:', error);
        await ErrorHandler.handle(error);
        throw error;
    }
}

async fetchTweetsFromAccount(account) {
    try {
        console.log(`🔄 Fetching tweets for account: ${account}`);
        const input = {
            username: account,
            max_posts: 20,
        };

        const run = await this.apifyClient.actor('danek/twitter-timeline').call(input);
        const { items } = await this.apifyClient.dataset(run.defaultDatasetId).listItems();

        console.log(`✅ Fetched ${items.length} tweets for ${account}`);
        return items;
    } catch (error) {
        console.error(`❌ Error fetching tweets for ${account}:`, error);
        await ErrorHandler.handle(error);
        return []; // Return an empty list if fetching fails
    }
}

extractCashtags(tweet) {
    const cashtags = new Set();

    // Extract cashtags from entities if available
    if (tweet.entities?.symbols?.length) {
        tweet.entities.symbols.forEach((symbol) => {
            cashtags.add(`$${symbol.text.toUpperCase()}`); // Normalize to uppercase
        });
    }

    // Extract cashtags directly from the text
    const cashtagRegex = /\$[a-z0-9]+/gi;
    const textCashtags = tweet.text.match(cashtagRegex) || [];
    textCashtags.forEach((ct) => cashtags.add(ct.toUpperCase())); // Normalize to uppercase

    return Array.from(cashtags);
}
  

  getFromCache(key) {
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < 600000) {
      return cached.data;
    }
    return null;
  }

  cacheResults(key, data) {
    this.searchCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  cleanup() {
    for (const monitor of this.activeMonitors.values()) {
      clearInterval(monitor.interval);
    }
    this.activeMonitors.clear();
    this.removeAllListeners();
    this.initialized = false;
    console.log('✅ TwitterService cleaned up');
  }
}

export const twitterService = new TwitterService();
