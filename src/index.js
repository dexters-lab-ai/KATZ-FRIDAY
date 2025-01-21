import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

// Core services
import { bot } from './core/bot.js';
import { setupCommands } from './commands/index.js';
import { UnifiedMessageHandler } from './core/UnifiedMessageHandler.js';
import { db } from './core/database.js';
import { rateLimiter } from './core/rate-limiting/RateLimiter.js';
import { circuitBreakers } from './core/circuit-breaker/index.js';

// Service imports
import { walletService } from './services/wallet/index.js';
import { butlerService } from './services/butler/ButlerService.js';
import { shopifyService } from './services/shopify/ShopifyService.js';
import { ErrorHandler } from './core/errors/index.js';

// Learning systems
import { kolLearningSystem } from './services/ai/flows/learning/KOLLearningSystem.js';
import { strategyManager } from './services/ai/flows/learning/StrategyManager.js';

let isShuttingDown = false;

async function cleanup(botInstance) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('🛑 Shutting down AI Agent...');
  try {
    await db.disconnect();
    await walletService.cleanup();
    
    if (botInstance) {
      await botInstance.stopPolling();
    }

    console.log('✅ Cleanup completed.');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    isShuttingDown = false;
  }
}

async function initializeServices() {
  console.log('🔧 Initializing core services...');

  try {
    // Initialize database first
    console.log('📡 Connecting to MongoDB...');
    await db.connect();

    // Initialize wallet service
    console.log('👛 Initializing wallet service...');
    await walletService.initialize();

    // Initialize rate limiter
    console.log('⚡ Initializing rate limiter...');
    await rateLimiter.initialize();

    // Initialize Butler Google service    
    console.log('☁️ Initializing Google services...');
    await butlerService.initialize();

    // Initialize circuit breakers
    console.log('🔌 Setting up circuit breakers...');
    await circuitBreakers.initialize();

    // Initialize Shopify service
    console.log('🛍️ Initializing Shopify service...');
    await shopifyService.initialize();

    // Initialize learning systems
    console.log('🧠 Initializing learning systems...');
    await Promise.all([
      kolLearningSystem.initialize(),
      strategyManager.initialize()
    ]);

    console.log('✅ Core services initialized successfully.');
  } catch (error) {
    console.error('❌ Error initializing core services:', error);
    throw error;
  }
}

async function startAgent() {
  try {
    console.log('🚀 Starting KATZ AI Agent...');

    // 1. Initialize core services
    await initializeServices();

    // 2. Command Registry Setup
    console.log('📜 Setting up command registry...');
    const commandRegistry = await setupCommands(bot);

    // 3. Unified Message Handler Initialization
    console.log('📜 Setting up UnifiedMessageHandler...');
    const messageHandler = new UnifiedMessageHandler(bot, commandRegistry);
    await messageHandler.initialize();

    // 4. Start Telegram Bot Polling
    console.log('🤖 Starting Telegram Interface...');
    await bot.startPolling();

    console.log('✅ KATZ AI Agent is up and running!');
    return bot;
  } catch (error) {
    console.error('❌ Error during agent startup:', error);
    await cleanup(bot);
    process.exit(1);
  }
}

// Error Handlers
function setupErrorHandlers(botInstance) {
  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down...');
    await cleanup(botInstance);
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await ErrorHandler.handle(error);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    await ErrorHandler.handle(reason);
  });
}

// Start the Agent
(async () => {
  const botInstance = await startAgent();
  setupErrorHandlers(botInstance);
})();