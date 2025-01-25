import { Telegraf } from 'telegraf';
import axios from 'axios';
import { PriceAlert } from '../../models/PriceAlert.js';
import { SolanaSwapService } from './SolanaSwapService.js';
import { config } from "../../core/config.js";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class PriceMonitoringService {
    constructor(bot) {
        this.bot = bot;
        this.jupiterApiUrl = config.jupiterPriceRPC
        this.alertCheckInterval = 600000;// Interval to check alerts
        this.solanaSwapService = new SolanaSwapService();
    }

    /**
     * Fetch token prices from the Jupiter API.
     * @param {Array<string>} tokenIds - Array of token IDs.
     * @returns {Object} - A map of token IDs to their prices.
     */
    async fetchTokenPrices(tokenIds) {
        try {
            //we need a way to iterate list of tokens, and getQuote for each token address
            // params in format, price of 1 token in usdc
            const inputMint = tokenIds;
            const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; //USDC Mint
           const quote = { inputMint, outputMint, amount: 1000000, slippageBps: 3, autoSlippage: true, maxAutoSlippageBps: 3 };

            const response = await this.solanaSwapService.getQuote(quote);

            const priceData = response.data?.data || {};
            const prices = {};

            for (const [token, details] of Object.entries(priceData)) {
                prices[token] = parseFloat(details.price); // Convert price to a number
            }

            return prices;
        } catch (error) {
            console.error('❌ Error fetching prices from Jupiter:', error.message);
            return null;
        }
    }

    /**
     * Add a new price alert for a user.
     * @param {Object} alertData - Alert data.
     * @param {string} alertData.userId - The user ID.
     * @param {string} alertData.tokenAddress - The token address (ID).
     * @param {number} alertData.targetPrice - The target price.
     * @param {string} alertData.condition - The condition ('above' or 'below').
     * @param {string} alertData.network - The network (e.g., 'solana', 'ethereum').
     */
    async createAlert({ userId, tokenAddress, targetPrice, condition, network = 'mainnet-beta' }) {
        try {
            const alert = new PriceAlert({
                userId,
                tokenAddress,
                network,
                targetPrice,
                condition,
                walletType: 'internal', // Default wallet type
            });
            await alert.save();
            console.log(`✅ Alert created for user ${userId}: ${tokenAddress} ${condition} ${targetPrice}`);
        } catch (error) {
            console.error('❌ Error creating alert:', error.message);
        }
    }

    /**
     * Monitor prices and trigger alerts if conditions are met.
     */
    async monitorPrices() {
        try {
            // Fetch all active alerts from MongoDB
            const alerts = await PriceAlert.find({ isActive: true }).lean();

            if (alerts.length === 0) return {}; // No alerts to monitor, return empty object

            // Group alerts by tokenAddress for efficient price fetching
            const tokenIds = [...new Set(alerts.map((alert) => alert.tokenAddress))];

            // Fetch current prices for all tokenIds
            const prices = await this.fetchTokenPrices(tokenIds);
            if (!prices) return {}; // Exit if fetching prices failed, return empty object

            const triggeredAlerts = {}; // Store triggered alerts for logging or further processing

            // Process alerts for each tokenAddress
            for (const alert of alerts) {
                const currentPrice = prices[alert.tokenAddress]; // Retrieve the price for the token
                if (currentPrice === undefined) continue; // Skip if price is not available

                // Check if the alert condition is met
                const shouldTrigger =
                    (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
                    (alert.condition === 'below' && currentPrice <= alert.targetPrice);

                if (shouldTrigger) {
                    // Notify the user via Telegram
                    await this.bot.telegram.sendMessage(
                        alert.userId,
                        `🚨 Price Alert: ${alert.tokenAddress} has reached $${currentPrice.toFixed(2)}`
                    );

                    // Mark the alert as executed in the database
                    await PriceAlert.updateOne(
                        { _id: alert._id },
                        {
                            $set: {
                                isActive: false,
                                executionResult: {
                                    executedAt: new Date(),
                                    price: currentPrice,
                                },
                            },
                        }
                    );

                    console.log(`✅ Alert triggered for user ${alert.userId}: ${alert.tokenAddress}`);

                    // Track triggered alerts for further processing or logging
                    if (!triggeredAlerts[alert.tokenAddress]) {
                        triggeredAlerts[alert.tokenAddress] = [];
                    }
                    triggeredAlerts[alert.tokenAddress].push({
                        userId: alert.userId,
                        targetPrice: alert.targetPrice,
                        condition: alert.condition,
                        currentPrice,
                    });
                }
            }

            return { prices, triggeredAlerts }; // Return processed prices and triggered alerts
        } catch (error) {
            console.error('❌ Error monitoring prices:', error.message);
            return null;
        }
    }


    /**
     * Start monitoring prices at regular intervals.
     */
    startMonitoring() {
        setInterval(() => this.monitorPrices(), this.alertCheckInterval);
        console.log(`🔄 Price monitoring started. Interval: ${this.alertCheckInterval}ms`);
    }
}
