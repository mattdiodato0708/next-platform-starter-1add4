/**
 * Sports Arbitrage Scanner Engine
 *
 * Scans normalised odds from multiple sportsbooks, detects arbitrage
 * opportunities where the combined implied probability is below 100%,
 * and surfaces only opportunities with a margin ≥ the configured
 * threshold (default 3 %).
 *
 * Also detects "near misses" (0.5 %–threshold) so users can watch
 * lines that are close to flipping into arb territory.
 */

import { fetchAllOdds, AVAILABLE_SPORTS } from './odds-api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function americanToDecimal(odds) {
    if (odds > 0) return odds / 100 + 1;
    return 100 / Math.abs(odds) + 1;
}

function americanToImplied(odds) {
    if (odds > 0) return 100 / (odds + 100);
    return Math.abs(odds) / (Math.abs(odds) + 100);
}

function formatAmerican(odds) {
    return odds > 0 ? `+${odds}` : `${odds}`;
}

const sportNameMap = AVAILABLE_SPORTS.reduce((m, s) => { m[s.id] = s.name; return m; }, {});

// ─── Core arb detection ───────────────────────────────────────────────────────

/**
 * For a given event + market, look at all bookmaker lines and find the
 * best price for each outcome. Then check if an arb exists.
 *
 * Returns null if no arb, or an opportunity object if one is found.
 */
function detectArb(event, market, baseStake) {
    const bookmakers = event.bookmakers || [];
    if (bookmakers.length < 2) return null;

    // Collect all outcomes for this market across books
    const outcomeMap = new Map(); // outcomeName → [{ book, price }]

    for (const bk of bookmakers) {
        const mkt = (bk.markets || []).find((m) => m.key === market);
        if (!mkt) continue;
        for (const outcome of mkt.outcomes || []) {
            const key = outcome.name + (outcome.point != null ? `|${outcome.point}` : '');
            if (!outcomeMap.has(key)) outcomeMap.set(key, []);
            outcomeMap.get(key).push({
                book: bk.title,
                bookKey: bk.key,
                name: outcome.name,
                point: outcome.point,
                price: outcome.price
            });
        }
    }

    // We need at least 2 distinct outcome sides
    const outcomeKeys = Array.from(outcomeMap.keys());
    if (outcomeKeys.length < 2) return null;

    // For two-way markets: find best price per side
    // For spreads/totals: group by matching |point| (Over/Under or opposite spreads)
    const pairs = [];

    if (market === 'h2h') {
        // Two-way (or three-way for soccer): just use all outcomes
        pairs.push(outcomeKeys);
    } else {
        // Group by point value for spreads/totals
        const pointGroups = new Map();
        for (const key of outcomeKeys) {
            const parts = key.split('|');
            const point = parts[1] ?? 'none';
            if (!pointGroups.has(point)) pointGroups.set(point, []);
            pointGroups.get(point).push(key);
        }
        // For totals, Over X and Under X share the same point
        // For spreads, team -X and team +X have mirrored points
        // Check each point group
        for (const [, group] of pointGroups) {
            if (group.length >= 2) pairs.push(group);
        }
        // Also check mirrored spreads (e.g., -3.5 and +3.5)
        if (market === 'spreads') {
            const pointList = Array.from(pointGroups.keys());
            for (let i = 0; i < pointList.length; i++) {
                for (let j = i + 1; j < pointList.length; j++) {
                    const p1 = parseFloat(pointList[i]);
                    const p2 = parseFloat(pointList[j]);
                    if (!isNaN(p1) && !isNaN(p2) && Math.abs(p1 + p2) < 0.001) {
                        const merged = [...(pointGroups.get(pointList[i]) || []), ...(pointGroups.get(pointList[j]) || [])];
                        pairs.push(merged);
                    }
                }
            }
        }
    }

    const results = [];

    for (const group of pairs) {
        // Find best price per outcome in this group
        const bestLegs = [];
        for (const key of group) {
            const entries = outcomeMap.get(key) || [];
            if (entries.length === 0) continue;
            const best = entries.reduce((a, b) => (a.price > b.price ? a : b));
            bestLegs.push(best);
        }

        if (bestLegs.length < 2) continue;

        // Compute implied probability sum
        const impliedSum = bestLegs.reduce((sum, leg) => {
            return sum + americanToImplied(leg.price);
        }, 0);

        const arbPercent = (1 - impliedSum) * 100;

        if (arbPercent <= 0.5) continue; // not even a near miss

        // Calculate optimal stakes
        const legs = bestLegs.map((leg) => {
            const decimal = americanToDecimal(leg.price);
            const implied = americanToImplied(leg.price);
            const stake = (baseStake * implied) / impliedSum;
            const payout = stake * decimal;
            return {
                outcome: leg.name,
                point: leg.point,
                odds: leg.price,
                oddsFormatted: formatAmerican(leg.price),
                decimal: Math.round(decimal * 1000) / 1000,
                book: leg.book,
                bookKey: leg.bookKey,
                stake: Math.round(stake * 100) / 100,
                payout: Math.round(payout * 100) / 100
            };
        });

        const guaranteedPayout = Math.min(...legs.map((l) => l.payout));
        const guaranteedProfit = Math.round((guaranteedPayout - baseStake) * 100) / 100;
        const roi = Math.round((guaranteedProfit / baseStake) * 10000) / 100;

        results.push({
            eventId: event.id,
            sport: event._sport,
            sportName: sportNameMap[event._sport] || event._sport,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            commenceTime: event.commence_time,
            market,
            marketLabel: market === 'h2h' ? 'Moneyline' : market === 'spreads' ? 'Spread' : 'Total',
            arbPercent: Math.round(arbPercent * 100) / 100,
            legs,
            totalStake: baseStake,
            guaranteedPayout: Math.round(guaranteedPayout * 100) / 100,
            guaranteedProfit,
            roi
        });
    }

    return results.length > 0 ? results : null;
}

// ─── Public scan function ─────────────────────────────────────────────────────

/**
 * Run a full arbitrage scan.
 *
 * @param {Object} opts
 * @param {string}   opts.apiKey      – Client API key (falls back to WIDGET_API_KEY env)
 * @param {string[]} opts.sports      – Sport keys to scan
 * @param {string[]} opts.books       – Bookmaker keys
 * @param {number}   opts.baseStake   – Notional stake (USD) for sizing
 * @param {number}   opts.minArb      – Minimum arb % threshold (default 3)
 * @returns {Promise<Object>}         – Scan result
 */
export async function runArbScan({
    apiKey = '',
    sports = [],
    books = [],
    baseStake = 100,
    minArb = 3
} = {}) {
    const { events, totalGames, totalMarkets } = await fetchAllOdds({ apiKey, sports, books });

    const opportunities = [];
    const nearMisses = [];

    for (const event of events) {
        const market = event._market;
        const arbs = detectArb(event, market, baseStake);
        if (!arbs) continue;

        for (const opp of arbs) {
            if (opp.arbPercent >= minArb) {
                opportunities.push(opp);
            } else if (opp.arbPercent >= 0.5) {
                nearMisses.push(opp);
            }
        }
    }

    // Sort: best arb first
    opportunities.sort((a, b) => b.arbPercent - a.arbPercent);
    nearMisses.sort((a, b) => b.arbPercent - a.arbPercent);

    return {
        opportunities,
        nearMisses: nearMisses.slice(0, 20),
        totalGamesScanned: totalGames,
        totalMarketsScanned: totalMarkets,
        scannedAt: new Date().toISOString(),
        minArbThreshold: minArb
    };
}
