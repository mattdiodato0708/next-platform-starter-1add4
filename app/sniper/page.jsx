'use client';

import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL = 3000;

const defaultConfig = {
    minLiquidityEth: 1,
    maxLiquidityEth: 50,
    buyAmountEth: 0.05,
    slippagePercent: 10,
    gasMultiplier: 1.2,
    takeProfitPercent: 50,
    stopLossPercent: 20,
    maxOpenPositions: 5
};

export default function SniperPage() {
    const [status, setStatus] = useState(null);
    const [config, setConfig] = useState(defaultConfig);
    const [configSaved, setConfigSaved] = useState(false);
    const [loading, setLoading] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/sniper/status');
            if (res.ok) setStatus(await res.json());
        } catch (_) {}
    }, []);

    useEffect(() => {
        fetchStatus();
        const id = setInterval(fetchStatus, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [fetchStatus]);

    // Sync config form with server config once we have it
    useEffect(() => {
        if (status?.config) setConfig(status.config);
    }, [status?.running]); // only on start/stop, not every poll

    async function handleStart() {
        setLoading(true);
        await fetch('/api/sniper/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        });
        await fetchStatus();
        setLoading(false);
    }

    async function handleStop() {
        setLoading(true);
        await fetch('/api/sniper/stop', { method: 'POST' });
        await fetchStatus();
        setLoading(false);
    }

    async function handleSaveConfig(e) {
        e.preventDefault();
        await fetch('/api/sniper/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
    }

    function cfgField(key, label, step = 'any') {
        return (
            <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 uppercase tracking-wider">{label}</label>
                <input
                    type="number"
                    step={step}
                    value={config[key]}
                    onChange={(e) =>
                        setConfig((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))
                    }
                    className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                />
            </div>
        );
    }

    const running = status?.running ?? false;

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="mb-2">🎯 Mempool Sniper Bot</h1>
                <p className="text-slate-400">
                    Automatically detects new token launches in the mempool, buys based on your
                    strategy, and sells when your take-profit or stop-loss is hit.
                </p>
            </div>

            {/* ── Status bar ── */}
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-slate-800 border border-slate-700">
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-block w-3 h-3 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}
                    />
                    <span className="font-semibold">{running ? 'Running' : 'Stopped'}</span>
                </div>

                {status && (
                    <>
                        <span className="text-slate-400 text-sm">
                            Open positions: <strong>{status.openPositions?.length ?? 0}</strong>
                        </span>
                        <span className="text-slate-400 text-sm">
                            Realized P&amp;L:{' '}
                            <strong
                                className={
                                    (status.totalRealizedPnlEth ?? 0) >= 0
                                        ? 'text-green-400'
                                        : 'text-red-400'
                                }
                            >
                                {(status.totalRealizedPnlEth ?? 0) >= 0 ? '+' : ''}
                                {(status.totalRealizedPnlEth ?? 0).toFixed(6)} ETH
                            </strong>
                        </span>
                    </>
                )}

                <div className="ml-auto flex gap-3">
                    <button
                        onClick={handleStart}
                        disabled={running || loading}
                        className="btn btn-sm bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        ▶ Start
                    </button>
                    <button
                        onClick={handleStop}
                        disabled={!running || loading}
                        className="btn btn-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        ■ Stop
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── Config form ── */}
                <form onSubmit={handleSaveConfig} className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold">⚙️ Strategy Configuration</h2>

                    <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 grid grid-cols-2 gap-4">
                        <div className="col-span-2 text-xs font-semibold text-teal-400 uppercase tracking-wider">
                            Liquidity Filter
                        </div>
                        {cfgField('minLiquidityEth', 'Min Liquidity (ETH)', '0.1')}
                        {cfgField('maxLiquidityEth', 'Max Liquidity (ETH)', '0.1')}

                        <div className="col-span-2 text-xs font-semibold text-teal-400 uppercase tracking-wider mt-2">
                            Trade Settings
                        </div>
                        {cfgField('buyAmountEth', 'Buy Amount (ETH)', '0.001')}
                        {cfgField('slippagePercent', 'Slippage (%)', '0.1')}
                        {cfgField('gasMultiplier', 'Gas Multiplier', '0.1')}
                        {cfgField('maxOpenPositions', 'Max Open Positions', '1')}

                        <div className="col-span-2 text-xs font-semibold text-teal-400 uppercase tracking-wider mt-2">
                            Exit Strategy
                        </div>
                        {cfgField('takeProfitPercent', 'Take Profit (%)', '1')}
                        {cfgField('stopLossPercent', 'Stop Loss (%)', '1')}
                    </div>

                    <button
                        type="submit"
                        className="btn bg-teal-600 hover:bg-teal-500"
                    >
                        {configSaved ? '✓ Saved!' : 'Save Configuration'}
                    </button>
                </form>

                {/* ── Open positions ── */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold">📊 Open Positions</h2>
                    <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-auto max-h-64">
                        {status?.openPositions?.length > 0 ? (
                            <table className="w-full text-sm">
                                <thead className="text-xs text-slate-400 uppercase">
                                    <tr>
                                        <th className="text-left px-3 py-2">Token</th>
                                        <th className="text-right px-3 py-2">Entry</th>
                                        <th className="text-right px-3 py-2">Current</th>
                                        <th className="text-right px-3 py-2">P&amp;L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.openPositions.map((pos) => (
                                        <tr key={pos.tokenAddress} className="border-t border-slate-700">
                                            <td className="px-3 py-2 font-mono">{pos.tokenSymbol}</td>
                                            <td className="text-right px-3 py-2 font-mono text-xs">
                                                {pos.entryPrice.toFixed(8)}
                                            </td>
                                            <td className="text-right px-3 py-2 font-mono text-xs">
                                                {pos.lastPrice.toFixed(8)}
                                            </td>
                                            <td
                                                className={`text-right px-3 py-2 font-semibold ${pos.currentProfitPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                            >
                                                {pos.currentProfitPercent >= 0 ? '+' : ''}
                                                {pos.currentProfitPercent.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-slate-500 text-sm p-4">
                                {running ? 'Watching mempool for opportunities…' : 'No open positions'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Activity log ── */}
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">📋 Activity Log</h2>
                <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 font-mono text-xs overflow-auto max-h-72 flex flex-col gap-0.5">
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
                        <span className="text-slate-600">No activity yet. Start the bot to begin.</span>
                    )}
                </div>
            </div>
        </div>
    );
}
