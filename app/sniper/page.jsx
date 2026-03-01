'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
    const [errorMsg, setErrorMsg] = useState(null);
    const [signals, setSignals] = useState([]);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/sniper/status');
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

    // Sync config form with server config once we have it
    useEffect(() => {
        if (status?.config) setConfig(status.config);
    }, [status?.running]); // only on start/stop, not every poll

    function showError(msg) {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 5000);
    }

    async function handleStart() {
        setLoading(true);
        try {
            const res = await fetch('/api/sniper/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });
            const data = await res.json();
            if (!data.started) showError(data.message || 'Failed to start bot');
        } catch (err) {
            showError(err.message);
        }
        await fetchStatus();
        setLoading(false);
    }

    async function handleStop() {
        setLoading(true);
        try {
            const res = await fetch('/api/sniper/stop', { method: 'POST' });
            const data = await res.json();
            if (!data.stopped) showError(data.message || 'Failed to stop bot');
        } catch (err) {
            showError(err.message);
        }
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

            {/* ── Workspace error banner ── */}
            {errorMsg && (
                <div className="px-4 py-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm font-medium">
                    ⚠️ Runner workspace error: {errorMsg}
                </div>
            )}

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

            {/* ── Replit Setup paste-box ── */}
            <ReplitSetup />

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

            {/* ── Inter-Bot Signal Feed ── */}
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">📡 Inter-Bot Signal Feed</h2>
                <p className="text-sm text-slate-400">
                    Signals emitted by this bot and consumed by the{' '}
                    <a href="/vault" className="text-teal-400">Vault Bot</a>.
                    When a profitable sell completes, a{' '}
                    <span className="font-mono text-yellow-300">PROFIT_REALIZED</span> signal is sent
                    and the Vault Bot auto-deposits the profit into Aave.
                </p>
                <div className="rounded-lg bg-slate-900 border border-slate-700 p-3 font-mono text-xs overflow-auto max-h-48 flex flex-col gap-0.5">
                    {signals.length > 0 ? (
                        signals.map((sig) => (
                            <div key={sig.id} className={
                                sig.type === 'PROFIT_REALIZED'    ? 'text-yellow-300' :
                                sig.type === 'VAULT_DEPOSIT_DONE' ? 'text-green-400'  :
                                sig.type === 'VAULT_DEPOSIT_FAILED' ? 'text-red-400'  :
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
                                        `+${Number(sig.data?.pnlEth).toFixed(6)} ETH deposited to Aave`}
                                    {sig.type === 'VAULT_DEPOSIT_FAILED' &&
                                        `failed: ${sig.data?.error}`}
                                </span>
                            </div>
                        ))
                    ) : (
                        <span className="text-slate-600">No signals yet. Signals appear when the bot executes profitable trades.</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Replit Setup paste-box ────────────────────────────────────────────────

const REPLIT_SNIPPET = `# ── Paste this into your Replit Secrets (or .env file) ──────────────────────
# In Replit: click the 🔒 "Secrets" tab in the left sidebar,
# then add each variable below as a new secret.

# Ethereum / BSC JSON-RPC endpoint (use Infura, Alchemy, QuickNode, etc.)
RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID

# Your trading wallet private key (keep this secret – never commit it!)
WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# ── Bot behaviour ─────────────────────────────────────────────────────────────
# The bot scans the mempool consistently on every tick (no random skipping).
# Adjust the values below to tune your strategy:
MIN_LIQUIDITY_ETH=1
MAX_LIQUIDITY_ETH=50
BUY_AMOUNT_ETH=0.05
SLIPPAGE_PERCENT=10
GAS_MULTIPLIER=1.2
TAKE_PROFIT_PERCENT=50
STOP_LOSS_PERCENT=20
MAX_OPEN_POSITIONS=5

# ── How to run in Replit ──────────────────────────────────────────────────────
# 1. Open your Replit project.
# 2. Click the 🔒 "Secrets" icon in the left sidebar.
# 3. Add each KEY=value pair above as a separate secret.
# 4. Open the Shell tab and run:  npm run dev
# 5. Navigate to /sniper in the preview, then click ▶ Start.
# The bot now scans every tick and executes trades automatically.`;

function ReplitSetup() {
    const [copied, setCopied] = useState(false);
    const textRef = useRef(null);

    function handleCopy() {
        navigator.clipboard
            .writeText(REPLIT_SNIPPET)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
                // Fallback for environments without clipboard API
                if (textRef.current) {
                    textRef.current.select();
                    document.execCommand('copy');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            });
    }

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">📋 Replit Setup — Paste Box</h2>
            <p className="text-sm text-slate-400">
                Copy the snippet below and paste it into your Replit{' '}
                <span className="text-teal-400 font-mono">Secrets</span> (🔒 left sidebar) or{' '}
                <span className="text-teal-400 font-mono">.env</span> file. The bot will then
                scan the mempool <strong>consistently on every tick</strong> and automatically
                execute buy / sell trades based on your strategy settings.
            </p>
            <div className="relative">
                <textarea
                    ref={textRef}
                    readOnly
                    rows={28}
                    value={REPLIT_SNIPPET}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 p-4 font-mono text-xs text-slate-300 resize-none focus:outline-none focus:border-teal-500"
                />
                <button
                    onClick={handleCopy}
                    className="absolute top-3 right-3 btn btn-sm bg-teal-700 hover:bg-teal-600 text-white"
                >
                    {copied ? '✓ Copied!' : 'Copy'}
                </button>
            </div>
        </div>
    );
}
