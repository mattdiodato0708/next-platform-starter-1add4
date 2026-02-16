const { BigNumber } = require('bignumber.js');
const logger = require('./logger');

/**
 * Calculate accurate profit for MEV opportunities
 * Considers all costs: gas, DEX fees, slippage, flash loan fees
 */
class ProfitCalculator {
  constructor(config = {}) {
    this.minProfitUSD = config.minProfitUSD || 50;
    this.maxGasPriceGwei = config.maxGasPriceGwei || 300;
  }

  /**
   * Calculate net profit for a transaction
   * @param {Object} params - Calculation parameters
   * @returns {Object} Profit breakdown
   */
  calculateProfit(params) {
    const {
      grossProfit,
      gasLimit,
      gasPrice,
      baseFee,
      priorityFee,
      dexFeePercent = 0.003, // 0.3% for Uniswap V2
      flashLoanFeePercent = 0.0009, // 0.09% for Aave
      flashLoanAmount = 0,
      ethPriceUSD = 2000,
    } = params;

    try {
      // Convert to BigNumber for precision
      const grossProfitBN = new BigNumber(grossProfit);
      
      // Calculate gas costs
      const effectiveGasPrice = baseFee 
        ? new BigNumber(baseFee).plus(priorityFee || 0)
        : new BigNumber(gasPrice);
      
      const gasCostWei = effectiveGasPrice.times(gasLimit);
      const gasCostETH = gasCostWei.dividedBy(1e18);
      const gasCostUSD = gasCostETH.times(ethPriceUSD);

      // Calculate DEX fees
      const dexFees = grossProfitBN.times(dexFeePercent);

      // Calculate flash loan fees if applicable
      const flashLoanFees = flashLoanAmount 
        ? new BigNumber(flashLoanAmount).times(flashLoanFeePercent)
        : new BigNumber(0);

      // Total costs
      const totalCosts = gasCostUSD.plus(dexFees).plus(flashLoanFees);

      // Net profit
      const netProfit = grossProfitBN.minus(totalCosts);
      const profitableAfterGas = netProfit.isGreaterThan(this.minProfitUSD);
      const roi = netProfit.dividedBy(totalCosts).times(100);

      return {
        grossProfit: grossProfitBN.toFixed(2),
        netProfit: netProfit.toFixed(2),
        gasCostUSD: gasCostUSD.toFixed(2),
        dexFees: dexFees.toFixed(2),
        flashLoanFees: flashLoanFees.toFixed(2),
        totalCosts: totalCosts.toFixed(2),
        profitableAfterGas,
        roi: roi.toFixed(2),
        gasLimit: gasLimit.toString(),
        estimatedGasPrice: effectiveGasPrice.toFixed(0),
      };
    } catch (error) {
      logger.error('Error calculating profit', { error: error.message, params });
      return null;
    }
  }

  /**
   * Calculate price impact for a trade
   */
  calculatePriceImpact(reserveIn, reserveOut, amountIn) {
    try {
      const reserveInBN = new BigNumber(reserveIn);
      const reserveOutBN = new BigNumber(reserveOut);
      const amountInBN = new BigNumber(amountIn);

      // Calculate price before trade
      const priceBefore = reserveOutBN.dividedBy(reserveInBN);

      // Calculate price after trade (with 0.3% fee)
      const amountInWithFee = amountInBN.times(0.997);
      const numerator = amountInWithFee.times(reserveOutBN);
      const denominator = reserveInBN.plus(amountInWithFee);
      const amountOut = numerator.dividedBy(denominator);

      const newReserveIn = reserveInBN.plus(amountInBN);
      const newReserveOut = reserveOutBN.minus(amountOut);
      const priceAfter = newReserveOut.dividedBy(newReserveIn);

      // Calculate percentage impact
      const priceImpact = priceBefore.minus(priceAfter)
        .dividedBy(priceBefore)
        .times(100);

      return {
        priceImpact: priceImpact.toFixed(4),
        amountOut: amountOut.toFixed(0),
        priceAfter: priceAfter.toFixed(6),
      };
    } catch (error) {
      logger.error('Error calculating price impact', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate optimal sandwich attack amounts
   */
  calculateSandwichAmounts(victimTx, reserves) {
    try {
      const victimAmountIn = new BigNumber(victimTx.amountIn);
      const reserveIn = new BigNumber(reserves.reserveIn);
      const reserveOut = new BigNumber(reserves.reserveOut);

      // Front-run amount: typically 10-30% of victim's amount
      const frontRunAmount = victimAmountIn.times(0.2);

      // Calculate expected price after front-run
      const amountInWithFee = frontRunAmount.times(0.997);
      const numerator = amountInWithFee.times(reserveOut);
      const denominator = reserveIn.plus(amountInWithFee);
      const frontRunOut = numerator.dividedBy(denominator);

      // New reserves after front-run
      const newReserveIn = reserveIn.plus(frontRunAmount);
      const newReserveOut = reserveOut.minus(frontRunOut);

      // Victim's transaction
      const victimAmountInWithFee = victimAmountIn.times(0.997);
      const victimNumerator = victimAmountInWithFee.times(newReserveOut);
      const victimDenominator = newReserveIn.plus(victimAmountInWithFee);
      const victimOut = victimNumerator.dividedBy(victimDenominator);

      // Final reserves after victim
      const finalReserveIn = newReserveIn.plus(victimAmountIn);
      const finalReserveOut = newReserveOut.minus(victimOut);

      // Back-run: sell the tokens we bought
      const backRunAmountInWithFee = frontRunOut.times(0.997);
      const backRunNumerator = backRunAmountInWithFee.times(finalReserveIn);
      const backRunDenominator = finalReserveOut.plus(backRunAmountInWithFee);
      const backRunOut = backRunNumerator.dividedBy(backRunDenominator);

      // Calculate profit
      const profit = backRunOut.minus(frontRunAmount);

      return {
        frontRunAmount: frontRunAmount.toFixed(0),
        frontRunOut: frontRunOut.toFixed(0),
        backRunAmount: frontRunOut.toFixed(0),
        backRunOut: backRunOut.toFixed(0),
        profit: profit.toFixed(0),
        profitPercentage: profit.dividedBy(frontRunAmount).times(100).toFixed(2),
      };
    } catch (error) {
      logger.error('Error calculating sandwich amounts', { error: error.message });
      return null;
    }
  }
}

module.exports = ProfitCalculator;
