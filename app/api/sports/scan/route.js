import { NextResponse } from 'next/server';
import { runArbScan } from '../../../../lib/sports/arbitrage.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const result = await runArbScan({
            apiKey: body.apiKey || '',
            sports: body.sports || [],
            books: body.books || [],
            baseStake: body.baseStake || 100,
            minArb: body.minArb ?? 3
        });
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { error: err.message || 'Scan failed' },
            { status: err.message?.includes('Invalid API key') ? 401 : 500 }
        );
    }
}
