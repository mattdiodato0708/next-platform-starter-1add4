import { NextResponse } from 'next/server';
import { stopBot } from '../../../../lib/sniper/bot.js';

export const dynamic = 'force-dynamic';

export function POST() {
    const result = stopBot();
    return NextResponse.json(result);
}
