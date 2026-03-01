import { NextResponse } from 'next/server';
import { getRecentSignals } from '../../../lib/signals.js';

export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json({ signals: getRecentSignals() });
}
