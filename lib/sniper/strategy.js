/**
 * Mempool Sniper Bot – Trading Strategy
 *
 * Evaluates whether to buy a newly-detected token and whether an open
 * position should be closed for profit or cut at the stop-loss level.
 */

/**
 * Default strategy parameters.
 * All monetary values are expressed in the native chain currency (e.g. ETH/BNB).
 * Percentages are plain numbers (e.g. 50 = 50 %).
 */
export const DEFAULT_CONFIG = {
    // Minimum liquidity (in ETH/BNB) added to the pool before we buy
    minLiquidityEth: 1,
    // Maximum liquidity so we avoid already-established tokens
    maxLiquidityEth: 50,
    // How much of the native currency to spend per trade
    buyAmountEth: 0.05,
    // Slippage tolerance in percent
    slippagePercent: 10,
    // Gas limit multiplier over the detected base-fee
    gasMultiplier: 1.2,
    // Close trade and take profit when unrealised gain reaches this percentage
    takeProfitPercent: 50,
    // Close trade and cut losses when unrealised loss reaches this percentage
    stopLossPercent: 20,
    // Maximum number of concurrent open positions
    maxOpenPositions: 5
};

/**
 * Decide whether to buy a newly-detected token.
 *
 * @param {{liquidityEth: number}} tokenInfo   Information about the token/pair.
 * @param {object}                 config       Active bot configuration.
 * @param {number}                 openCount    Current number of open positions.
 * @returns {{shouldBuy: boolean, reason: string}}
 */
export function evaluateBuy(tokenInfo, config, openCount) {
    const { minLiquidityEth, maxLiquidityEth, maxOpenPositions } = config;

    if (openCount >= maxOpenPositions) {
        return { shouldBuy: false, reason: 'Max open positions reached' };
    }
    if (tokenInfo.liquidityEth < minLiquidityEth) {
        return { shouldBuy: false, reason: 'Liquidity too low' };
    }
    if (tokenInfo.liquidityEth > maxLiquidityEth) {
        return { shouldBuy: false, reason: 'Liquidity too high (token too old)' };
    }

    return { shouldBuy: true, reason: 'Meets liquidity criteria' };
}

/**
 * Decide whether an open position should be closed.
 *
 * Fix: profit was previously calculated as (current - entry) / current,
 * which underestimates gains and causes sells to trigger too late (or never).
 * The correct formula divides by the ENTRY price, not the current price.
 *
 * @param {{entryPrice: number, tokenAmount: number}} position  Open position data.
 * @param {number}                                    currentPrice  Latest token price.
 * @param {object}                                    config        Active bot configuration.
 * @returns {{shouldSell: boolean, reason: string, profitPercent: number}}
 */
export function evaluateSell(position, currentPrice, config) {
    const { takeProfitPercent, stopLossPercent } = config;

    if (!position || !position.entryPrice || position.entryPrice === 0) {
        return { shouldSell: false, reason: 'Invalid position data', profitPercent: 0 };
    }

    // ✅ Correct profit calculation: divide by ENTRY price
    const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

    if (profitPercent >= takeProfitPercent) {
        return {
            shouldSell: true,
            reason: `Take-profit triggered at ${profitPercent.toFixed(2)}%`,
            profitPercent
        };
    }

    if (profitPercent <= -stopLossPercent) {
        return {
            shouldSell: true,
            reason: `Stop-loss triggered at ${profitPercent.toFixed(2)}%`,
            profitPercent
        };
    }

    return { shouldSell: false, reason: 'Holding', profitPercent };
}

/**
 * Calculate the amount of tokens received for a given ETH spend,
 * accounting for slippage.
 *
 * @param {number} ethAmount   ETH to spend.
 * @param {number} tokenPrice  Current token price in ETH per token.
 * @param {number} slippagePct Slippage tolerance in percent.
 * @returns {number} Minimum tokens expected after slippage.
 */
export function calcMinTokensOut(ethAmount, tokenPrice, slippagePct) {
    if (tokenPrice === 0) return 0;
    const rawTokens = ethAmount / tokenPrice;
    return rawTokens * (1 - slippagePct / 100);
}
