const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Uniswap V2 Router ABI (essential functions)
const UNISWAP_V2_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
];

// Uniswap V2 Pair ABI
const UNISWAP_V2_PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// Uniswap V2 Factory ABI
const UNISWAP_V2_FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

/**
 * DEX interaction service
 * Supports Uniswap V2, V3, SushiSwap
 */
class DEXService {
  constructor(provider, config = {}) {
    this.provider = provider;
    this.config = config;
    
    // Initialize routers
    this.routers = {
      uniswapV2: new ethers.Contract(
        config.uniswapV2Router || '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        UNISWAP_V2_ROUTER_ABI,
        provider
      ),
      sushiswap: new ethers.Contract(
        config.sushiswapRouter || '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
        UNISWAP_V2_ROUTER_ABI,
        provider
      ),
    };

    // Initialize factory
    this.factory = new ethers.Contract(
      config.uniswapV2Factory || '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      UNISWAP_V2_FACTORY_ABI,
      provider
    );
  }

  /**
   * Get pair address for two tokens
   */
  async getPairAddress(tokenA, tokenB, dex = 'uniswapV2') {
    try {
      const pairAddress = await this.factory.getPair(tokenA, tokenB);
      
      if (pairAddress === ethers.constants.AddressZero) {
        logger.warn('Pair does not exist', { tokenA, tokenB, dex });
        return null;
      }

      return pairAddress;
    } catch (error) {
      logger.error('Failed to get pair address', { error: error.message });
      return null;
    }
  }

  /**
   * Get reserves for a token pair
   */
  async getReserves(tokenA, tokenB, dex = 'uniswapV2') {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB, dex);
      
      if (!pairAddress) {
        return null;
      }

      const pair = new ethers.Contract(
        pairAddress,
        UNISWAP_V2_PAIR_ABI,
        this.provider
      );

      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();

      // Ensure correct order
      const [reserveA, reserveB] = token0.toLowerCase() === tokenA.toLowerCase()
        ? [reserve0, reserve1]
        : [reserve1, reserve0];

      return {
        reserveA,
        reserveB,
        pairAddress,
      };
    } catch (error) {
      logger.error('Failed to get reserves', { error: error.message });
      return null;
    }
  }

  /**
   * Get amounts out for a swap
   */
  async getAmountsOut(amountIn, path, dex = 'uniswapV2') {
    try {
      const router = this.routers[dex];
      const amounts = await router.getAmountsOut(amountIn, path);
      
      return amounts;
    } catch (error) {
      logger.error('Failed to get amounts out', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate price impact for a trade
   */
  async calculatePriceImpact(amountIn, path, dex = 'uniswapV2') {
    try {
      const reserves = await this.getReserves(path[0], path[1], dex);
      
      if (!reserves) {
        return null;
      }

      // Price before trade
      const priceBefore = reserves.reserveB
        .mul(ethers.utils.parseEther('1'))
        .div(reserves.reserveA);

      // Amount out with fee (0.3%)
      const amountInWithFee = amountIn.mul(997).div(1000);
      const numerator = amountInWithFee.mul(reserves.reserveB);
      const denominator = reserves.reserveA.add(amountInWithFee);
      const amountOut = numerator.div(denominator);

      // Price after trade
      const newReserveA = reserves.reserveA.add(amountIn);
      const newReserveB = reserves.reserveB.sub(amountOut);
      const priceAfter = newReserveB
        .mul(ethers.utils.parseEther('1'))
        .div(newReserveA);

      // Calculate impact percentage
      const impact = priceBefore
        .sub(priceAfter)
        .mul(10000)
        .div(priceBefore);

      return {
        priceImpact: impact.toNumber() / 100, // Percentage
        amountOut,
        priceBefore,
        priceAfter,
      };
    } catch (error) {
      logger.error('Failed to calculate price impact', { error: error.message });
      return null;
    }
  }

  /**
   * Find optimal path for multi-hop trades
   */
  async findOptimalPath(tokenIn, tokenOut, intermediateTokens = []) {
    const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const paths = [];

    // Direct path
    paths.push([tokenIn, tokenOut]);

    // Path through WETH
    if (tokenIn !== WETH && tokenOut !== WETH) {
      paths.push([tokenIn, WETH, tokenOut]);
    }

    // Paths through intermediate tokens
    for (const intermediate of intermediateTokens) {
      if (intermediate !== tokenIn && intermediate !== tokenOut) {
        paths.push([tokenIn, intermediate, tokenOut]);
        
        // Three-hop through WETH
        if (intermediate !== WETH) {
          paths.push([tokenIn, WETH, intermediate, tokenOut]);
        }
      }
    }

    // Find best path
    let bestPath = null;
    let bestAmountOut = ethers.BigNumber.from(0);

    for (const path of paths) {
      try {
        const amounts = await this.getAmountsOut(
          ethers.utils.parseEther('1'),
          path
        );

        if (amounts && amounts[amounts.length - 1].gt(bestAmountOut)) {
          bestAmountOut = amounts[amounts.length - 1];
          bestPath = path;
        }
      } catch (error) {
        // Path doesn't exist, skip
        continue;
      }
    }

    return bestPath;
  }

  /**
   * Simulate a swap transaction
   */
  async simulateSwap(amountIn, path, dex = 'uniswapV2') {
    try {
      const router = this.routers[dex];
      const amounts = await router.getAmountsOut(amountIn, path);
      
      return {
        success: true,
        amountIn,
        amountOut: amounts[amounts.length - 1],
        path,
        dex,
      };
    } catch (error) {
      logger.error('Swap simulation failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build swap transaction data
   */
  buildSwapTransaction(amountIn, amountOutMin, path, to, deadline, dex = 'uniswapV2') {
    const router = this.routers[dex];
    
    return router.interface.encodeFunctionData('swapExactTokensForTokens', [
      amountIn,
      amountOutMin,
      path,
      to,
      deadline,
    ]);
  }

  /**
   * Decode swap transaction
   */
  decodeSwapTransaction(data) {
    try {
      // Try Uniswap V2 format
      const router = this.routers.uniswapV2;
      const decoded = router.interface.parseTransaction({ data });
      
      return {
        functionName: decoded.name,
        args: decoded.args,
      };
    } catch (error) {
      logger.error('Failed to decode transaction', { error: error.message });
      return null;
    }
  }
}

module.exports = DEXService;
