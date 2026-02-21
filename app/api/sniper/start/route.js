import { NextResponse } from 'next/server';
import { startBot } from '../../../../lib/sniper/bot.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const result = startBot(body.config || {});
    return NextResponse.json(result);
}
