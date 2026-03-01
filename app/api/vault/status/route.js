import { NextResponse } from 'next/server';
import { getVaultStatus } from '../../../../lib/vault/vault.js';

export const dynamic = 'force-dynamic';

export async function GET() {
    const status = await getVaultStatus();
    return NextResponse.json(status);
}
