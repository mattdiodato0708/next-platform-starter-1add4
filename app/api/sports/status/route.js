import { NextResponse } from 'next/server';
import { AVAILABLE_SPORTS, AVAILABLE_BOOKS } from '../../../../lib/sports/odds-api.js';

export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json({
        availableSports: AVAILABLE_SPORTS,
        availableBooks: AVAILABLE_BOOKS
    });
}
