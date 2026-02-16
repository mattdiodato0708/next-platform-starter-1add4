const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Dynamic gas optimization service
 * Handles EIP-1559 gas pricing and optimization
 */
class GasService {
  constructor(provider, config = {}) {
    this.provider = provider;
    this.maxGasPriceGwei = config.maxGasPriceGwei || 300;
    this.gasHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Get current gas prices with EIP-1559 support
   */
  async getCurrentGasPrices() {
    try {
      const feeData = await this.provider.getFeeData();
      const block = await this.provider.getBlock('latest');

      return {
        baseFee: feeData.lastBaseFeePerGas,
        maxPriorityFee: feeData.maxPriorityFeePerGas,
        maxFee: feeData.maxFeePerGas,
        gasPrice: feeData.gasPrice,
        blockNumber: block.number,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to get gas prices', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate optimal gas price for transaction
   * @param {String} priority - 'low', 'medium', 'high', or 'urgent'
   */
  async calculateOptimalGas(priority = 'medium') {
    const gasPrices = await this.getCurrentGasPrices();
    
    // Store in history
    this.gasHistory.push(gasPrices);
    if (this.gasHistory.length > this.maxHistorySize) {
      this.gasHistory.shift();
    }

    // Calculate multiplier based on priority
    const multipliers = {
      low: 1.0,
      medium: 1.2,
      high: 1.5,
      urgent: 2.0,
    };

    const multiplier = multipliers[priority] || 1.2;

    // EIP-1559 transaction
    if (gasPrices.baseFee) {
      const maxPriorityFee = gasPrices.maxPriorityFee.mul(
        Math.floor(multiplier * 100)
      ).div(100);
      
      const maxFee = gasPrices.baseFee
        .mul(Math.floor(multiplier * 100))
        .div(100)
        .add(maxPriorityFee);

      // Check against maximum
      const maxGasWei = ethers.utils.parseUnits(
        this.maxGasPriceGwei.toString(),
        'gwei'
      );

      return {
        maxFeePerGas: maxFee.gt(maxGasWei) ? maxGasWei : maxFee,
        maxPriorityFeePerGas: maxPriorityFee,
        type: 2, // EIP-1559
      };
    }

    // Legacy transaction
    const gasPrice = gasPrices.gasPrice.mul(
      Math.floor(multiplier * 100)
    ).div(100);

    const maxGasWei = ethers.utils.parseUnits(
      this.maxGasPriceGwei.toString(),
      'gwei'
    );

    return {
      gasPrice: gasPrice.gt(maxGasWei) ? maxGasWei : gasPrice,
      type: 0, // Legacy
    };
  }

  /**
   * Calculate gas for Flashbots bundle
   * Bundles pay miners directly, not through priority fees
   */
  async calculateBundleGas(targetBlockNumber) {
    try {
      const currentBlock = await this.provider.getBlock('latest');
      const gasPrices = await this.getCurrentGasPrices();

      // For Flashbots, we need to outbid other bundles
      // Calculate competitive coinbase transfer amount
      const blocksAhead = targetBlockNumber - currentBlock.number;
      const urgencyMultiplier = Math.max(1, 3 - blocksAhead);

      const suggestedCoinbasePayment = gasPrices.baseFee
        .mul(150000) // Typical sandwich gas usage
        .mul(urgencyMultiplier)
        .div(10); // 10% of gas cost as tip

      return {
        coinbasePayment: suggestedCoinbasePayment,
        baseFee: gasPrices.baseFee,
        targetBlockNumber,
      };
    } catch (error) {
      logger.error('Failed to calculate bundle gas', { error: error.message });
      throw error;
    }
  }

  /**
   * Estimate if transaction will be included in next block
   */
  async willBeIncludedNextBlock(gasPrice) {
    const gasPrices = await this.getCurrentGasPrices();
    
    // If using EIP-1559
    if (gasPrices.baseFee) {
      const requiredFee = gasPrices.baseFee.add(
        gasPrices.maxPriorityFee.mul(120).div(100)
      );
      return gasPrice.gte(requiredFee);
    }

    // Legacy
    return gasPrice.gte(gasPrices.gasPrice.mul(120).div(100));
  }

  /**
   * Get average gas price from history
   */
  getAverageGasPrice(blocks = 10) {
    if (this.gasHistory.length === 0) return null;

    const recentHistory = this.gasHistory.slice(-blocks);
    const sum = recentHistory.reduce((acc, item) => {
      return acc.add(item.baseFee || item.gasPrice);
    }, ethers.BigNumber.from(0));

    return sum.div(recentHistory.length);
  }

  /**
   * Predict next block base fee (EIP-1559)
   */
  async predictNextBaseFee() {
    try {
      const block = await this.provider.getBlock('latest');
      const baseFee = await this.provider.getFeeData().then(d => d.lastBaseFeePerGas);

      // EIP-1559 base fee calculation
      // If block is more than 50% full, base fee increases by 12.5%
      // If less than 50% full, decreases by 12.5%
      const gasUsedRatio = block.gasUsed.mul(100).div(block.gasLimit);

      if (gasUsedRatio.gt(50)) {
        return baseFee.mul(1125).div(1000); // +12.5%
      } else {
        return baseFee.mul(875).div(1000); // -12.5%
      }
    } catch (error) {
      logger.error('Failed to predict base fee', { error: error.message });
      return null;
    }
  }
}

module.exports = GasService;
