import { NextRequest, NextResponse } from 'next/server';
import { authenticate, requireRole } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { handle } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: NextRequest) => {
  requireRole(await authenticate(req), ['admin']);
  const { rows } = await getPool().query(
    'select id, email, name, role, active, created_at, last_login_at from app_user order by created_at',
  );
  return NextResponse.json({ data: rows });
});
