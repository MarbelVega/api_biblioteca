import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getPool().query('select 1');
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'db_unavailable' }, { status: 503 });
  }
}
