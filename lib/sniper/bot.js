/**
 * Mempool Sniper Bot – Engine
 *
 * Manages bot state, position tracking, and the buy/sell execution loop.
 * Positions are held in a module-level Map so they survive across API calls
 * within the same server process.
 */

import { ethers } from 'ethers';
import { evaluateBuy, evaluateSell, DEFAULT_CONFIG } from './strategy.js';

// ─── Bot state ────────────────────────────────────────────────────────────────

let botRunning = false;
let monitorInterval = null;
let provider = null;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const UNISWAP_V2_ROUTER  = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const WETH               = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const ROUTER_ABI = [
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

const ERC20_ABI = [
    'function approve(address spender, uint amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)'
];

const FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const PAIR_ABI = [
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)'
];

const ADD_LIQUIDITY_ETH_ABI      = ['function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) payable returns (uint, uint, uint)'];
const ADD_LIQUIDITY_ETH_SELECTOR = ethers.id('addLiquidityETH(address,uint256,uint256,uint256,address,uint256)').slice(0, 10);

// ─── Blockchain helpers ───────────────────────────────────────────────────────

function getProvider() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error('RPC_URL environment variable is not set');
    return rpcUrl.startsWith('ws')
        ? new ethers.WebSocketProvider(rpcUrl)
        : new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner() {
    const pk = process.env.WALLET_PRIVATE_KEY;
    if (!pk) throw new Error('WALLET_PRIVATE_KEY environment variable is not set');
    return new ethers.Wallet(pk, provider);
}

async function getCurrentPrice(tokenAddress) {
    const factory = new ethers.Contract(UNISWAP_V2_FACTORY, FACTORY_ABI, provider);
    const pairAddr = await factory.getPair(tokenAddress, WETH);
    if (pairAddr === ethers.ZeroAddress) return null;
    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const [r0, r1] = await pair.getReserves();
    const t0 = await pair.token0();
    const [tokenRes, ethRes] = t0.toLowerCase() === tokenAddress.toLowerCase()
        ? [r0, r1] : [r1, r0];
    if (tokenRes === 0n) return null;
    return Number(ethRes) / Number(tokenRes);
}

async function executeBuy(tokenAddress, ethAmount, slippagePct) {
    const signer = getSigner();
    const router = new ethers.Contract(UNISWAP_V2_ROUTER, ROUTER_ABI, signer);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    let decimals = 18;
    try { decimals = await tokenContract.decimals(); } catch (err) {
        addLog('warning', `Could not fetch decimals for ${tokenAddress}: ${err.message}`);
    }

    const ethWei = ethers.parseEther(String(ethAmount));
    const amounts = await router.getAmountsOut(ethWei, [WETH, tokenAddress]);
    const expectedTokensWei = amounts[1];
    const slippageBps = BigInt(Math.round((1 - slippagePct / 100) * 10000));
    const minTokensWei = (expectedTokensWei * slippageBps) / 10000n;

    const deadline = Math.floor(Date.now() / 1000) + 300;
    const feeData = await provider.getFeeData();
    const gasMultBps = BigInt(Math.round(config.gasMultiplier * 10000));
    const baseGasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!baseGasPrice) throw new Error('Could not determine gas price from provider');
    const gasPrice = (baseGasPrice * gasMultBps) / 10000n;

    const tx = await router.swapExactETHForTokens(
        minTokensWei,
        [WETH, tokenAddress],
        signer.address,
        deadline,
        { value: ethWei, gasPrice }
    );
    const receipt = await tx.wait();

    // Parse actual tokens received from the ERC-20 Transfer event to our wallet
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const paddedAddr = ethers.zeroPadValue(signer.address, 32);
    const transferLog = receipt.logs.find(
        (l) =>
            l.topics[0] === transferTopic &&
            l.address.toLowerCase() === tokenAddress.toLowerCase() &&
            l.topics[2] === paddedAddr
    );
    const tokenAmount = transferLog
        ? Number(ethers.formatUnits(transferLog.data, decimals))
        : Number(ethers.formatUnits(minTokensWei, decimals));

    return { success: true, txHash: tx.hash, tokenAmount, ethSpent: ethAmount };
}

