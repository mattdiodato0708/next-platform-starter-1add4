const { ethers } = require('ethers');
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Real-time pricing service
 * Fetches token prices from multiple sources
 */
class PricingService {
  constructor(config = {}) {
    this.config = config;
    this.priceCache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Get ETH price in USD
   */
  async getEthPrice() {
    try {
      const cached = this.priceCache.get('ETH');
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.price;
      }

      // Try CoinGecko API
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );

      const price = response.data.ethereum.usd;
      this.priceCache.set('ETH', { price, timestamp: Date.now() });
      
      return price;
    } catch (error) {
      logger.error('Failed to fetch ETH price', { error: error.message });
      // Return cached value if available
      const cached = this.priceCache.get('ETH');
      return cached ? cached.price : 2000; // Fallback default
    }
  }

  /**
   * Get token price in USD
   * @param {String} tokenAddress - Token contract address
   */
  async getTokenPrice(tokenAddress) {
    try {
      // Check cache
      const cached = this.priceCache.get(tokenAddress);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.price;
      }

      // Try CoinGecko API (requires contract address)
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`
      );

      const price = response.data[tokenAddress.toLowerCase()]?.usd || 0;
      this.priceCache.set(tokenAddress, { price, timestamp: Date.now() });
      
      return price;
    } catch (error) {
      logger.error('Failed to fetch token price', { 
        error: error.message, 
        tokenAddress 
      });
      return 0;
    }
  }

  /**
   * Calculate USD value of token amount
   */
  async calculateUSDValue(tokenAddress, amount, decimals = 18) {
    try {
      const price = tokenAddress === ethers.constants.AddressZero
        ? await this.getEthPrice()
        : await this.getTokenPrice(tokenAddress);

      const tokenAmount = ethers.utils.formatUnits(amount, decimals);
      return parseFloat(tokenAmount) * price;
    } catch (error) {
      logger.error('Failed to calculate USD value', { error: error.message });
      return 0;
    }
  }

  /**
   * Get price from DEX (Uniswap V2)
   */
  async getPriceFromDEX(tokenA, tokenB, reserves) {
    try {
      const { reserveA, reserveB } = reserves;
      
      // Price of token A in terms of token B
      const price = ethers.BigNumber.from(reserveB)
        .mul(ethers.utils.parseEther('1'))
        .div(reserveA);

      return price;
    } catch (error) {
      logger.error('Failed to get price from DEX', { error: error.message });
      return null;
    }
  }

  /**
   * Compare prices across multiple DEXes
   */
  async comparePrices(tokenA, tokenB, dexes) {
    const prices = [];

    for (const dex of dexes) {
      try {
        const reserves = await dex.getReserves(tokenA, tokenB);
        const price = await this.getPriceFromDEX(tokenA, tokenB, reserves);
        
        prices.push({
          dex: dex.name,
          price,
          reserves,
        });
      } catch (error) {
        logger.warn(`Failed to get price from ${dex.name}`, { 
          error: error.message 
        });
      }
    }

    return prices;
  }

  /**
   * Find best arbitrage opportunity across DEXes
   */
  async findArbitrageOpportunity(tokenA, tokenB, dexes) {
    const prices = await this.comparePrices(tokenA, tokenB, dexes);
    
    if (prices.length < 2) {
      return null;
    }

    // Sort by price
    prices.sort((a, b) => a.price.gt(b.price) ? -1 : 1);

    const buyDex = prices[prices.length - 1]; // Lowest price
    const sellDex = prices[0]; // Highest price

    // Calculate potential profit
    const priceDiff = sellDex.price.sub(buyDex.price);
    const profitPercentage = priceDiff
      .mul(10000)
      .div(buyDex.price)
      .toNumber() / 100;

    if (profitPercentage > 0.5) { // More than 0.5% profit
      return {
        buyDex: buyDex.dex,
        sellDex: sellDex.dex,
        buyPrice: buyDex.price,
        sellPrice: sellDex.price,
        profitPercentage,
      };
    }

    return null;
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
  }
}

module.exports = PricingService;
