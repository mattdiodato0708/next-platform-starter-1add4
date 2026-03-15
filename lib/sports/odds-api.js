/**
 * Sports Odds API Integration
 *
 * Fetches live odds from The Odds API across multiple sportsbooks.
 * Uses the WIDGET_API_KEY environment variable (server-side only).
 *
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// ─── Supported sports ─────────────────────────────────────────────────────────

export const AVAILABLE_SPORTS = [
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

// ─── Supported sportsbooks ───────────────────────────────────────────────────

export const AVAILABLE_BOOKS = [
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

// ─── Market types scanned ─────────────────────────────────────────────────────

const MARKETS = ['h2h', 'spreads', 'totals'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(clientKey) {
    return clientKey || process.env.WIDGET_API_KEY || '';
}

export function hasServerKey() {
    return !!process.env.WIDGET_API_KEY;
}

/**
 * Fetch odds for a single sport from The Odds API.
 * Returns the raw API response array of events.
 */
async function fetchSportOdds(sportKey, market, apiKey, bookmakers) {
    const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', 'us,us2');
    url.searchParams.set('markets', market);
    url.searchParams.set('oddsFormat', 'american');
    if (bookmakers.length > 0) {
        url.searchParams.set('bookmakers', bookmakers.join(','));
    }

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid API key');
        if (res.status === 429) throw new Error('API rate limit exceeded — try again later');
        throw new Error(`Odds API error: ${res.status}`);
    }
    return res.json();
}

/**
 * Fetch odds for all selected sports and markets.
 * Returns a flat array of normalised odds entries.
 *
 * @param {Object} opts
 * @param {string}   opts.apiKey     – Client-provided key (falls back to WIDGET_API_KEY)
 * @param {string[]} opts.sports     – Sport keys to scan
 * @param {string[]} opts.books      – Bookmaker keys to include
 * @returns {Promise<{events: Object[], totalGames: number, totalMarkets: number}>}
 */
export async function fetchAllOdds({ apiKey: clientKey, sports, books }) {
    const key = getApiKey(clientKey);
    if (!key) throw new Error('No API key — set WIDGET_API_KEY or provide one in the UI');

    const sportKeys = sports.length > 0 ? sports : AVAILABLE_SPORTS.map((s) => s.id);
    const bookKeys = books.length > 0 ? books : AVAILABLE_BOOKS.map((b) => b.id);

    const allEvents = [];
    let totalMarkets = 0;

    for (const sport of sportKeys) {
        for (const market of MARKETS) {
            try {
                const events = await fetchSportOdds(sport, market, key, bookKeys);
                for (const event of events) {
                    // Tag each event with its sport for later grouping
                    event._sport = sport;
                    event._market = market;
                    totalMarkets++;
                }
                allEvents.push(...events);
            } catch (err) {
                // If key is invalid, throw immediately
                if (err.message.includes('Invalid API key') || err.message.includes('rate limit')) {
                    throw err;
                }
                // Otherwise skip this sport/market combo silently
            }
        }
    }

    // Deduplicate events by id + market
    const seen = new Set();
    const unique = [];
    for (const e of allEvents) {
        const uid = `${e.id}_${e._market}`;
        if (!seen.has(uid)) {
            seen.add(uid);
            unique.push(e);
        }
    }

    const gameIds = new Set(unique.map((e) => e.id));

    return {
        events: unique,
        totalGames: gameIds.size,
        totalMarkets
    };
}