async function executeSell(tokenAddress, tokenAmount) {
    const signer = getSigner();
    const router = new ethers.Contract(UNISWAP_V2_ROUTER, ROUTER_ABI, signer);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    let decimals = 18;
    try { decimals = await tokenContract.decimals(); } catch (err) {
        addLog('warning', `Could not fetch decimals for ${tokenAddress}: ${err.message}`);
    }

    const tokenWei = ethers.parseUnits(tokenAmount.toFixed(Math.min(decimals, 15)), decimals);

    const allowance = await tokenContract.allowance(signer.address, UNISWAP_V2_ROUTER);
    if (allowance < tokenWei) {
        const approveTx = await tokenContract.approve(UNISWAP_V2_ROUTER, ethers.MaxUint256);
        await approveTx.wait();
    }

    const amounts = await router.getAmountsOut(tokenWei, [tokenAddress, WETH]);
    const expectedEthWei = amounts[1];
    const slippageBps = BigInt(Math.round((1 - config.slippagePercent / 100) * 10000));
    const minEthWei = (expectedEthWei * slippageBps) / 10000n;

    const deadline = Math.floor(Date.now() / 1000) + 300;
    const feeData = await provider.getFeeData();
    const gasMultBps = BigInt(Math.round(config.gasMultiplier * 10000));
    const baseGasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!baseGasPrice) throw new Error('Could not determine gas price from provider');
    const gasPrice = (baseGasPrice * gasMultBps) / 10000n;

    const tx = await router.swapExactTokensForETH(
        tokenWei,
        minEthWei,
        [tokenAddress, WETH],
        signer.address,
        deadline,
        { gasPrice }
    );
    const receipt = await tx.wait();

    // Parse ETH received from the WETH Withdrawal event
    const withdrawalTopic = ethers.id('Withdrawal(address,uint256)');
    const wlog = receipt.logs.find(
        (l) =>
            l.topics[0] === withdrawalTopic &&
            l.address.toLowerCase() === WETH.toLowerCase()
    );
    const ethReceived = wlog
        ? Number(ethers.formatEther(wlog.data))
        : Number(ethers.formatEther(minEthWei));

    return { success: true, txHash: tx.hash, ethReceived };
}

// ─── Core buy handler ─────────────────────────────────────────────────────────

async function handleNewToken(tokenInfo) {
    if (!botRunning) return;

    const { shouldBuy, reason } = evaluateBuy(tokenInfo, config, positions.size);

    if (!shouldBuy) {
        addLog('info', `Skip ${tokenInfo.tokenAddress}: ${reason}`);
        return;
    }

    try {
        const result = await executeBuy(
            tokenInfo.tokenAddress,
            config.buyAmountEth,
            config.slippagePercent
        );

        const position = {
            tokenAddress: tokenInfo.tokenAddress,
            tokenSymbol: tokenInfo.symbol || tokenInfo.tokenAddress.slice(0, 8),
            entryPrice: tokenInfo.priceEth,
            lastPrice: tokenInfo.priceEth,
            tokenAmount: result.tokenAmount,
            ethSpent: result.ethSpent,
            openedAt: new Date().toISOString(),
            buyTxHash: result.txHash
        };

        positions.set(tokenInfo.tokenAddress, position);
        addLog('success', `Bought ${position.tokenAmount.toFixed(4)} ${position.tokenSymbol} @ ${position.entryPrice.toFixed(8)} ETH (tx: ${result.txHash.slice(0, 12)}…)`);
    } catch (err) {
        addLog('error', `Buy failed for ${tokenInfo.tokenAddress}: ${err.message}`);
    }
}

// ─── Sell checker (called on every monitor tick) ──────────────────────────────

