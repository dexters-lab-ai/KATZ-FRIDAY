import axios from 'axios';
import { config } from '../../core/config.js';
import { ErrorHandler } from '../../core/errors/index.js';

class BraveSearchService {
  constructor() {
    this.axios = axios.create({
      baseURL: 'https://api.search.brave.com/res/v1',
      headers: {
        'X-Subscription-Token': config.braveApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip'
      }
    });
  }

  /**
   * Perform a search query using Brave Search API.
   * 
   * @param {string} query - The search term to query.
   * @returns {Promise<Object>} - An object containing a news and a video result.
   * @throws Will throw an error if the API call fails.
   */
  async search(query) {
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Search query must be a non-empty string.');
      }

      console.log('🔍 Querying Brave Search API with:', query);

      // Make API request
      const response = await this.axios.get('/web/search', {
        params: { q: query }
      });

      const data = response.data;

      console.log('Brave Search API Response:', data);

      // Extract one news result (from `web.results`)
      const newsResult = (data.web?.results || []).find(result => result) || null;

      // Extract one video result (from `videos.results`)
      const videoResult = (data.videos?.results || []).find(result => result) || null;

      // Format the results
      const formattedNews = newsResult
        ? {
            title: newsResult.title || 'No title available',
            description: newsResult.description || 'No description available',
            url: newsResult.url || 'No URL available'
          }
        : null;

      const formattedVideo = videoResult
        ? {
            title: videoResult.title || 'No title available',
            description: videoResult.description || 'No description available',
            url: videoResult.url || 'No URL available'
          }
        : null;

      return { news: formattedNews, video: formattedVideo };
    } catch (error) {
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        const metaErrors = error.response.data?.error?.meta?.errors || [];
        console.error('Validation Errors:', metaErrors);
      }

      console.error('Brave Search API error:', error.message || error);
      await ErrorHandler.handle(error);
      throw new Error('Failed to retrieve search results. Please try again later.');
    }
  }
}

export const braveSearch = new BraveSearchService();
