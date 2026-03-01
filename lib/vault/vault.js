/**
 * Vault Bot – Engine
 *
 * Manages ETH/token deposits into yield-generating DeFi vaults (Aave v3).
 * Positions are held in a module-level Map so they survive across API calls
 * within the same server process.
 */

import { ethers } from 'ethers';

// ─── Vault state ──────────────────────────────────────────────────────────────

/** @type {Map<string, VaultPosition>} asset → position */
const vaultPositions = new Map();

/** Timestamped log ring-buffer (most-recent first). */
const vaultLogs = [];
const MAX_LOGS = 200;

function addLog(level, message) {
    vaultLogs.unshift({ ts: new Date().toISOString(), level, message });
    if (vaultLogs.length > MAX_LOGS) vaultLogs.length = MAX_LOGS;
}

// ─── Constants (Mainnet) ──────────────────────────────────────────────────────

/** Aave v3 Pool proxy on Ethereum mainnet */
const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

/** aToken addresses for commonly deposited assets */
const AAVE_ATOKENS = {
    ETH:  '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', // aEthWETH
    USDC: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', // aEthUSDC
    USDT: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a', // aEthUSDT
    DAI:  '0x018008bfb33d285247A21d44E50697654f754e63'  // aEthDAI
};

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const AAVE_POOL_ABI = [
    'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
    'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
    'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
];

const WETH_GATEWAY_ADDRESS = '0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C'; // Aave WETH Gateway mainnet

const WETH_GATEWAY_ABI = [
    'function depositETH(address pool, address onBehalfOf, uint16 referralCode) external payable',
    'function withdrawETH(address pool, uint256 amount, address to) external'
];

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProvider() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error('RPC_URL environment variable is not set');
    return rpcUrl.startsWith('ws')
        ? new ethers.WebSocketProvider(rpcUrl)
        : new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner(provider) {
    const pk = process.env.WALLET_PRIVATE_KEY;
    if (!pk) throw new Error('WALLET_PRIVATE_KEY environment variable is not set');
    return new ethers.Wallet(pk, provider);
}

// ─── Wallet balance ───────────────────────────────────────────────────────────

async function getWalletBalances(provider, address) {
    const ethBalance = await provider.getBalance(address);

    const tokenAddresses = {
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    };

    const tokenBalances = {};
    for (const [symbol, addr] of Object.entries(tokenAddresses)) {
        try {
            const contract = new ethers.Contract(addr, ERC20_ABI, provider);
            const [bal, decimals] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals()
            ]);
            tokenBalances[symbol] = Number(ethers.formatUnits(bal, decimals));
        } catch {
            tokenBalances[symbol] = 0;
        }
    }

    return {
        ETH: Number(ethers.formatEther(ethBalance)),
        ...tokenBalances
    };
}

// ─── Aave account data ────────────────────────────────────────────────────────

async function getAaveAccountData(provider, address) {
    try {
        const pool = new ethers.Contract(AAVE_V3_POOL, AAVE_POOL_ABI, provider);
        const data = await pool.getUserAccountData(address);
        // All values in USD with 8 decimals (Aave base currency)
        return {
            totalCollateralUsd: Number(ethers.formatUnits(data.totalCollateralBase, 8)),
            totalDebtUsd:       Number(ethers.formatUnits(data.totalDebtBase, 8)),
            availableBorrowUsd: Number(ethers.formatUnits(data.availableBorrowsBase, 8)),
            healthFactor:       Number(ethers.formatUnits(data.healthFactor, 18))
        };
    } catch {
        return { totalCollateralUsd: 0, totalDebtUsd: 0, availableBorrowUsd: 0, healthFactor: 0 };
    }
}

// ─── aToken balance (vault position) ─────────────────────────────────────────

