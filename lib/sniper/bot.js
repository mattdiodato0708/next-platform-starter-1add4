/**
 * Mempool Sniper Bot – Engine
 *
 * Manages bot state, position tracking, and the buy/sell execution loop.
 * Positions are held in a module-level Map so they survive across API calls
 * within the same server process.
 */

import { evaluateBuy, evaluateSell, calcMinTokensOut, DEFAULT_CONFIG } from './strategy.js';

// ─── Bot state ────────────────────────────────────────────────────────────────

let botRunning = false;
let monitorInterval = null;
let config = { ...DEFAULT_CONFIG };

/** @type {Map<string, import('./strategy.js').Position>} tokenAddress → position */
const positions = new Map();

/** Timestamped log ring-buffer (most-recent first). */
const logs = [];
const MAX_LOGS = 200;

function addLog(level, message) {
    logs.unshift({ ts: new Date().toISOString(), level, message });
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

// ─── Simulated blockchain helpers ────────────────────────────────────────────
// In production these would use ethers.js / web3.js to interact with a real
// DEX (Uniswap v2, PancakeSwap, etc.).  Here we simulate price movement so
// the strategy and sell logic can be exercised end-to-end.

function simulateCurrentPrice(position) {
    // Random walk: ±30 % per check, biased slightly positive
    const change = (Math.random() * 0.6 - 0.25);
    return position.lastPrice * (1 + change);
}

function simulateBuy(tokenAddress, ethAmount, tokenPrice, slippagePct) {
    const minTokens = calcMinTokensOut(ethAmount, tokenPrice, slippagePct);
    return {
        success: true,
        txHash: `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`,
        tokenAmount: minTokens,
        ethSpent: ethAmount
    };
}

function simulateSell(tokenAddress, tokenAmount, currentPrice) {
    const ethReceived = tokenAmount * currentPrice;
    return {
        success: true,
        txHash: `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`,
        ethReceived
    };
}

// ─── Core buy handler ─────────────────────────────────────────────────────────

export function handleNewToken(tokenInfo) {
    if (!botRunning) return;

    const { shouldBuy, reason } = evaluateBuy(tokenInfo, config, positions.size);

    if (!shouldBuy) {
        addLog('info', `Skip ${tokenInfo.tokenAddress}: ${reason}`);
        return;
    }

    const tokenPrice = tokenInfo.priceEth;
    const result = simulateBuy(
        tokenInfo.tokenAddress,
        config.buyAmountEth,
        tokenPrice,
        config.slippagePercent
    );

    if (!result.success) {
        addLog('error', `Buy failed for ${tokenInfo.tokenAddress}`);
        return;
    }

    const position = {
        tokenAddress: tokenInfo.tokenAddress,
        tokenSymbol: tokenInfo.symbol || tokenInfo.tokenAddress.slice(0, 8),
        entryPrice: tokenPrice,         // price at which we bought
        lastPrice: tokenPrice,
        tokenAmount: result.tokenAmount,
        ethSpent: result.ethSpent,
        openedAt: new Date().toISOString(),
        buyTxHash: result.txHash
    };

    positions.set(tokenInfo.tokenAddress, position);
    addLog('success', `Bought ${position.tokenAmount.toFixed(4)} ${position.tokenSymbol} @ ${tokenPrice.toFixed(8)} ETH (tx: ${result.txHash.slice(0, 12)}…)`);
}

// ─── Sell checker (called on every monitor tick) ──────────────────────────────

function checkPositions() {
    if (positions.size === 0) return;

    for (const [tokenAddress, position] of positions) {
        const currentPrice = simulateCurrentPrice(position);
        position.lastPrice = currentPrice;

        const { shouldSell, reason, profitPercent } = evaluateSell(position, currentPrice, config);

        addLog('info', `${position.tokenSymbol} price=${currentPrice.toFixed(8)} profit=${profitPercent.toFixed(2)}%`);

        if (shouldSell) {
            const result = simulateSell(tokenAddress, position.tokenAmount, currentPrice);

            if (result.success) {
                const pnl = result.ethReceived - position.ethSpent;
                addLog(
                    pnl >= 0 ? 'success' : 'warning',
                    `Sold ${position.tokenSymbol}: ${reason} | P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(6)} ETH (tx: ${result.txHash.slice(0, 12)}…)`
                );
                positions.delete(tokenAddress);
            } else {
                addLog('error', `Sell failed for ${position.tokenSymbol}`);
            }
        }
    }
}

// ─── Simulated mempool monitor ────────────────────────────────────────────────

function simulateMempoolEvent() {
    // Randomly surface a "new token launch" event
    if (Math.random() > 0.3) return; // 70 % of ticks produce no event

    const tokenAddress = `0x${Math.random().toString(16).slice(2).padEnd(40, '0')}`;
    const liquidityEth = 0.5 + Math.random() * 60;
    const priceEth = 0.000001 + Math.random() * 0.00001;
    const symbol = `TKN${Math.floor(Math.random() * 9000 + 1000)}`;

    handleNewToken({ tokenAddress, symbol, liquidityEth, priceEth });
}

// ─── Public bot controls ──────────────────────────────────────────────────────

export function startBot(userConfig = {}) {
    if (botRunning) return { started: false, message: 'Bot already running' };

    config = { ...DEFAULT_CONFIG, ...userConfig };
    botRunning = true;
    addLog('info', 'Bot started');

    monitorInterval = setInterval(() => {
        simulateMempoolEvent();
        checkPositions();
    }, 3000); // check every 3 s

    return { started: true, message: 'Bot started successfully' };
}

export function stopBot() {
    if (!botRunning) return { stopped: false, message: 'Bot not running' };

    clearInterval(monitorInterval);
    monitorInterval = null;
    botRunning = false;
    addLog('info', 'Bot stopped');

    return { stopped: true, message: 'Bot stopped' };
}

export function updateConfig(newConfig) {
    config = { ...DEFAULT_CONFIG, ...newConfig };
    addLog('info', 'Configuration updated');
    return { updated: true, config };
}

export function getStatus() {
    const positionList = Array.from(positions.values()).map((p) => ({
        ...p,
        currentProfitPercent: p.entryPrice > 0
            ? ((p.lastPrice - p.entryPrice) / p.entryPrice) * 100
            : 0
    }));

    const closedPnl = logs
        .filter((l) => l.message.startsWith('Sold ') && l.message.includes('P&L'))
        .reduce((sum, l) => {
            const match = l.message.match(/P&L ([+-]?\d+\.\d+)/);
            return sum + (match ? parseFloat(match[1]) : 0);
        }, 0);

    return {
        running: botRunning,
        config,
        openPositions: positionList,
        recentLogs: logs.slice(0, 50),
        totalRealizedPnlEth: closedPnl
    };
}
