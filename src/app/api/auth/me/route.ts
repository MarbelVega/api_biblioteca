import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { HttpError, handle } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: NextRequest) => {
  const u = await authenticate(req);
  const { rows } = await getPool().query(
    'select id, email, name, picture, role, active from app_user where id = $1', [u.id],
  );
  if (!rows[0] || !rows[0].active) throw new HttpError(401, 'Usuario no disponible');
  return NextResponse.json({ data: rows[0] });
});
