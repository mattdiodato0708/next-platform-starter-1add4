const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Aave V3 Pool ABI (essential functions)
const AAVE_V3_POOL_ABI = [
  'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external',
  'function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata modes, address onBehalfOf, bytes calldata params, uint16 referralCode) external',
];

/**
 * Flash loan service for Aave V3
 * Enables borrowing without collateral for arbitrage
 */
class FlashLoanService {
  constructor(provider, config = {}) {
    this.provider = provider;
    this.config = config;
    
    // Aave V3 Pool address (Ethereum mainnet)
    this.poolAddress = config.aavePoolAddress || '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
    
    this.pool = new ethers.Contract(
      this.poolAddress,
      AAVE_V3_POOL_ABI,
      provider
    );

    // Flash loan fee (0.09% for Aave V3)
    this.flashLoanFeePercent = 0.0009;
  }

  /**
   * Calculate flash loan fee
   */
  calculateFlashLoanFee(amount) {
    const amountBN = ethers.BigNumber.from(amount);
    return amountBN.mul(9).div(10000); // 0.09%
  }

  /**
   * Build flash loan transaction data
   */
  buildFlashLoanTransaction(receiverAddress, asset, amount, params) {
    try {
      const data = this.pool.interface.encodeFunctionData('flashLoanSimple', [
        receiverAddress,
        asset,
        amount,
        params,
        0, // referralCode
      ]);

      return {
        to: this.poolAddress,
        data,
        value: 0,
      };
    } catch (error) {
      logger.error('Failed to build flash loan transaction', { error: error.message });
      throw error;
    }
  }

  /**
   * Build multi-asset flash loan transaction
   */
  buildMultiAssetFlashLoan(receiverAddress, assets, amounts, params) {
    try {
      const modes = assets.map(() => 0); // 0 = no debt, must repay in same transaction

      const data = this.pool.interface.encodeFunctionData('flashLoan', [
        receiverAddress,
        assets,
        amounts,
        modes,
        receiverAddress,
        params,
        0, // referralCode
      ]);

      return {
        to: this.poolAddress,
        data,
        value: 0,
      };
    } catch (error) {
      logger.error('Failed to build multi-asset flash loan', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate profitability of flash loan arbitrage
   */
  calculateFlashLoanProfitability(params) {
    const {
      borrowAmount,
      expectedProfit,
      gasLimit,
      gasPrice,
      ethPriceUSD = 2000,
    } = params;

    try {
      const borrowAmountBN = ethers.BigNumber.from(borrowAmount);
      const flashLoanFee = this.calculateFlashLoanFee(borrowAmountBN);

      // Gas cost
      const gasCostWei = ethers.BigNumber.from(gasPrice).mul(gasLimit);
      const gasCostETH = parseFloat(ethers.utils.formatEther(gasCostWei));
      const gasCostUSD = gasCostETH * ethPriceUSD;

      // Flash loan fee in ETH (assuming borrowing ETH or token valued in ETH)
      const flashLoanFeeETH = parseFloat(ethers.utils.formatEther(flashLoanFee));
      const flashLoanFeeUSD = flashLoanFeeETH * ethPriceUSD;

      // Net profit
      const netProfit = expectedProfit - gasCostUSD - flashLoanFeeUSD;

      return {
        borrowAmount: borrowAmountBN.toString(),
        flashLoanFee: flashLoanFee.toString(),
        flashLoanFeeUSD: flashLoanFeeUSD.toFixed(2),
        gasCostUSD: gasCostUSD.toFixed(2),
        expectedProfit: expectedProfit.toFixed(2),
        netProfit: netProfit.toFixed(2),
        profitable: netProfit > 0,
      };
    } catch (error) {
      logger.error('Failed to calculate flash loan profitability', { 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Encode arbitrage parameters for flash loan callback
   */
  encodeArbitrageParams(params) {
    const {
      dexes,
      path,
      amountIn,
      minAmountOut,
    } = params;

    // Encode parameters that will be passed to executeOperation callback
    const abiCoder = new ethers.utils.AbiCoder();
    
    return abiCoder.encode(
      ['address[]', 'address[]', 'uint256', 'uint256'],
      [dexes, path, amountIn, minAmountOut]
    );
  }

  /**
   * Decode arbitrage parameters in flash loan callback
   */
  decodeArbitrageParams(params) {
    try {
      const abiCoder = new ethers.utils.AbiCoder();
      
      const [dexes, path, amountIn, minAmountOut] = abiCoder.decode(
        ['address[]', 'address[]', 'uint256', 'uint256'],
        params
      );

      return {
        dexes,
        path,
        amountIn,
        minAmountOut,
      };
    } catch (error) {
      logger.error('Failed to decode arbitrage params', { error: error.message });
      return null;
    }
  }

  /**
   * Simulate flash loan execution
   */
  async simulateFlashLoan(receiverAddress, asset, amount) {
    try {
      const tx = this.buildFlashLoanTransaction(
        receiverAddress,
        asset,
        amount,
        '0x'
      );

      // Try to estimate gas
      const gasEstimate = await this.provider.estimateGas({
        ...tx,
        from: receiverAddress,
      });

      return {
        success: true,
        gasEstimate: gasEstimate.toString(),
      };
    } catch (error) {
      logger.error('Flash loan simulation failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get maximum flash loan amount for an asset
   */
  async getMaxFlashLoan(asset) {
    try {
      // For Aave V3, max flash loan is the available liquidity
      // This would require additional contract calls to get reserves
      // For now, return a safe default
      return ethers.utils.parseEther('1000'); // 1000 ETH
    } catch (error) {
      logger.error('Failed to get max flash loan', { error: error.message });
      return ethers.BigNumber.from(0);
    }
  }
}

module.exports = FlashLoanService;
