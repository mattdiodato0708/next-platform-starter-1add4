/**
 * Production MEV Bot - Main Orchestrator
 * 
 * Features:
 * - Multi-strategy execution (Sandwich, Arbitrage, Liquidation)
 * - Advanced mempool monitoring
 * - Flashbots integration for MEV protection
 * - Real-time profit calculation
 * - Comprehensive error handling and recovery
 * - Performance metrics and alerting
 */

const { ethers } = require('ethers');
const { Client } = require('pg');
require('dotenv').config();

// Import services
const MempoolService = require('./services/mempool');
const DEXService = require('./services/dex');
const GasService = require('./services/gas');
const PricingService = require('./services/pricing');
const FlashLoanService = require('./services/flashloan');
const FlashbotsService = require('./services/flashbots');

// Import utilities
const logger = require('./utils/logger');
const ProfitCalculator = require('./utils/profit-calculator');
const Simulator = require('./utils/simulation');
const AlertSystem = require('./utils/alerts');

// Import strategies
const SandwichStrategy = require('./strategies/sandwich');
const ArbitrageStrategy = require('./strategies/arbitrage');
const LiquidationStrategy = require('./strategies/liquidation');

// Import configuration
const { tokens } = require('./config/tokens');
const { dexes } = require('./config/dexes');
const { protocols } = require('./config/protocols');

/**
 * Main Bot Class
 */
class MEVBot {
  constructor() {
    this.isRunning = false;
    this.services = {};
    this.strategies = [];
    this.stats = {
      startTime: Date.now(),
      totalOpportunities: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalProfit: 0,
    };
  }

  /**
   * Initialize all services and strategies
   */
  async initialize() {
    try {
      logger.info('Initializing MEV Bot...');

      // Validate environment variables
      this.validateConfig();

      // Initialize provider
      const wsUrl = process.env.ALCHEMY_WS_URL || process.env.INFURA_WS_URL;
      this.services.provider = new ethers.providers.WebSocketProvider(wsUrl);
      
      // Initialize wallet
      this.services.wallet = new ethers.Wallet(
        process.env.PRIVATE_KEY,
        this.services.provider
      );

      logger.info('Wallet address:', this.services.wallet.address);

      // Initialize database
      await this.initializeDatabase();

      // Initialize services
      this.services.gas = new GasService(this.services.provider, {
        maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI) || 300,
      });

      this.services.pricing = new PricingService();

      this.services.dex = new DEXService(this.services.provider, dexes);

      this.services.flashloan = new FlashLoanService(this.services.provider, {
        aavePoolAddress: process.env.AAVE_POOL_ADDRESS,
      });

      this.services.flashbots = new FlashbotsService(
        this.services.provider,
        this.services.wallet,
        {
          flashbotsRelayUrl: process.env.FLASHBOTS_RELAY_URL,
        }
      );

      await this.services.flashbots.initialize();

      this.services.mempool = new MempoolService(this.services.provider, {
        minTransactionValueUSD: parseInt(process.env.MIN_TRANSACTION_VALUE_USD) || 10000,
      });

      // Initialize utilities
      this.services.profitCalculator = new ProfitCalculator({
        minProfitUSD: parseInt(process.env.MIN_PROFIT_USD) || 50,
        maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI) || 300,
      });

      this.services.simulator = new Simulator(this.services.provider);

      this.services.alerts = new AlertSystem({
        telegram: {
          token: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_CHAT_ID,
        },
        discord: {
          enabled: process.env.ENABLE_DISCORD_ALERTS === 'true',
          webhook: process.env.DISCORD_WEBHOOK_URL,
        },
      });

      // Initialize strategies
      this.initializeStrategies();

      logger.info('MEV Bot initialized successfully');
      
      // Send initialization alert
      await this.services.alerts.sendAlert(
        'MEV Bot initialized and ready to start',
        'info'
      );

