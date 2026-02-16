const logger = require('../utils/logger');

/**
 * Base strategy class
 * All MEV strategies inherit from this
 */
class BaseStrategy {
  constructor(name, services, config = {}) {
    this.name = name;
    this.services = services;
    this.config = config;
    this.isActive = true;
    this.stats = {
      opportunitiesDetected: 0,
      opportunitiesExecuted: 0,
      totalProfit: 0,
      totalGasSpent: 0,
      failures: 0,
    };
  }

  /**
   * Detect opportunity from transaction or market state
   * Must be implemented by subclass
   */
  async detect(data) {
    throw new Error('detect() must be implemented by subclass');
  }

  /**
   * Calculate profit for opportunity
   * Must be implemented by subclass
   */
  async calculate(opportunity) {
    throw new Error('calculate() must be implemented by subclass');
  }

  /**
   * Validate opportunity through simulation
   * Must be implemented by subclass
   */
  async validate(opportunity) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Execute the opportunity
   * Must be implemented by subclass
   */
  async execute(opportunity) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Monitor execution result
   * Must be implemented by subclass
   */
  async monitor(txHash) {
    throw new Error('monitor() must be implemented by subclass');
  }

  /**
   * Run the complete strategy flow
   */
  async run(data) {
    if (!this.isActive) {
      return null;
    }

    try {
      // Step 1: Detect opportunity
      const opportunity = await this.detect(data);
      if (!opportunity) {
        return null;
      }

      this.stats.opportunitiesDetected++;
      logger.info(`[${this.name}] Opportunity detected`, { opportunity });

      // Step 2: Calculate profit
      const profitCalculation = await this.calculate(opportunity);
      if (!profitCalculation || !profitCalculation.profitableAfterGas) {
        logger.info(`[${this.name}] Not profitable, skipping`, { 
          profitCalculation 
        });
        return null;
      }

      opportunity.profit = profitCalculation;

      // Step 3: Validate through simulation
      const validation = await this.validate(opportunity);
      if (!validation.success) {
        logger.warn(`[${this.name}] Validation failed`, { 
          error: validation.error 
        });
        return null;
      }

      // Step 4: Execute
      const execution = await this.execute(opportunity);
      if (!execution.success) {
        this.stats.failures++;
        logger.error(`[${this.name}] Execution failed`, { 
          error: execution.error 
        });
        
        // Send failure alert
        if (this.services.alerts) {
          await this.services.alerts.alertFailure({
            strategy: this.name,
            error: execution.error,
            txHash: execution.txHash,
          });
        }
        
        return null;
      }

      this.stats.opportunitiesExecuted++;
      this.stats.totalProfit += parseFloat(profitCalculation.netProfit);
      
      logger.info(`[${this.name}] Execution successful`, { execution });

      // Step 5: Monitor
      const result = await this.monitor(execution.txHash);

      // Send success alert
      if (this.services.alerts) {
        await this.services.alerts.alertSuccess({
          strategy: this.name,
          profit: profitCalculation.netProfit,
          gasUsed: result.gasUsed,
          txHash: execution.txHash,
          blockNumber: result.blockNumber,
        });
      }

      return result;
    } catch (error) {
      logger.error(`[${this.name}] Strategy error`, { 
        error: error.message,
        stack: error.stack,
      });
      
      // Send critical alert
      if (this.services.alerts) {
        await this.services.alerts.alertCritical(error);
      }
      
      return null;
    }
  }

  /**
   * Get strategy statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.opportunitiesDetected > 0
        ? (this.stats.opportunitiesExecuted / this.stats.opportunitiesDetected * 100).toFixed(2)
        : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      opportunitiesDetected: 0,
      opportunitiesExecuted: 0,
      totalProfit: 0,
      totalGasSpent: 0,
      failures: 0,
    };
  }

  /**
   * Enable strategy
   */
  enable() {
    this.isActive = true;
    logger.info(`[${this.name}] Strategy enabled`);
  }

  /**
   * Disable strategy
   */
  disable() {
    this.isActive = false;
    logger.info(`[${this.name}] Strategy disabled`);
  }
}

module.exports = BaseStrategy;
