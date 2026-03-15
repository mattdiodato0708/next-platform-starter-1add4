'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL = 30000; // 30s auto-refresh

const ALL_SPORTS = [
    { id: 'americanfootball_nfl', name: 'NFL', emoji: '🏈' },
    { id: 'basketball_nba', name: 'NBA', emoji: '🏀' },
    { id: 'baseball_mlb', name: 'MLB', emoji: '⚾' },
    { id: 'icehockey_nhl', name: 'NHL', emoji: '🏒' },
    { id: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈' },
    { id: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀' },
    { id: 'soccer_epl', name: 'EPL', emoji: '⚽' },
    { id: 'soccer_usa_mls', name: 'MLS', emoji: '⚽' },
    { id: 'mma_mixed_martial_arts', name: 'UFC / MMA', emoji: '🥊' }
];

const ALL_BOOKS = [
    { id: 'draftkings', name: 'DraftKings' },
    { id: 'fanduel', name: 'FanDuel' },
    { id: 'betmgm', name: 'BetMGM' },
    { id: 'caesars', name: 'Caesars' },
    { id: 'pointsbetus', name: 'PointsBet' },
    { id: 'betrivers', name: 'BetRivers' },
    { id: 'espnbet', name: 'ESPN BET' },
    { id: 'bovada', name: 'Bovada' },
    { id: 'betonlineag', name: 'BetOnline' },
    { id: 'mybookieag', name: 'MyBookie' }
];

export default function SportsArbPage() {
    const [apiKey, setApiKey] = useState('');
    const [hasServerKey, setHasServerKey] = useState(false);
    const [baseStake, setBaseStake] = useState(100);
    const [minArb, setMinArb] = useState(3);
    const [selectedSports, setSelectedSports] = useState(ALL_SPORTS.map((s) => s.id));
    const [selectedBooks, setSelectedBooks] = useState(ALL_BOOKS.map((b) => b.id));

    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [sportFilter, setSportFilter] = useState(null);

    const autoScanRef = useRef(false);
    const intervalRef = useRef(null);

    // Check if the server already has a widget key
    useEffect(() => {
        fetch('/api/sports/key-check')
            .then((r) => r.json())
            .then((d) => setHasServerKey(d.hasKey))
            .catch(() => {});
    }, []);

    const hasAnyKey = !!(apiKey.trim() || hasServerKey);

    const runScan = useCallback(async () => {
        if (scanning) return;
        setScanning(true);
        setError(null);
        try {
            const res = await fetch('/api/sports/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey.trim(),
                    sports: selectedSports,
                    books: selectedBooks,
                    baseStake,
                    minArb
                })
            });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setResult(data);
                setSportFilter(null);
            }
        } catch (err) {
            setError(err.message || 'Scan failed');
        } finally {
            setScanning(false);
        }
    }, [apiKey, selectedSports, selectedBooks, baseStake, minArb, scanning]);

    // Auto-scan on first load if server has a key
    useEffect(() => {
        if (hasServerKey && !result && !scanning && !autoScanRef.current) {
            autoScanRef.current = true;
            runScan();
        }
    }, [hasServerKey, result, scanning, runScan]);

    // Auto-refresh interval
    useEffect(() => {
        if (autoRefresh && hasAnyKey) {
            intervalRef.current = setInterval(runScan, POLL_INTERVAL);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoRefresh, hasAnyKey, runScan]);

    const allOpps = result?.opportunities ?? [];
    const nearMisses = result?.nearMisses ?? [];
    const filteredOpps = sportFilter ? allOpps.filter((o) => o.sport === sportFilter) : allOpps;
    const filteredNear = sportFilter ? nearMisses.filter((n) => n.sport === sportFilter) : nearMisses;

    // Get unique sports in results for filter bar
    const resultSports = [...new Set([...allOpps, ...nearMisses].map((o) => o.sport))];

    function toggleSport(id) {
        setSelectedSports((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    }

    function toggleBook(id) {
        setSelectedBooks((prev) =>
            prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* ── Header ── */}
            <div>
                <h1 className="mb-2">🏆 Sports Arbitrage Scanner</h1>
                <p className="text-slate-400">
                    Scans sportsbook odds via widget API, helper grabs info across all books, and
                    pulls arbitrage opportunities over {minArb}% guaranteed profit.
                </p>
            </div>

            {/* ── Controls bar ── */}
            <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 flex flex-col gap-4">
                {/* API key row */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                        <label className="text-xs text-slate-400 uppercase tracking-wider">
                            API Key {hasServerKey && <span className="text-green-400">(server key active)</span>}
                        </label>
                        <input
                            type="password"
                            placeholder={hasServerKey ? '••••••• (using server key)' : 'Paste the-odds-api.com key'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-28">
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Stake ($)</label>
                        <input
                            type="number"
                            min={1}
                            value={baseStake}
                            onChange={(e) => setBaseStake(parseInt(e.target.value) || 100)}
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-24">
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Min Arb %</label>
                        <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={minArb}
                            onChange={(e) => setMinArb(parseFloat(e.target.value) || 3)}
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={runScan}
                            disabled={!hasAnyKey || scanning}
                            className="btn bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 rounded text-sm font-semibold"
                        >
                            {scanning ? '⏳ Scanning…' : '🔍 Scan Now'}
                        </button>
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            disabled={!hasAnyKey}
                            className={`btn px-3 py-1.5 rounded text-sm font-semibold ${
                                autoRefresh
                                    ? 'bg-orange-600 hover:bg-orange-500'
                                    : 'bg-slate-700 hover:bg-slate-600'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            {autoRefresh ? '■ Stop Auto' : '⟳ Auto (30s)'}
                        </button>
                    </div>
                </div>

                {/* Sport & Book selectors */}
                <div className="flex flex-col gap-2">
                    <div>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Sports</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {ALL_SPORTS.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => toggleSport(s.id)}
                                    className={`px-2 py-1 rounded text-xs font-mono ${
                                        selectedSports.includes(s.id)
                                            ? 'bg-teal-700 text-white'
                                            : 'bg-slate-700 text-slate-400'
                                    }`}
                                >
                                    {s.emoji} {s.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Sportsbooks</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {ALL_BOOKS.map((b) => (
                                <button
                                    key={b.id}
                                    onClick={() => toggleBook(b.id)}
                                    className={`px-2 py-1 rounded text-xs font-mono ${
                                        selectedBooks.includes(b.id)
                                            ? 'bg-teal-700 text-white'
                                            : 'bg-slate-700 text-slate-400'
                                    }`}
                                >
                                    {b.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Status bar ── */}
            {(result || error) && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-slate-400 border-b border-slate-700 pb-3">
                    {result && (
                        <>
                            <span>
                                🎯 <strong className="text-white">{result.opportunities.length}</strong> Arbs Found
                            </span>
                            <span>
                                📊 <strong className="text-white">{result.totalGamesScanned}</strong> Games /{' '}
                                <strong className="text-white">{result.totalMarketsScanned}</strong> Markets
                            </span>
                            <span>
                                🕐 Last Scan:{' '}
                                <strong className="text-white">
                                    {new Date(result.scannedAt).toLocaleTimeString()}
                                </strong>
                            </span>
                        </>
                    )}
                    {error && (
                        <span className="text-red-400 font-semibold">
                            ⚠️ {error}
                        </span>
                    )}
                </div>
            )}

            {/* ── Sport filter tabs ── */}
            {resultSports.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setSportFilter(null)}
                        className={`px-3 py-1 rounded text-xs font-semibold ${
                            !sportFilter ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300'
                        }`}
                    >
                        All
                    </button>
                    {resultSports.map((sport) => {
                        const s = ALL_SPORTS.find((x) => x.id === sport);
                        return (
                            <button
                                key={sport}
                                onClick={() => setSportFilter(sport === sportFilter ? null : sport)}
                                className={`px-3 py-1 rounded text-xs font-semibold ${
                                    sportFilter === sport
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-slate-700 text-slate-300'
                                }`}
                            >
                                {s?.emoji} {s?.name || sport}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Arb cards ── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {!hasAnyKey && !result && (
                    <div className="col-span-full py-16 flex flex-col items-center text-slate-500 gap-3">
                        <span className="text-5xl">🔑</span>
                        <h2 className="text-xl font-semibold text-white">Enter Your API Key</h2>
                        <p className="text-sm text-center max-w-md">
                            Paste your <span className="text-teal-400">the-odds-api.com</span> key
                            above, or set <code className="text-teal-400">WIDGET_API_KEY</code> in
                            your environment. Then hit <strong>Scan Now</strong>.
                        </p>
                    </div>
                )}

                {scanning && !result &&
                    Array(4)
                        .fill(0)
                        .map((_, i) => (
                            <div
                                key={i}
                                className="rounded-lg bg-slate-800 border border-slate-700 h-[200px] animate-pulse"
                            />
                        ))
                }

                {filteredOpps.length === 0 && result && allOpps.length === 0 && (
                    <div className="col-span-full py-16 flex flex-col items-center text-slate-500 gap-3">
                        <span className="text-5xl">📡</span>
                        <h2 className="text-xl font-semibold text-white">No Arbs Over {minArb}%</h2>
                        <p className="text-sm text-center max-w-md">
                            {nearMisses.length > 0
                                ? `Found ${nearMisses.length} near-miss${nearMisses.length > 1 ? 'es' : ''} below threshold. Turn on auto-scan to catch line movements.`
                                : 'No opportunities right now. Enable auto-scan to monitor in real-time.'}
                        </p>
                    </div>
                )}

                {filteredOpps.map((opp, i) => (
                    <ArbCard key={`${opp.eventId}-${opp.market}-${i}`} opp={opp} />
                ))}
            </div>

            {/* ── Near misses ── */}
            {filteredNear.length > 0 && (
                <div className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold text-slate-400">
                        👀 Near Misses ({filteredNear.length}) — approaching {minArb}% threshold
                    </h2>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {filteredNear.map((opp, i) => (
                            <ArbCard key={`near-${opp.eventId}-${opp.market}-${i}`} opp={opp} isNearMiss />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Calculator ── */}
            <ArbCalculator />
        </div>
    );
}

// ─── Arb Card Component ───────────────────────────────────────────────────────

function ArbCard({ opp, isNearMiss = false }) {
    const borderColor = isNearMiss ? 'border-yellow-600/50' : 'border-green-600/50';
    const badge = isNearMiss ? 'bg-yellow-800 text-yellow-300' : 'bg-green-800 text-green-300';

    return (
        <div className={`rounded-lg bg-slate-800 border ${borderColor} p-4 flex flex-col gap-3`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">
                        {opp.sportName} · {opp.marketLabel}
                    </span>
                    <span className="font-semibold text-white">
                        {opp.awayTeam} @ {opp.homeTeam}
                    </span>
                    <span className="text-xs text-slate-500">
                        {new Date(opp.commenceTime).toLocaleString()}
                    </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge}`}>
                    {opp.arbPercent}% ARB
                </span>
            </div>

            {/* Legs table */}
            <div className="overflow-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 uppercase">
                        <tr>
                            <th className="text-left px-2 py-1">Outcome</th>
                            <th className="text-left px-2 py-1">Book</th>
                            <th className="text-right px-2 py-1">Odds</th>
                            <th className="text-right px-2 py-1">Stake</th>
                            <th className="text-right px-2 py-1">Payout</th>
                        </tr>
                    </thead>
                    <tbody>
                        {opp.legs.map((leg, j) => (
                            <tr key={j} className="border-t border-slate-700">
                                <td className="px-2 py-1.5 font-mono text-xs">
                                    {leg.outcome}
                                    {leg.point != null && ` (${leg.point > 0 ? '+' : ''}${leg.point})`}
                                </td>
                                <td className="px-2 py-1.5 text-teal-400 text-xs">{leg.book}</td>
                                <td className="text-right px-2 py-1.5 font-mono font-bold text-xs">
                                    {leg.oddsFormatted}
                                </td>
                                <td className="text-right px-2 py-1.5 font-mono text-xs">
                                    ${leg.stake.toFixed(2)}
                                </td>
                                <td className="text-right px-2 py-1.5 font-mono text-xs text-green-400">
                                    ${leg.payout.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs border-t border-slate-700 pt-2">
                <span className="text-slate-400">
                    Total Stake: <strong className="text-white">${opp.totalStake.toFixed(2)}</strong>
                </span>
                <span className="text-slate-400">
                    Guaranteed Profit:{' '}
                    <strong className="text-green-400">+${opp.guaranteedProfit.toFixed(2)}</strong>
                    {' '}({opp.roi}% ROI)
                </span>
            </div>
        </div>
    );
}

// ─── Inline Arb Calculator ────────────────────────────────────────────────────

function ArbCalculator() {
    const [odds1, setOdds1] = useState('');
    const [odds2, setOdds2] = useState('');
    const [stake, setStake] = useState(100);

    function americanToDecimal(o) {
        if (o > 0) return o / 100 + 1;
        return 100 / Math.abs(o) + 1;
    }

    function americanToImplied(o) {
        if (o > 0) return 100 / (o + 100);
        return Math.abs(o) / (Math.abs(o) + 100);
    }

    const o1 = parseInt(odds1, 10);
    const o2 = parseInt(odds2, 10);
    const valid = !isNaN(o1) && !isNaN(o2) && o1 !== 0 && o2 !== 0;

    let calcResult = null;
    if (valid) {
        const imp1 = americanToImplied(o1);
        const imp2 = americanToImplied(o2);
        const total = imp1 + imp2;
        const isArb = total < 1;
        const edge = (1 - total) * 100;
        const s1 = (stake * imp1) / total;
        const s2 = (stake * imp2) / total;
        const p1 = s1 * americanToDecimal(o1);
        const p2 = s2 * americanToDecimal(o2);
        const guar = Math.min(p1, p2);
        const profit = guar - stake;
        calcResult = {
            isArb,
            edge: edge.toFixed(2),
            s1: s1.toFixed(2),
            s2: s2.toFixed(2),
            p1: p1.toFixed(2),
            p2: p2.toFixed(2),
            profit: profit.toFixed(2),
            roi: ((profit / stake) * 100).toFixed(2)
        };
    }

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">🧮 Arb Calculator</h2>
            <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 uppercase">Side 1 Odds</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="+400"
                            value={odds1}
                            onChange={(e) => setOdds1(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-teal-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 uppercase">Side 2 Odds</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="-350"
                            value={odds2}
                            onChange={(e) => setOdds2(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-teal-500"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 uppercase">Total Stake ($)</label>
                        <input
                            type="number"
                            min={1}
                            value={stake}
                            onChange={(e) => setStake(parseInt(e.target.value) || 100)}
                            className="w-28 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-teal-500"
                        />
                    </div>
                </div>

                {calcResult && (
                    <div className={`p-3 rounded border ${calcResult.isArb ? 'border-green-600/50 bg-green-900/20' : 'border-red-600/50 bg-red-900/20'}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                                <span className="text-xs text-slate-400 block">Edge</span>
                                <strong className={calcResult.isArb ? 'text-green-400' : 'text-red-400'}>
                                    {calcResult.edge}%
                                </strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400 block">Bet 1</span>
                                <strong className="text-white">${calcResult.s1}</strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400 block">Bet 2</span>
                                <strong className="text-white">${calcResult.s2}</strong>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400 block">Profit</span>
                                <strong className={calcResult.isArb ? 'text-green-400' : 'text-red-400'}>
                                    {calcResult.isArb ? '+' : ''}${calcResult.profit} ({calcResult.roi}%)
                                </strong>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                            {calcResult.isArb
                                ? '✅ This is an arbitrage opportunity — guaranteed profit regardless of outcome.'
                                : '❌ No arb — combined implied probability exceeds 100%.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
