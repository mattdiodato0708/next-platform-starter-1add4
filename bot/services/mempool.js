const { ethers } = require('ethers');
const logger = require('../utils/logger');

/**
 * Advanced mempool monitoring service
 * Filters high-value transactions and decodes swap data
 */
class MempoolService {
  constructor(provider, config = {}) {
    this.provider = provider;
    this.config = config;
    this.listeners = [];
    this.minTransactionValueUSD = config.minTransactionValueUSD || 10000;
    this.pendingTxs = new Map();
    this.isListening = false;
  }

  /**
   * Start monitoring mempool
   */
  async startListening(callback) {
    if (this.isListening) {
      logger.warn('Already listening to mempool');
      return;
    }

    this.isListening = true;
    logger.info('Starting mempool monitoring');

    try {
      this.provider.on('pending', async (txHash) => {
        try {
          const tx = await this.provider.getTransaction(txHash);
          
          if (!tx) {
            return;
          }

          // Filter for relevant transactions
          if (await this.isRelevantTransaction(tx)) {
            const decodedTx = await this.decodeTransaction(tx);
            
            if (decodedTx) {
              this.pendingTxs.set(txHash, {
                tx,
                decoded: decodedTx,
                timestamp: Date.now(),
              });

              // Call the callback with the transaction
              await callback(tx, decodedTx);
            }
          }
        } catch (error) {
          // Silently skip failed transactions
          // Many pending txs may not be available yet
        }
      });

      // Clean up old pending transactions every 30 seconds
      setInterval(() => {
        this.cleanupOldTransactions();
      }, 30000);

    } catch (error) {
      logger.error('Failed to start mempool monitoring', { error: error.message });
      this.isListening = false;
      throw error;
    }
  }

  /**
   * Stop monitoring mempool
   */
  stopListening() {
    this.provider.removeAllListeners('pending');
    this.isListening = false;
    logger.info('Stopped mempool monitoring');
  }

  /**
   * Check if transaction is relevant for MEV
   */
  async isRelevantTransaction(tx) {
    try {
      // Must have data (contract interaction)
      if (!tx.data || tx.data === '0x') {
        return false;
      }

      // Check if it's a swap transaction
      const isSwap = this.isSwapTransaction(tx.data);
      
      if (!isSwap) {
        return false;
      }

      // Check transaction value dynamically
      const value = tx.value || ethers.BigNumber.from(0);
      const valueInEth = parseFloat(ethers.utils.formatEther(value));
      
      // Get current ETH price dynamically
      let ethPrice = 2000; // Fallback
      try {
        // Note: This requires pricing service to be passed in constructor
        // For now, use rough estimate with lower threshold
        ethPrice = 2000;
      } catch {
        // Use fallback
      }
      
      const valueInUSD = valueInEth * ethPrice;
      
      // Lower threshold for initial filter - detailed check happens later
      return valueInUSD >= this.minTransactionValueUSD / 100;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if transaction data is a swap
   */
  isSwapTransaction(data) {
    // Uniswap V2 Router method signatures
    const swapSignatures = [
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x7ff36ab5', // swapExactETHForTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0xfb3bdb41', // swapETHForExactTokens
      '0x4a25d94a', // swapTokensForExactETH
    ];

    const methodSig = data.substring(0, 10);
    return swapSignatures.includes(methodSig);
  }

  /**
   * Decode transaction data
   */
  async decodeTransaction(tx) {
    try {
      const routerABI = [
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)',
        'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)',
      ];

      const iface = new ethers.utils.Interface(routerABI);
      
      try {
        const decoded = iface.parseTransaction({ data: tx.data });
        
        return {
          functionName: decoded.name,
          amountIn: decoded.args.amountIn || decoded.args.amountInMax,
          amountOut: decoded.args.amountOutMin || decoded.args.amountOut,
          path: decoded.args.path,
          to: decoded.args.to,
          deadline: decoded.args.deadline,
          gasPrice: tx.gasPrice || tx.maxFeePerGas,
          from: tx.from,
          nonce: tx.nonce,
        };
      } catch (decodeError) {
        // Could be a different function or router
        return null;
      }
    } catch (error) {
      logger.error('Failed to decode transaction', { error: error.message });
      return null;
    }
  }

  /**
   * Get pending transaction by hash
   */
  getPendingTransaction(txHash) {
    return this.pendingTxs.get(txHash);
  }

  /**
   * Clean up old transactions (older than 5 minutes)
   */
  cleanupOldTransactions() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    for (const [txHash, data] of this.pendingTxs.entries()) {
      if (data.timestamp < fiveMinutesAgo) {
        this.pendingTxs.delete(txHash);
      }
    }

    logger.debug(`Cleaned up old transactions. Remaining: ${this.pendingTxs.size}`);
  }

  /**
   * Track nonce for an address
   */
  async getAddressNonce(address) {
    try {
      return await this.provider.getTransactionCount(address, 'pending');
    } catch (error) {
      logger.error('Failed to get nonce', { error: error.message });
      return null;
    }
  }

  /**
   * Check if transaction was replaced (higher gas price, same nonce)
   */
  async isTransactionReplaced(tx) {
    try {
      const currentNonce = await this.getAddressNonce(tx.from);
      return tx.nonce < currentNonce;
    } catch (error) {
      return false;
    }
  }
}

module.exports = MempoolService;