async function getATokenBalance(provider, address, asset) {
    const aTokenAddr = AAVE_ATOKENS[asset];
    if (!aTokenAddr) return 0;
    try {
        const aToken = new ethers.Contract(aTokenAddr, ERC20_ABI, provider);
        const [bal, decimals] = await Promise.all([
            aToken.balanceOf(address),
            aToken.decimals()
        ]);
        return Number(ethers.formatUnits(bal, decimals));
    } catch {
        return 0;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getVaultStatus() {
    if (!process.env.RPC_URL || !process.env.WALLET_PRIVATE_KEY) {
        return {
            configured: false,
            walletAddress: null,
            walletBalances: {},
            aaveAccount: null,
            vaultPositions: [],
            recentLogs: vaultLogs.slice(0, 50)
        };
    }

    let provider;
    try {
        provider = getProvider();
        const signer = getSigner(provider);
        const address = signer.address;

        const [walletBalances, aaveAccount] = await Promise.all([
            getWalletBalances(provider, address),
            getAaveAccountData(provider, address)
        ]);

        // Fetch live aToken balances for each supported asset
        const positionList = await Promise.all(
            Object.keys(AAVE_ATOKENS).map(async (asset) => {
                const deposited = await getATokenBalance(provider, address, asset);
                // Track local deposit cost for P&L
                const tracked = vaultPositions.get(asset);
                const depositedCost = tracked?.depositedCost ?? 0;
                return { asset, deposited, depositedCost };
            })
        );

        return {
            configured: true,
            walletAddress: address,
            walletBalances,
            aaveAccount,
            vaultPositions: positionList.filter((p) => p.deposited > 0),
            recentLogs: vaultLogs.slice(0, 50)
        };
    } catch (err) {
        addLog('error', `Status fetch failed: ${err.message}`);
        return {
            configured: false,
            error: err.message,
            walletAddress: null,
            walletBalances: {},
            aaveAccount: null,
            vaultPositions: [],
            recentLogs: vaultLogs.slice(0, 50)
        };
    } finally {
        if (provider?.destroy) provider.destroy();
    }
}

export async function depositToVault(asset, amount) {
    if (!process.env.RPC_URL)           throw new Error('RPC_URL not set');
    if (!process.env.WALLET_PRIVATE_KEY) throw new Error('WALLET_PRIVATE_KEY not set');

    const provider = getProvider();
    try {
        const signer = getSigner(provider);

        if (asset === 'ETH') {
            const gateway = new ethers.Contract(WETH_GATEWAY_ADDRESS, WETH_GATEWAY_ABI, signer);
            const value = ethers.parseEther(String(amount));
            const tx = await gateway.depositETH(AAVE_V3_POOL, signer.address, 0, { value });
            await tx.wait();
            addLog('success', `Deposited ${amount} ETH into Aave vault (tx: ${tx.hash.slice(0, 12)}…)`);
            // Track cost
            const prev = vaultPositions.get('ETH') ?? { depositedCost: 0 };
            vaultPositions.set('ETH', { depositedCost: prev.depositedCost + amount });
        } else {
            const tokenAddresses = {
                USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F'
            };
            const tokenAddr = tokenAddresses[asset];
            if (!tokenAddr) throw new Error(`Unsupported asset: ${asset}`);

            const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
            const decimals = await token.decimals();
            const amountWei = ethers.parseUnits(String(amount), decimals);

            // Approve Aave pool
            const allowance = await token.allowance(signer.address, AAVE_V3_POOL);
            if (allowance < amountWei) {
                const approveTx = await token.approve(AAVE_V3_POOL, ethers.MaxUint256);
                await approveTx.wait();
            }

            const pool = new ethers.Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
            const tx = await pool.supply(tokenAddr, amountWei, signer.address, 0);
            await tx.wait();
            addLog('success', `Deposited ${amount} ${asset} into Aave vault (tx: ${tx.hash.slice(0, 12)}…)`);
            const prev = vaultPositions.get(asset) ?? { depositedCost: 0 };
            vaultPositions.set(asset, { depositedCost: prev.depositedCost + amount });
        }

        return { success: true };
    } finally {
        if (provider?.destroy) provider.destroy();
    }
}

export async function withdrawFromVault(asset, amount) {
    if (!process.env.RPC_URL)           throw new Error('RPC_URL not set');
    if (!process.env.WALLET_PRIVATE_KEY) throw new Error('WALLET_PRIVATE_KEY not set');

    const provider = getProvider();
    try {
        const signer = getSigner(provider);

        if (asset === 'ETH') {
            const aTokenAddr = AAVE_ATOKENS['ETH'];
            const aToken = new ethers.Contract(aTokenAddr, ERC20_ABI, signer);
            const withdrawWei = amount === 'max'
                ? await aToken.balanceOf(signer.address)
                : ethers.parseEther(String(amount));

            // Approve gateway to spend aTokens
            const allowance = await aToken.allowance(signer.address, WETH_GATEWAY_ADDRESS);
            if (allowance < withdrawWei) {
                const approveTx = await aToken.approve(WETH_GATEWAY_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
            }

            const gateway = new ethers.Contract(WETH_GATEWAY_ADDRESS, WETH_GATEWAY_ABI, signer);
            const tx = await gateway.withdrawETH(AAVE_V3_POOL, withdrawWei, signer.address);
            await tx.wait();
            addLog('success', `Withdrew ${amount === 'max' ? 'all' : amount} ETH from Aave vault (tx: ${tx.hash.slice(0, 12)}…)`);
        } else {
            const tokenAddresses = {
                USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                DAI:  '0x6B175474E89094C44Da98b954EedeAC495271d0F'
            };
            const tokenAddr = tokenAddresses[asset];
            if (!tokenAddr) throw new Error(`Unsupported asset: ${asset}`);

            const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
            const decimals = await token.decimals();
            const withdrawWei = amount === 'max'
                ? ethers.MaxUint256
                : ethers.parseUnits(String(amount), decimals);

            const pool = new ethers.Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
            const tx = await pool.withdraw(tokenAddr, withdrawWei, signer.address);
            await tx.wait();
            addLog('success', `Withdrew ${amount === 'max' ? 'all' : amount} ${asset} from Aave vault (tx: ${tx.hash.slice(0, 12)}…)`);
        }

        return { success: true };
    } finally {
        if (provider?.destroy) provider.destroy();
    }
}
