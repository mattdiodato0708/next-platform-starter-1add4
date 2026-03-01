import { NextResponse } from 'next/server';
import { withdrawFromVault } from '../../../../lib/vault/vault.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    const { asset, amount } = await request.json().catch(() => ({}));
    if (!asset || amount === undefined) {
        return NextResponse.json({ error: 'asset and amount are required' }, { status: 400 });
    }
    try {
        const result = await withdrawFromVault(asset, amount === 'max' ? 'max' : Number(amount));
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
