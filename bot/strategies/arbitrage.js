const BaseStrategy = require('./base');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Flash loan arbitrage strategy
 * Profits from price differences across DEXes
 */
class ArbitrageStrategy extends BaseStrategy {
  constructor(services, config = {}) {
    super('Arbitrage', services, config);
    this.minProfitBps = config.minProfitBps || 30; // 0.3%
    this.maxHops = config.maxHops || 4;
  }

  /**
   * Detect arbitrage opportunity by comparing prices across DEXes
   */
  async detect(data) {
    try {
      // If data is a token pair, check for arbitrage
      const { tokenA, tokenB } = data;

      if (!tokenA || !tokenB) {
        return null;
      }

      // Get prices from multiple DEXes
      const dexes = ['uniswapV2', 'sushiswap'];
      const prices = [];

      for (const dexName of dexes) {
        const reserves = await this.services.dex.getReserves(
          tokenA,
          tokenB,
          dexName
        );

        if (reserves) {
          const price = reserves.reserveB
            .mul(ethers.utils.parseEther('1'))
            .div(reserves.reserveA);

          prices.push({
            dex: dexName,
            price,
            reserves,
          });
        }
      }

      if (prices.length < 2) {
        return null;
      }

      // Find price difference
      prices.sort((a, b) => a.price.gt(b.price) ? 1 : -1);

      const buyDex = prices[0]; // Lowest price
      const sellDex = prices[prices.length - 1]; // Highest price

      const priceDiff = sellDex.price.sub(buyDex.price);
      const profitBps = priceDiff
        .mul(10000)
        .div(buyDex.price)
        .toNumber();

      if (profitBps < this.minProfitBps) {
        return null;
      }

      return {
        type: 'arbitrage',
        tokenA,
        tokenB,
        buyDex: buyDex.dex,
        sellDex: sellDex.dex,
        buyPrice: buyDex.price,
        sellPrice: sellDex.price,
        profitBps,
        reserves: {
          buy: buyDex.reserves,
          sell: sellDex.reserves,
        },
      };
    } catch (error) {
      logger.error('Arbitrage detection error', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate profit from arbitrage
   */
  async calculate(opportunity) {
    try {
      const { tokenA, buyPrice, sellPrice, profitBps } = opportunity;

      // Calculate optimal arbitrage amount
      const optimalAmount = this.calculateOptimalArbitrageAmount(
        opportunity.reserves.buy,
        opportunity.reserves.sell
      );

      // Calculate expected profit
      const buyAmountOut = await this.services.dex.getAmountsOut(
        optimalAmount,
        [tokenA, opportunity.tokenB],
        opportunity.buyDex
      );

      const sellAmountOut = await this.services.dex.getAmountsOut(
        buyAmountOut[1],
        [opportunity.tokenB, tokenA],
        opportunity.sellDex
      );

      const grossProfit = sellAmountOut[1].sub(optimalAmount);

      // Get gas prices
      const gasPrice = await this.services.gas.calculateOptimalGas('high');
      
      // Estimate gas (flash loan + 2 swaps)
      const gasLimit = ethers.BigNumber.from(500000);

      // Calculate profit with all costs
      const ethPrice = await this.services.pricing.getEthPrice();
      
      const profit = this.services.profitCalculator.calculateProfit({
        grossProfit: ethers.utils.formatEther(grossProfit),
        gasLimit,
        gasPrice: gasPrice.maxFeePerGas || gasPrice.gasPrice,
        baseFee: gasPrice.maxFeePerGas ? 
          gasPrice.maxFeePerGas.sub(gasPrice.maxPriorityFeePerGas) : undefined,
        priorityFee: gasPrice.maxPriorityFeePerGas,
        flashLoanAmount: ethers.utils.formatEther(optimalAmount),
        ethPriceUSD: ethPrice,
      });

      return profit;
    } catch (error) {
      logger.error('Arbitrage profit calculation error', { error: error.message });
      return null;
    }
  }

  /**
   * Validate arbitrage through simulation
   */
  async validate(opportunity) {
    try {
      // Simulate both swaps
      const buySimulation = await this.services.dex.simulateSwap(
        ethers.utils.parseEther('1'),
        [opportunity.tokenA, opportunity.tokenB],
        opportunity.buyDex
      );

      if (!buySimulation.success) {
        return {
          success: false,
          error: 'Buy swap simulation failed',
        };
      }

      const sellSimulation = await this.services.dex.simulateSwap(
        buySimulation.amountOut,
        [opportunity.tokenB, opportunity.tokenA],
        opportunity.sellDex
      );

      if (!sellSimulation.success) {
        return {
          success: false,
          error: 'Sell swap simulation failed',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Arbitrage validation error', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute arbitrage with flash loan
   */
  async execute(opportunity) {
    try {
      // For now, return a mock execution
      // In production, this would:
      // 1. Build flash loan transaction
      // 2. Encode swap parameters
      // 3. Execute via MEV contract
      
      logger.info('Arbitrage execution not yet implemented');
      
      return {
        success: false,
        error: 'Not implemented - requires deployed MEV contract',
      };
    } catch (error) {
      logger.error('Arbitrage execution error', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Monitor arbitrage execution
   */
  async monitor(txHash) {
    try {
      const receipt = await this.services.provider.waitForTransaction(txHash);
      
      return {
        success: receipt.status === 1,
        txHash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      logger.error('Arbitrage monitoring error', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate optimal arbitrage amount
   * Uses quadratic formula to find optimal input
   */
  calculateOptimalArbitrageAmount(reservesBuy, reservesSell) {
    try {
      // Simplified calculation - in production, use more sophisticated math
      // Start with 10% of smaller reserve
      const minReserve = reservesBuy.reserveA.lt(reservesSell.reserveA)
        ? reservesBuy.reserveA
        : reservesSell.reserveA;

      return minReserve.div(10);
    } catch (error) {
      logger.error('Optimal amount calculation error', { error: error.message });
      return ethers.utils.parseEther('1'); // Default to 1 ETH
    }
  }

  /**
   * Find triangle arbitrage opportunities
   * ETH -> TOKEN1 -> TOKEN2 -> ETH
   */
  async findTriangleArbitrage(tokens) {
    // TODO: Implement triangle arbitrage detection
    logger.info('Triangle arbitrage not yet implemented');
    return null;
  }
}

module.exports = ArbitrageStrategy;
