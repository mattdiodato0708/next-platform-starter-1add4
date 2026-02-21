import { NextResponse } from 'next/server';
import { updateConfig } from '../../../../lib/sniper/bot.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const result = updateConfig(body);
    return NextResponse.json(result);
}
