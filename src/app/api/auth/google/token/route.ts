import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { verifyGoogleIdToken } from '@/lib/google';
import { HttpError, clientMeta, handle } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { createSession, upsertGoogleUser } from '@/lib/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ id_token: z.string().min(20) }).strict();

/**
 * Para clientes SPA/móvil/CLI que ya obtuvieron un id_token con Google Identity Services
 * (el audience debe ser GOOGLE_CLIENT_ID). Devuelve los tokens en JSON.
 */
export const POST = handle(async (req: NextRequest) => {
  rateLimit(req, 'oauth-token', 20, 60_000);
  const { id_token } = body.parse(await req.json().catch(() => ({})));
  const user = await upsertGoogleUser(await verifyGoogleIdToken(id_token));
  if (!user.active) throw new HttpError(403, 'Usuario desactivado');
  const { access, refresh } = await createSession(user, clientMeta(req));
  return NextResponse.json({
    token_type: 'Bearer', access_token: access, expires_in: env().ACCESS_TOKEN_TTL, refresh_token: refresh,
  });
});
