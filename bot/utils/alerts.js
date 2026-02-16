const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('discord.js');
const logger = require('./logger');

/**
 * Alert system for notifications
 * Supports Telegram and Discord
 */
class AlertSystem {
  constructor(config = {}) {
    this.config = config;
    
    // Initialize Telegram bot
    if (config.telegram?.token) {
      this.telegram = new TelegramBot(config.telegram.token, { polling: false });
      this.telegramChatId = config.telegram.chatId;
    }

    // Initialize Discord client
    if (config.discord?.enabled && config.discord?.webhook) {
      this.discordWebhook = config.discord.webhook;
    }
  }

  /**
   * Send alert via all configured channels
   */
  async sendAlert(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${level.toUpperCase()}] ${timestamp}\n${message}`;

    try {
      // Send to Telegram
      if (this.telegram && this.telegramChatId) {
        await this.telegram.sendMessage(this.telegramChatId, formattedMessage);
      }

      // Send to Discord
      if (this.discordWebhook) {
        await this.sendDiscordWebhook(formattedMessage, level);
      }

      logger.info('Alert sent', { message, level });
    } catch (error) {
      logger.error('Failed to send alert', { error: error.message });
    }
  }

  /**
   * Send Discord webhook
   */
  async sendDiscordWebhook(message, level) {
    const axios = require('axios');
    const color = {
      info: 3447003,    // Blue
      success: 3066993,  // Green
      warning: 16776960, // Yellow
      error: 15158332,   // Red
    }[level] || 3447003;

    try {
      await axios.post(this.discordWebhook, {
        embeds: [{
          title: `MEV Bot Alert - ${level.toUpperCase()}`,
          description: message,
          color,
          timestamp: new Date().toISOString(),
        }],
      });
    } catch (error) {
      logger.error('Discord webhook failed', { error: error.message });
    }
  }

  /**
   * Alert for opportunity detection
   */
  async alertOpportunity(opportunity) {
    const message = `
🎯 Opportunity Detected!
Strategy: ${opportunity.strategy}
Estimated Profit: $${opportunity.profit}
Transaction: ${opportunity.txHash || 'pending'}
    `.trim();

    await this.sendAlert(message, 'info');
  }

  /**
   * Alert for successful execution
   */
  async alertSuccess(execution) {
    const message = `
✅ Execution Successful!
Strategy: ${execution.strategy}
Profit: $${execution.profit}
Gas Used: ${execution.gasUsed}
Transaction: ${execution.txHash}
Block: ${execution.blockNumber}
    `.trim();

    await this.sendAlert(message, 'success');
  }

  /**
   * Alert for failed execution
   */
  async alertFailure(execution) {
    const message = `
❌ Execution Failed!
Strategy: ${execution.strategy}
Error: ${execution.error}
Transaction: ${execution.txHash || 'N/A'}
    `.trim();

    await this.sendAlert(message, 'error');
  }

  /**
   * Alert for critical errors
   */
  async alertCritical(error) {
    const message = `
🚨 CRITICAL ERROR!
${error.message}
Stack: ${error.stack?.substring(0, 500) || 'N/A'}
    `.trim();

    await this.sendAlert(message, 'error');
  }

  /**
   * Daily performance summary
   */
  async alertDailySummary(stats) {
    const message = `
📊 Daily Performance Summary
Total Opportunities: ${stats.totalOpportunities}
Successful Executions: ${stats.successfulExecutions}
Failed Executions: ${stats.failedExecutions}
Total Profit: $${stats.totalProfit}
Total Gas Spent: ${stats.totalGasSpent} ETH
Success Rate: ${stats.successRate}%
    `.trim();

    await this.sendAlert(message, 'info');
  }
}

module.exports = AlertSystem;
