/**
 * fallbackMap.js
 * --------------
 * Priority-based fallback options for each function.
 * The system tries each function in the array if the primary fails or returns insufficient data.
 */
export const fallbackMap = {
    /**
     * Token Price Functions
     * Primary: token_price_coingecko
     * Fallbacks: DexScreener, Dextools
     */
    token_price_coingecko: [
      "token_price_dexscreener",
      "search_internet",
    ],
  
    /**
     * If DexScreener price check fails, fallback to Coingecko or Dextools
     */
    token_price_dexscreener: [
      "token_price_coingecko",
      "search_internet",
    ],
  
    /**
     * If user calls token_price_dextools (assuming it exists),
     * fallback to DexScreener or Coingecko
     */
    token_price_dextools: [
      "token_price_dexscreener",
      "token_price_coingecko",
    ],
  
    /**
     * For market sentiment checks (e.g., fetch_tweets_for_symbol),
     * fallback to a broad internet search for possible sentiment sources
     */
    fetch_tweets_for_symbol: [
      "search_internet"
    ],
  
    /**
     * Market Categories & Metrics
     * If fetching categories fails, fallback to metrics or a general internet search
     */
    fetch_market_categories: [
      "fetch_market_category_metrics",
      "search_internet"
    ],
    fetch_market_category_metrics: [
      "search_internet"
    ],
  
    /**
     * If a user wants trending tokens from Coingecko fails, 
     * fallback to DexScreener, Dextools, or a "unified" aggregator
     */
    fetch_trending_tokens_coingecko: [
      "fetch_trending_tokens_dexscreener",
      "fetch_trending_tokens_unified"
    ],
  
    /**
     * If Dextools trending fails, fallback to DexScreener or Coingecko or unified aggregator
     */
    fetch_trending_tokens_dextools: [
      "fetch_trending_tokens_dexscreener",
      "fetch_trending_tokens_unified"
    ],
  
    /**
     * If DexScreener trending fails, fallback to Dextools or Coingecko or unified aggregator
     */
    fetch_trending_tokens_dexscreener: [
      "fetch_trending_tokens_dextools",
      "fetch_trending_tokens_coingecko",
    ],
  
    /**
     * If the "unified" aggregator fails, fallback to direct sources
     */
    fetch_trending_tokens_unified: [
      "fetch_trending_tokens_coingecko",
      "fetch_trending_tokens_twitter"
    ],
  
    /**
     * If Twitter trending fails, fallback to internet search
     */
    fetch_trending_tokens_twitter: [
      "search_internet",
      "fetch_trending_tokens_coingecko", //based on search popularity so it applies as social check fallback
    ],
  
    /**
     * Searching Shopify store products fails => fallback to a general internet search
     */
    search_products: [
      "search_internet"
    ],
  
    /**
     * If "search_internet" fails => we might fallback to "fetch_trending_tokens_unified",
     * or "fetch_trending_tokens_twitter" if user is looking for public sentiment.
     */
    search_internet: [
      "fetch_trending_tokens_unified",
      "fetch_trending_tokens_twitter"
    ],
  
    /**
     * Example: if we try "monitor_kol" but Twitter is down,
     * fallback to a broad internet search to find KOL news, or use fetch_tweets_for_symbol
     * (Just an example, you can remove if not relevant.)
     */
    monitor_kol: [
      "fetch_tweets_for_symbol",
      "search_internet"
    ],
  
    /**
     * If "handle_product_reference" fails, maybe fallback
     * to "search_products"? It's up to your logic. 
     */
    handle_product_reference: [
      "search_products"
    ],
  
    /**
     * If we wanted to fallback from "get_market_conditions" to 
     * "search_internet" in case the user’s API is offline
     */
    get_market_conditions: [
      "search_internet"
    ],
  
    /**
     * If "fetch_coins_by_category" fails, we might do 
     * a broader search_internet or fetch_market_categories
     */
    fetch_coins_by_category: [
      "fetch_market_categories",
      "search_internet"
    ],
  
    // ... add more as needed ...
  };
  