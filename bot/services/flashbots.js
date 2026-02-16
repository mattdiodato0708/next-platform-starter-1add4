const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Flashbots integration service
 * Protects transactions from frontrunning via private relay
 */
class FlashbotsService {
  constructor(provider, wallet, config = {}) {
    this.provider = provider;
    this.wallet = wallet;
    this.config = config;
    this.flashbotsProvider = null;
    this.relayUrl = config.flashbotsRelayUrl || 'https://relay.flashbots.net';
  }

  /**
   * Initialize Flashbots provider
   */
  async initialize() {
    try {
      this.flashbotsProvider = await FlashbotsBundleProvider.create(
        this.provider,
        this.wallet,
        this.relayUrl
      );

      logger.info('Flashbots provider initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Flashbots', { error: error.message });
      return false;
    }
  }

  /**
   * Create a Flashbots bundle
   */
  async createBundle(transactions, targetBlockNumber) {
    try {
      const signedTransactions = [];

      for (const tx of transactions) {
        const signedTx = await this.wallet.signTransaction(tx);
        signedTransactions.push(signedTx);
      }

      const bundle = {
        signedBundleTransactions: signedTransactions,
        targetBlockNumber,
      };

      return bundle;
    } catch (error) {
      logger.error('Failed to create bundle', { error: error.message });
      throw error;
    }
  }

  /**
   * Simulate bundle before submission
   */
  async simulateBundle(bundle) {
    try {
      if (!this.flashbotsProvider) {
        await this.initialize();
      }

      const simulation = await this.flashbotsProvider.simulate(
        bundle.signedBundleTransactions,
        bundle.targetBlockNumber
      );

      if ('error' in simulation) {
        logger.error('Bundle simulation failed', { error: simulation.error });
        return {
          success: false,
          error: simulation.error,
        };
      }

      return {
        success: true,
        simulation,
        coinbaseGain: simulation.coinbaseDiff,
        totalGasUsed: simulation.totalGasUsed,
      };
    } catch (error) {
      logger.error('Bundle simulation error', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit bundle to Flashbots relay
   */
  async submitBundle(bundle) {
    try {
      if (!this.flashbotsProvider) {
        await this.initialize();
      }

      const submission = await this.flashbotsProvider.sendBundle(
        bundle.signedBundleTransactions,
        bundle.targetBlockNumber
      );

      logger.info('Bundle submitted', {
        targetBlock: bundle.targetBlockNumber,
        bundleHash: submission.bundleHash,
      });

      return {
        success: true,
        bundleHash: submission.bundleHash,
        submission,
      };
    } catch (error) {
      logger.error('Bundle submission failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Wait for bundle inclusion
   */
  async waitForBundleInclusion(bundleSubmission, targetBlockNumber, maxBlocks = 3) {
    try {
      const resolution = await bundleSubmission.wait();

      if (resolution === 0) {
        logger.info('Bundle included in block', { block: targetBlockNumber });
        return {
          included: true,
          blockNumber: targetBlockNumber,
        };
      } else if (resolution === 1) {
        logger.warn('Bundle not included in target block', { block: targetBlockNumber });
        return {
          included: false,
          reason: 'not_included',
        };
      } else {
        logger.error('Bundle inclusion check failed', { resolution });
        return {
          included: false,
          reason: 'check_failed',
        };
      }
    } catch (error) {
      logger.error('Error waiting for bundle inclusion', { error: error.message });
      return {
        included: false,
        reason: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Create sandwich attack bundle
   */
  async createSandwichBundle(frontRunTx, victimTx, backRunTx, targetBlockNumber) {
    try {
      // Create bundle with proper ordering
      const transactions = [
        frontRunTx,    // Our front-run transaction
        victimTx,      // Victim's transaction (signed by them)
        backRunTx,     // Our back-run transaction
      ];

      const bundle = await this.createBundle(transactions, targetBlockNumber);

      return bundle;
    } catch (error) {
      logger.error('Failed to create sandwich bundle', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate optimal coinbase payment
   */
  calculateCoinbasePayment(expectedProfit, competitionLevel = 'medium') {
    // Pay miners a percentage of expected profit
    const percentages = {
      low: 0.1,      // 10% in low competition
      medium: 0.2,   // 20% in medium competition
      high: 0.3,     // 30% in high competition
      urgent: 0.5,   // 50% for urgent inclusion
    };

    const percentage = percentages[competitionLevel] || 0.2;
    const profitBN = ethers.BigNumber.from(expectedProfit);
    
    return profitBN.mul(Math.floor(percentage * 100)).div(100);
  }

  /**
   * Build transaction with coinbase payment
   */
  buildCoinbasePaymentTx(amount, nonce) {
    return {
      to: '0x0000000000000000000000000000000000000000', // Will be replaced with block.coinbase
      value: amount,
      gasLimit: 21000,
      nonce,
      type: 2, // EIP-1559
    };
  }

  /**
   * Cancel pending bundle
   */
  async cancelBundle(bundleHash) {
    try {
      // Flashbots doesn't support explicit cancellation
      // Submit a conflicting transaction with higher tip to replace it
      logger.info('Note: Flashbots bundles cannot be explicitly cancelled', {
        bundleHash,
      });
      return false;
    } catch (error) {
      logger.error('Bundle cancellation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get bundle stats
   */
  async getBundleStats(bundleHash) {
    try {
      if (!this.flashbotsProvider) {
        await this.initialize();
      }

      const stats = await this.flashbotsProvider.getBundleStats(bundleHash);
      
      return stats;
    } catch (error) {
      logger.error('Failed to get bundle stats', { error: error.message });
      return null;
    }
  }
}

module.exports = FlashbotsService;