async function checkPositions() {
    if (positions.size === 0) return;

    for (const [tokenAddress, position] of positions) {
        let currentPrice;
        try {
            currentPrice = await getCurrentPrice(tokenAddress);
            if (currentPrice === null) {
                addLog('warning', `Could not fetch price for ${position.tokenSymbol}`);
                continue;
            }
        } catch (err) {
            addLog('error', `Price fetch failed for ${position.tokenSymbol}: ${err.message}`);
            continue;
        }

        position.lastPrice = currentPrice;
        const { shouldSell, reason, profitPercent } = evaluateSell(position, currentPrice, config);

        addLog('info', `${position.tokenSymbol} price=${currentPrice.toFixed(8)} profit=${profitPercent.toFixed(2)}%`);

        if (shouldSell) {
            try {
                const result = await executeSell(tokenAddress, position.tokenAmount);
                const pnl = result.ethReceived - position.ethSpent;
                addLog(
                    pnl >= 0 ? 'success' : 'warning',
                    `Sold ${position.tokenSymbol}: ${reason} | P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(6)} ETH (tx: ${result.txHash.slice(0, 12)}…)`
                );
                positions.delete(tokenAddress);
            } catch (err) {
                addLog('error', `Sell failed for ${position.tokenSymbol}: ${err.message}`);
            }
        }
    }
}

// ─── Real mempool monitor ─────────────────────────────────────────────────────

function startMempoolWatch() {
    if (!process.env.RPC_URL?.startsWith('ws')) {
        addLog('warning', 'Mempool watching requires a WebSocket RPC URL (wss://). New token detection disabled until RPC_URL is a WebSocket endpoint.');
        return;
    }

    const routerIface = new ethers.Interface(ADD_LIQUIDITY_ETH_ABI);

    provider.on('pending', async (txHash) => {
        if (!botRunning) return;
        try {
            const tx = await provider.getTransaction(txHash);
            if (!tx?.to || tx.to.toLowerCase() !== UNISWAP_V2_ROUTER.toLowerCase()) return;
            if (!tx.data?.startsWith(ADD_LIQUIDITY_ETH_SELECTOR)) return;

            const decoded = routerIface.parseTransaction({ data: tx.data, value: tx.value });
            if (!decoded) return;

            const tokenAddress = decoded.args.token;
            const liquidityEth = Number(ethers.formatEther(tx.value ?? 0n));

            let decimals = 18;
            let symbol = tokenAddress.slice(0, 8);
            try {
                const tc = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                [decimals, symbol] = await Promise.all([tc.decimals(), tc.symbol()]);
            } catch (err) {
                addLog('warning', `Could not fetch metadata for ${tokenAddress}: ${err.message}`);
            }

            const tokenAmount = Number(ethers.formatUnits(decoded.args.amountTokenDesired, decimals));
            const priceEth = tokenAmount > 0 ? liquidityEth / tokenAmount : 0;

            await handleNewToken({ tokenAddress, symbol, liquidityEth, priceEth });
        } catch (err) {
            addLog('warning', `Mempool processing failed for tx ${txHash}: ${err.message}`);
        }
    });

    addLog('info', 'Mempool watcher started');
}

// ─── Public bot controls ──────────────────────────────────────────────────────

export function startBot(userConfig = {}) {
    if (botRunning) return { started: false, message: 'Bot already running' };

    if (!process.env.RPC_URL) {
        const msg = 'RPC_URL environment variable is not set';
        addLog('error', msg);
        return { started: false, message: msg };
    }
    if (!process.env.WALLET_PRIVATE_KEY) {
        const msg = 'WALLET_PRIVATE_KEY environment variable is not set';
        addLog('error', msg);
        return { started: false, message: msg };
    }

    try {
        provider = getProvider();
    } catch (err) {
        addLog('error', err.message);
        return { started: false, message: err.message };
    }

    config = { ...DEFAULT_CONFIG, ...userConfig };
    botRunning = true;
    addLog('info', 'Bot started');

    startMempoolWatch();

    monitorInterval = setInterval(() => {
        checkPositions();
    }, 3000);

    return { started: true, message: 'Bot started successfully' };
}

export function stopBot() {
    if (!botRunning) return { stopped: false, message: 'Bot not running' };

    clearInterval(monitorInterval);
    monitorInterval = null;
    botRunning = false;

    if (provider?.destroy) {
        provider.destroy();
    }
    provider = null;

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
