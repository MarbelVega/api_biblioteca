import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE, assertSameOrigin, clearAuthCookies } from '@/lib/auth';
import { handle } from '@/lib/http';
import { revokeFamilyByToken } from '@/lib/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revoca toda la cadena de refresh tokens de la sesión y limpia las cookies. */
export const POST = handle(async (req: NextRequest) => {
  const json = (await req.json().catch(() => null)) as { refresh_token?: string } | null;
  const cookie = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!json?.refresh_token && cookie) assertSameOrigin(req);
  const token = json?.refresh_token ?? cookie;
  if (token) await revokeFamilyByToken(token);
  const res = new NextResponse(null, { status: 204 });
  clearAuthCookies(res);
  return res;
});
