import { EventEmitter } from 'events';
import { PriceAlert } from '../models/PriceAlert.js';
import { dextools } from './dextools/index.js';
import { tokenInfoService } from './tokens/TokenInfoService.js';
import { PriceMonitoringService } from './trading/PriceMonitoring.js';
import { walletService } from './wallet/index.js';
import { tradeService } from './trading/TradeService.js';
import { ErrorHandler } from '../core/errors/index.js';

class PriceAlertService extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.initializationPromise = null;
    this.priceWebsockets = new Map();
    this.priceMonitoringService = new PriceMonitoringService();
  }

  /**
   * Initialize the service.
   */
  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        await this.setupPriceMonitoring();

        this.initialized = true;
        this.emit('initialized');
        return true;
      } catch (error) {
        await ErrorHandler.handle(error);
        this.emit('error', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Set up price monitoring for all active alerts.
   */
  async setupPriceMonitoring() {
    // Clean up existing monitoring intervals
    this.priceWebsockets.forEach((interval) => clearInterval(interval));
    this.priceWebsockets.clear();

    try {
      const activeAlerts = await PriceAlert.find({ isActive: true }).lean();
      const uniqueTokens = new Set(
        activeAlerts.map((alert) => `${alert.network}:${alert.tokenAddress}`)
      );

      for (const key of uniqueTokens) {
        const [network, tokenAddress] = key.split(':');
        await this.monitorToken(network, tokenAddress);
      }
    } catch (error) {
      await ErrorHandler.handle(error);
      throw new Error('Error setting up price monitoring');
    }
  }

  /**
   * Monitor token prices and handle updates for a specific token.
   */
  async monitorToken(network, tokenAddress) {
    const key = `${network}:${tokenAddress}`;
  
    // Avoid duplicate monitoring
    if (this.priceWebsockets.has(key)) return;
  
    try {
      // Start monitoring prices for this token using WebSocket
      const websocket = await this.priceMonitoringService.monitorPrices(network, tokenAddress, async (priceUpdate) => {
        // Handle updates for the specific token as they arrive
        if (priceUpdate?.price) {
          await this.handlePriceUpdate(network, tokenAddress, priceUpdate.price);
        }
      });
  
      // Store the WebSocket instance to prevent duplicate monitoring
      this.priceWebsockets.set(key, websocket);
    } catch (error) {
      await ErrorHandler.handle(error);
      throw error;
    }
  }  

  /**
   * Handle price updates and trigger alerts if conditions are met.
   */
  async handlePriceUpdate(network, tokenAddress, price) {
    try {
      const alerts = await PriceAlert.find({
        network,
        tokenAddress,
        isActive: true,
      });

      for (const alert of alerts) {
        const shouldTrigger =
          alert.condition === 'above'
            ? price >= alert.targetPrice
            : price <= alert.targetPrice;

        if (shouldTrigger) {
          await this.executeAlert(alert, price);
        }
      }
    } catch (error) {
      await ErrorHandler.handle(error);
      this.emit('error', error);
    }
  }

  /**
   * Execute an alert by sending a notification and updating the database.
   */
  async executeAlert(alert, currentPrice) {
    try {
      const wallet = await walletService.getWallet(alert.userId, alert.walletAddress);

      // For external wallets, check/request approval first
      if (wallet.type === 'walletconnect' && !alert.preApproved) {
        const approvalStatus = await walletService.checkAndRequestApproval(
          alert.tokenAddress,
          alert.walletAddress,
          alert.swapAction.amount
        );

        if (approvalStatus.approved) {
          alert.preApproved = true;
          await alert.save();
        } else {
          throw new Error('Token approval required');
        }
      }

      // Calculate amount if percentage-based
      let amount = alert.swapAction.amount;
      if (typeof amount === 'string' && amount.endsWith('%')) {
        const percentage = parseFloat(amount);
        const balance = await walletService.getTokenBalance(alert.userId, alert.tokenAddress);
        amount = (balance * percentage / 100).toString();
      }

      if (alert.swapAction?.enabled) {
        const result = await tradeService.executeTrade({
          network: alert.network,
          action: alert.swapAction.type,
          tokenAddress: alert.tokenAddress,
          amount: alert.swapAction.amount,
          walletAddress: alert.swapAction.walletAddress,
          userId: alert.userId,
          options: {
            slippage: 1,
            autoApprove: true,
          },
        });

        await alert.markExecuted({
          userId: alert.userId,
          alertId: alert._id,
          result: { ...result, price: currentPrice },
        });
      } else {
        await alert.markExecuted({ price: currentPrice });
        this.emit('alertTriggered', {
          userId: alert.userId,
          alertId: alert._id,
          price: currentPrice,
        });
      }
    } catch (error) {
      await alert.markFailed(error);
      await ErrorHandler.handle(error);
      this.emit('alertFailed', {
        userId: alert.userId,
        alertId: alert._id,
        error,
      });
    }
  }

  /**
   * Create a new alert and start monitoring the associated token.
   */
  async createAlert(userId, alertData) {
    try {
      const alert = new PriceAlert({
        userId: userId.toString(),
        tokenAddress: alertData.tokenAddress,
        network: alertData.network,
        targetPrice: alertData.targetPrice,
        condition: alertData.condition,
        walletType: alertData.walletType || 'internal', // Default to 'internal'
        swapAction: alertData.swapAction || { enabled: false }, // Ensure default swapAction structure
        isActive: true, // Ensure alerts are active by default
      });

      // Save the alert to the database
      await alert.save();

      // Start monitoring the token for price changes
      await this.monitorToken(alert.network, alert.tokenAddress);

      // Emit event after successfully creating the alert
      this.emit('alertCreated', {
        userId,
        alertId: alert._id,
        tokenAddress: alert.tokenAddress,
      });

      return alert;
    } catch (error) {
      await ErrorHandler.handle(error);
      this.emit('error', error);
      throw error;
    }
  }

  async getMetrics() {
    try {
      const totalAlerts = await PriceAlert.countDocuments({});
      const activeAlerts = await PriceAlert.countDocuments({ isActive: true });
      const executedAlerts = await PriceAlert.countDocuments({ status: 'executed' });
      const failedAlerts = await PriceAlert.countDocuments({ status: 'failed' });

      return {
        totalAlerts,
        activeAlerts,
        executedAlerts,
        failedAlerts,
      };
    } catch (error) {
      await ErrorHandler.handle(error);
      throw new Error('Error fetching PriceAlert metrics');
    }
  }

  /**
   * View all alerts or a specific user's alerts.
   * @param {string} userId - (Optional) The user ID to filter alerts by.
   * @returns {Array} - List of alerts.
   */
    async viewAlerts() {
      try {
          // Fetch all alerts from the database
          const alerts = await PriceAlert.find().lean(); // Use lean() for raw objects

          // Map `_id` to `id` for easier handling
          const formattedAlerts = alerts.map(alert => ({
              id: alert._id.toString(), // Convert ObjectId to string
              ...alert,
          }));

          return formattedAlerts;
      } catch (error) {
          await ErrorHandler.handle(error);
          throw new Error('Error fetching price alerts');
      }
  }

  async getAlertById(alertId) {
    try {
      const alert = await PriceAlert.findById(alertId);
  
      if (!alert) {
        return null; // Return null if alert is not found
      }
  
      return {
        id: alert._id.toString(), // Convert ObjectId to string
        ...alert.toObject(),
      };
    } catch (error) {
      await ErrorHandler.handle(error);
      throw new Error('Error fetching price alert');
    }
  }  

  /**
   * Edit an existing alert.
   * @param {string} alertId - The ID of the alert to edit.
   * @param {Object} updatedData - The fields to update.
   * @returns {Object} - The updated alert.
   */
  async editAlert(alertId, updatedData) {
      try {
          // Validate and update the alert
          const updatedAlert = await PriceAlert.findByIdAndUpdate(
              alertId, // Use alertId directly (passed as string)
              { $set: updatedData }, // Use $set for partial updates
              { new: true, runValidators: true } // Return the updated document
          );

          if (!updatedAlert) {
              throw new Error(`Alert with ID ${alertId} not found`);
          }

          // Convert `_id` to `id` in the returned object
          return {
              id: updatedAlert._id.toString(), // Convert ObjectId to string
              ...updatedAlert.toObject(),
          };
      } catch (error) {
          await ErrorHandler.handle(error);
          throw new Error('Error updating price alert');
      }
  }

  /**
   * Delete an alert.
   * @param {string} alertId - The ID of the alert to delete.
   * @returns {boolean} - True if deletion was successful, false otherwise.
   */
  async deleteAlert(alertId) {
    try {
        // Find and delete the alert by its ID
        const alert = await PriceAlert.findByIdAndDelete(alertId);

        if (!alert) {
            throw new Error(`Alert with ID ${alertId} not found`);
        }

        // Check if there are other active alerts for the same token and network
        const otherAlerts = await PriceAlert.find({
            network: alert.network,
            tokenAddress: alert.tokenAddress,
            isActive: true,
        });

        // Stop monitoring the token if no other alerts exist
        if (otherAlerts.length === 0) {
            const key = `${alert.network}:${alert.tokenAddress}`;
            if (this.priceWebsockets.has(key)) {
                clearInterval(this.priceWebsockets.get(key)); // Clear the monitoring interval
                this.priceWebsockets.delete(key); // Remove it from the map
                console.log(`🛑 Monitoring stopped for token: ${alert.tokenAddress} on network: ${alert.network}`);
            }
        }

        return { success: true, id: alertId }; // Return success response
    } catch (error) {
        await ErrorHandler.handle(error);
        throw new Error('Error deleting price alert');
    }
  }

  cleanup() {
    // Close all websocket connections
    this.priceWebsockets.forEach((ws) => ws.close());
    this.priceWebsockets.clear();

    // Remove all listeners
    this.removeAllListeners();
    this.initialized = false;
    this.initializationPromise = null;
  }
}

export const priceAlertService = new PriceAlertService();

// Handle cleanup on process termination
process.on('SIGINT', () => {
  priceAlertService.cleanup();
});

process.on('SIGTERM', () => {
  priceAlertService.cleanup();
});
