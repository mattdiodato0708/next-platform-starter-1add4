const { ethers } = require('ethers');
const logger = require('./logger');

/**
 * Pre-execution transaction simulation
 * Validates transactions will succeed before execution
 */
class Simulator {
  constructor(provider) {
    this.provider = provider;
  }

  /**
   * Simulate a transaction using eth_call
   * @param {Object} transaction - Transaction to simulate
   * @returns {Object} Simulation result
   */
  async simulateTransaction(transaction) {
    try {
      const block = await this.provider.getBlock('latest');
      
      // Simulate the transaction
      const result = await this.provider.call(transaction, block.number);
      
      return {
        success: true,
        result,
        blockNumber: block.number,
      };
    } catch (error) {
      logger.error('Transaction simulation failed', {
        error: error.message,
        transaction,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Simulate a bundle of transactions
   * @param {Array} transactions - Array of transactions
   * @returns {Object} Bundle simulation result
   */
  async simulateBundle(transactions) {
    try {
      const results = [];
      
      for (const tx of transactions) {
        const result = await this.simulateTransaction(tx);
        results.push(result);
        
        if (!result.success) {
          return {
            success: false,
            error: `Transaction ${transactions.indexOf(tx)} failed`,
            results,
          };
        }
      }
      
      return {
        success: true,
        results,
      };
    } catch (error) {
      logger.error('Bundle simulation failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Estimate gas for a transaction
   * @param {Object} transaction - Transaction object
   * @returns {BigNumber} Estimated gas
   */
  async estimateGas(transaction) {
    try {
      const gasEstimate = await this.provider.estimateGas(transaction);
      // Add 20% buffer for safety
      return gasEstimate.mul(120).div(100);
    } catch (error) {
      logger.error('Gas estimation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if transaction would revert
   * @param {Object} transaction - Transaction to check
   * @returns {Boolean} True if would revert
   */
  async wouldRevert(transaction) {
    try {
      await this.provider.call(transaction);
      return false;
    } catch (error) {
      return true;
    }
  }

  /**
   * Validate profitability on simulated state
   * @param {Object} opportunity - Opportunity to validate
   * @param {Function} profitCalculator - Profit calculation function
   * @returns {Boolean} True if profitable
   */
  async validateProfitability(opportunity, profitCalculator) {
    try {
      // Simulate the transaction
      const simulation = await this.simulateTransaction(opportunity.transaction);
      
      if (!simulation.success) {
        return false;
      }

      // Calculate profit with simulated result
      const profit = profitCalculator(simulation.result);
      
      return profit && profit.profitableAfterGas;
    } catch (error) {
      logger.error('Profitability validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Detect if transaction is being sandwiched
   * Check for competing transactions in mempool
   */
  async detectSandwich(targetTx) {
    try {
      // Get pending transactions
      const block = await this.provider.getBlock('pending', true);
      
      if (!block || !block.transactions) {
        return false;
      }

      // Check for transactions targeting same pair with higher gas
      const targetGasPrice = targetTx.gasPrice || targetTx.maxFeePerGas;
      const suspiciousTxs = block.transactions.filter(tx => {
        const txGasPrice = tx.gasPrice || tx.maxFeePerGas;
        return txGasPrice && txGasPrice.gt(targetGasPrice);
      });

      return suspiciousTxs.length > 0;
    } catch (error) {
      logger.error('Sandwich detection failed', { error: error.message });
      return false;
    }
  }
}

module.exports = Simulator;
