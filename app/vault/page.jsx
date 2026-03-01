'use client';

import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL = 10000;

const SUPPORTED_ASSETS = ['ETH', 'USDC', 'USDT', 'DAI'];

export default function VaultPage() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [depositAsset, setDepositAsset] = useState('ETH');
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAsset, setWithdrawAsset] = useState('ETH');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [actionMsg, setActionMsg] = useState(null);
    const [signals, setSignals] = useState([]);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/vault/status');
            if (res.ok) setStatus(await res.json());
        } catch (_) {}
    }, []);

    const fetchSignals = useCallback(async () => {
        try {
            const res = await fetch('/api/signals');
            if (res.ok) {
                const data = await res.json();
                setSignals(data.signals ?? []);
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchSignals();
        const id = setInterval(() => { fetchStatus(); fetchSignals(); }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchStatus, fetchSignals]);

    function showMsg(type, text) {
        setActionMsg({ type, text });
        setTimeout(() => setActionMsg(null), 4000);
    }

    async function handleDeposit(e) {
        e.preventDefault();
        if (!depositAmount || Number(depositAmount) <= 0) return;
        setLoading(true);
        try {
            const res = await fetch('/api/vault/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset: depositAsset, amount: depositAmount })
            });
            const data = await res.json();
            if (res.ok) {
                showMsg('success', `Deposited ${depositAmount} ${depositAsset} into Aave vault`);
                setDepositAmount('');
                await fetchStatus();
            } else {
                showMsg('error', data.error || 'Deposit failed');
            }
        } catch (err) {
            showMsg('error', err.message);
        }
        setLoading(false);
    }

    async function handleWithdraw(e) {
        e.preventDefault();
        const amount = withdrawAmount === '' ? 'max' : withdrawAmount;
        setLoading(true);
        try {
            const res = await fetch('/api/vault/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset: withdrawAsset, amount })
            });
            const data = await res.json();
            if (res.ok) {
                showMsg('success', `Withdrew ${amount === 'max' ? 'all' : amount} ${withdrawAsset} from vault`);
                setWithdrawAmount('');
                await fetchStatus();
            } else {
                showMsg('error', data.error || 'Withdrawal failed');
            }
        } catch (err) {
            showMsg('error', err.message);
        }
        setLoading(false);
    }

    return (
        <div className="flex flex-col gap-8">
            {/* ── Header ── */}
            <div>
                <h1 className="mb-2">🏦 DeFi Vault Bot</h1>
                <p className="text-slate-400">
                    Deposit assets into Aave v3 to earn yield automatically. Profits from the Sniper
                    Bot can be securely stored here to compound your returns.
                </p>
            </div>

            {/* ── Action message ── */}
            {actionMsg && (
                <div
                    className={`px-4 py-3 rounded-lg text-sm font-medium ${
                        actionMsg.type === 'success'
                            ? 'bg-green-900/50 border border-green-700 text-green-300'
                            : 'bg-red-900/50 border border-red-700 text-red-300'
                    }`}
                >
                    {actionMsg.text}
                </div>
            )}

            {/* ── Not configured warning ── */}
            {status && !status.configured && (
                <div className="px-4 py-3 rounded-lg bg-yellow-900/40 border border-yellow-700 text-yellow-300 text-sm">
                    ⚠️ RPC_URL and/or WALLET_PRIVATE_KEY are not configured. Set them in your
                    environment variables (or Replit Secrets) to enable vault operations.
                    {status.error && (
                        <span className="block mt-1 text-yellow-400 font-mono">{status.error}</span>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── Wallet Balances ── */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold">💰 Wallet Balances</h2>
                    <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 flex flex-col gap-3">
                        {status?.walletAddress ? (
                            <>
                                <p className="font-mono text-xs text-slate-400 break-all">
                                    {status.walletAddress}
                                </p>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    {Object.entries(status.walletBalances ?? {}).map(([symbol, bal]) => (
                                        <div
                                            key={symbol}
                                            className="flex justify-between px-3 py-2 rounded bg-slate-700"
                                        >
                                            <span className="text-slate-300 text-sm font-medium">
                                                {symbol}
                                            </span>
                                            <span className="font-mono text-sm">
                                                {Number(bal).toFixed(symbol === 'ETH' ? 6 : 2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-slate-500 text-sm">Wallet not connected</p>
                        )}
                    </div>

                    {/* ── Aave Account ── */}
                    {status?.aaveAccount && status.aaveAccount.totalCollateralUsd > 0 && (
                        <>
                            <h2 className="text-lg font-semibold">📈 Aave Account</h2>
                            <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 grid grid-cols-2 gap-3">
                                <AccountStat
                                    label="Collateral"
                                    value={`$${status.aaveAccount.totalCollateralUsd.toFixed(2)}`}
                                    color="text-green-400"
                                />
                                <AccountStat
                                    label="Debt"
                                    value={`$${status.aaveAccount.totalDebtUsd.toFixed(2)}`}
                                    color="text-red-400"
                                />
                                <AccountStat
                                    label="Borrow Power"
                                    value={`$${status.aaveAccount.availableBorrowUsd.toFixed(2)}`}
                                />
                                <AccountStat
                                    label="Health Factor"
                                    value={status.aaveAccount.healthFactor > 1000
                                        ? '∞'
                                        : status.aaveAccount.healthFactor.toFixed(2)}
                                    color={
                                        status.aaveAccount.healthFactor > 2
                                            ? 'text-green-400'
                                            : status.aaveAccount.healthFactor > 1.2
                                              ? 'text-yellow-400'
                                              : 'text-red-400'
                                    }
                                />
                            </div>
                        </>
                    )}

                    {/* ── Vault Positions ── */}
                    <h2 className="text-lg font-semibold">🏦 Vault Positions</h2>
                    <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-auto">
                        {status?.vaultPositions?.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-400 uppercase">
                                    <tr>
                                        <th className="text-left px-3 py-2">Asset</th>
                                        <th className="text-right px-3 py-2">Deposited</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.vaultPositions.map((pos) => (
                                        <tr key={pos.asset} className="border-t border-slate-700">
                                            <td className="px-3 py-2 font-semibold">{pos.asset}</td>
                                            <td className="text-right px-3 py-2 font-mono text-xs text-green-400">
                                                {pos.deposited.toFixed(pos.asset === 'ETH' ? 6 : 2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-slate-500 text-sm p-4">No active vault positions</p>
                        )}
                    </div>
                </div>

                {/* ── Actions ── */}
                <div className="flex flex-col gap-6">
                    {/* Deposit form */}
                    <form onSubmit={handleDeposit} className="flex flex-col gap-4">
                        <h2 className="text-lg font-semibold">⬇️ Deposit to Vault</h2>
                        <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400 uppercase tracking-wider">
                                    Asset
                                </label>
                                <select
                                    value={depositAsset}
                                    onChange={(e) => setDepositAsset(e.target.value)}
                                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                                >
                                    {SUPPORTED_ASSETS.map((a) => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400 uppercase tracking-wider">
                                    Amount
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={depositAmount}
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                    placeholder={`e.g. 0.1`}
                                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !status?.configured}
                            className="btn bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing…' : `Deposit ${depositAsset}`}
                        </button>
                    </form>

                    {/* Withdraw form */}
                    <form onSubmit={handleWithdraw} className="flex flex-col gap-4">
                        <h2 className="text-lg font-semibold">⬆️ Withdraw from Vault</h2>
                        <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400 uppercase tracking-wider">
                                    Asset
                                </label>
                                <select
                                    value={withdrawAsset}
                                    onChange={(e) => setWithdrawAsset(e.target.value)}
                                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                                >
                                    {SUPPORTED_ASSETS.map((a) => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400 uppercase tracking-wider">
                                    Amount{' '}
                                    <span className="normal-case text-slate-500">
                                        (leave blank to withdraw all)
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    placeholder="All"
                                    className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !status?.configured}
                            className="btn bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing…' : `Withdraw ${withdrawAsset}`}
                        </button>
                    </form>
                </div>
            </div>

            {/* ── Activity Log ── */}
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">📋 Vault Activity Log</h2>
                <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 font-mono text-xs overflow-auto max-h-64 flex flex-col gap-0.5">
                    {status?.recentLogs?.length > 0 ? (
                        status.recentLogs.map((entry, i) => (
                            <div
                                key={i}
                                className={
                                    entry.level === 'success'
                                        ? 'text-green-400'
                                        : entry.level === 'error'
                                          ? 'text-red-400'
                                          : entry.level === 'warning'
                                            ? 'text-yellow-400'
                                            : 'text-slate-400'
                                }
                            >
                                <span className="text-slate-600">
                                    {new Date(entry.ts).toLocaleTimeString()}
                                </span>{' '}
                                {entry.message}
                            </div>
                        ))
                    ) : (
                        <span className="text-slate-600">
                            No vault activity yet. Deposit assets to start earning yield.
                        </span>
                    )}
                </div>
            </div>

            {/* ── Inter-Bot Signal Feed ── */}
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">📡 Inter-Bot Signal Feed</h2>
                <p className="text-sm text-slate-400">
                    Signals received from the{' '}
                    <a href="/sniper" className="text-teal-400">Sniper Bot</a>.
                    When a profitable trade completes, a{' '}
                    <span className="font-mono text-yellow-300">PROFIT_REALIZED</span> signal is
                    automatically received here and the profit is deposited into Aave.
                </p>
                <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 font-mono text-xs overflow-auto max-h-48 flex flex-col gap-0.5">
                    {signals.length > 0 ? (
                        signals.map((sig) => (
                            <div key={sig.id} className={
                                sig.type === 'PROFIT_REALIZED'      ? 'text-yellow-300' :
                                sig.type === 'VAULT_DEPOSIT_DONE'   ? 'text-green-400'  :
                                sig.type === 'VAULT_DEPOSIT_FAILED' ? 'text-red-400'    :
                                'text-slate-400'
                            }>
                                <span className="text-slate-600">
                                    {new Date(sig.ts).toLocaleTimeString()}
                                </span>{' '}
                                <span className={sig.consumed ? 'opacity-50' : ''}>
                                    [{sig.type}]{sig.consumed ? ' ✓consumed' : ' ⏳pending'}{' '}
                                    {sig.type === 'PROFIT_REALIZED' && sig.data?.tokenSymbol &&
                                        `${sig.data.tokenSymbol} +${Number(sig.data.pnlEth).toFixed(6)} ETH`}
                                    {sig.type === 'VAULT_DEPOSIT_DONE' &&
                                        `+${Number(sig.data?.pnlEth).toFixed(6)} ETH auto-deposited to Aave`}
                                    {sig.type === 'VAULT_DEPOSIT_FAILED' &&
                                        `failed: ${sig.data?.error}`}
                                </span>
                            </div>
                        ))
                    ) : (
                        <span className="text-slate-600">No signals yet. Signals appear when the Sniper Bot executes profitable trades.</span>
                    )}
                </div>
            </div>
        </div>
    );
}

function AccountStat({ label, value, color = 'text-white' }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
            <span className={`font-semibold ${color}`}>{value}</span>
        </div>
    );
}
