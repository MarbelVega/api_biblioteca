import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { REFRESH_COOKIE, assertSameOrigin, setAuthCookies } from '@/lib/auth';
import { env } from '@/lib/env';
import { HttpError, clientMeta, handle } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { rotateRefresh } from '@/lib/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ refresh_token: z.string().min(20) }).strict();

/** Rotación de refresh token. Modo cookie (navegador) o modo JSON (API/CLI). */
export const POST = handle(async (req: NextRequest) => {
  rateLimit(req, 'refresh', 30, 60_000);
  const json = await req.json().catch(() => null);
  if (json) {
    const { refresh_token } = body.parse(json);
    const t = await rotateRefresh(refresh_token, clientMeta(req));
    return NextResponse.json({
      token_type: 'Bearer', access_token: t.access, expires_in: env().ACCESS_TOKEN_TTL, refresh_token: t.refresh,
    });
  }
  const cookie = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!cookie) throw new HttpError(401, 'Sin refresh token');
  assertSameOrigin(req); // CSRF
  const t = await rotateRefresh(cookie, clientMeta(req));
  const res = NextResponse.json({ expires_in: env().ACCESS_TOKEN_TTL });
  setAuthCookies(res, t.access, t.refresh);
  return res;
});