      return true;
    } catch (error) {
      logger.error('Initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate required configuration
   */
  validateConfig() {
    const required = [
      'PRIVATE_KEY',
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (!process.env.INFURA_WS_URL && !process.env.ALCHEMY_WS_URL) {
      throw new Error('Either INFURA_WS_URL or ALCHEMY_WS_URL must be set');
    }
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    this.services.db = new Client({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT) || 5432,
    });

    await this.services.db.connect();
    logger.info('Database connected');
  }

  /**
   * Initialize all strategies
   */
  initializeStrategies() {
    // Sandwich strategy (highest priority)
    this.strategies.push(
      new SandwichStrategy(this.services, {
        maxSlippage: parseFloat(process.env.SANDWICH_MAX_SLIPPAGE) || 0.05,
        minVictimTxValue: parseInt(process.env.MIN_TRANSACTION_VALUE_USD) || 10000,
      })
    );

    // Arbitrage strategy
    this.strategies.push(
      new ArbitrageStrategy(this.services, {
        minProfitBps: parseInt(process.env.ARBITRAGE_MIN_PROFIT_BPS) || 30,
        maxHops: 4,
      })
    );

    // Liquidation strategy
    this.strategies.push(
      new LiquidationStrategy(this.services, {
        minBonusBps: parseInt(process.env.LIQUIDATION_MIN_BONUS_BPS) || 500,
      })
    );

    logger.info(`Initialized ${this.strategies.length} strategies`);
  }

  /**
   * Start the bot
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    // Check for emergency stop
    if (process.env.EMERGENCY_STOP === 'true') {
      logger.error('Emergency stop is enabled. Bot will not start.');
      return;
    }

    this.isRunning = true;
    logger.info('Starting MEV Bot...');

    // Dry run mode check
    if (process.env.DRY_RUN_MODE === 'true') {
      logger.warn('DRY RUN MODE: Transactions will be simulated but not executed');
    }

    // Start mempool monitoring
    await this.services.mempool.startListening(async (tx, decoded) => {
      await this.handleTransaction(tx, decoded);
    });

    // Start periodic tasks
    this.startPeriodicTasks();

    logger.info('MEV Bot started successfully');
  }

  /**
   * Handle incoming mempool transaction
   */
  async handleTransaction(tx, decoded) {
    try {
      this.stats.totalOpportunities++;

      // Try each strategy in priority order
      for (const strategy of this.strategies) {
        const result = await strategy.run({ tx, decoded });
        
        if (result && result.success) {
          this.stats.successfulExecutions++;
          this.stats.totalProfit += parseFloat(result.profit || 0);
          
          // Track in database
          await this.trackOpportunity(strategy.name, result);
          
          break; // Opportunity executed, no need to try other strategies
        }
      }
    } catch (error) {
      logger.error('Error handling transaction', { error: error.message });
      this.stats.failedExecutions++;
    }
  }

  /**
   * Track opportunity in database
   */
  async trackOpportunity(strategyName, result) {
    try {
      const query = `
        INSERT INTO opportunities (strategy, tx_hash, profit_usd, executed, detected_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
      `;
      
      await this.services.db.query(query, [
        strategyName,
        result.txHash,
        result.profit,
        true,
      ]);
    } catch (error) {
      logger.error('Failed to track opportunity', { error: error.message });
    }
  }

  /**
   * Start periodic tasks
   */
  startPeriodicTasks() {
    // Send daily summary
    setInterval(async () => {
      await this.sendDailySummary();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Log stats every hour
    setInterval(() => {
      this.logStats();
    }, 60 * 60 * 1000); // 1 hour

    // Health check every 5 minutes
    setInterval(() => {
      this.healthCheck();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Send daily performance summary
   */
  async sendDailySummary() {
    const stats = this.getStats();
    await this.services.alerts.alertDailySummary(stats);
  }

  /**
   * Log current statistics
   */
  logStats() {
    const stats = this.getStats();
    logger.info('Bot Statistics', stats);
  }

  /**
   * Get current statistics
   */
  getStats() {
    const runtime = (Date.now() - this.stats.startTime) / 1000 / 60 / 60; // hours
    const successRate = this.stats.totalOpportunities > 0
      ? (this.stats.successfulExecutions / this.stats.totalOpportunities * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      runtime: `${runtime.toFixed(2)} hours`,
      successRate: `${successRate}%`,
      strategyStats: this.strategies.map(s => ({
        name: s.name,
        ...s.getStats(),
      })),
    };
  }

  /**
   * Health check
   */
  healthCheck() {
    try {
      // Check provider connection
      this.services.provider.getBlockNumber()
        .then(blockNumber => {
          logger.debug('Health check passed', { blockNumber });
        })
        .catch(error => {
          logger.error('Health check failed - provider issue', { error: error.message });
        });

      // Check database connection
      this.services.db.query('SELECT 1')
        .catch(error => {
          logger.error('Health check failed - database issue', { error: error.message });
        });
    } catch (error) {
      logger.error('Health check error', { error: error.message });
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down MEV Bot...');
    this.isRunning = false;

    // Stop mempool listening
    this.services.mempool.stopListening();

    // Close database connection
    await this.services.db.end();

    // Close provider
    await this.services.provider.destroy();

    logger.info('MEV Bot shut down successfully');
    process.exit(0);
  }
}

// Main execution
async function main() {
  const bot = new MEVBot();

  try {
    await bot.initialize();
    await bot.start();
  } catch (error) {
    logger.error('Fatal error', { error: error.message, stack: error.stack });
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await bot.shutdown();
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await bot.shutdown();
  });

  process.on('unhandledRejection', async (error) => {
    logger.error('Unhandled promise rejection', { error: error.message });
    await bot.services.alerts?.alertCritical(error);
  });

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception', { error: error.message });
    await bot.services.alerts?.alertCritical(error);
    await bot.shutdown();
  });
}

// Run the bot
if (require.main === module) {
  main();
}

module.exports = MEVBot;