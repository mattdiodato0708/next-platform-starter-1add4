import { NextResponse } from 'next/server';
import { hasServerKey } from '../../../../lib/sports/odds-api.js';

export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json({ hasKey: hasServerKey() });
}
