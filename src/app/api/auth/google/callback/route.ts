import { NextRequest, NextResponse } from 'next/server';
import { setAuthCookies } from '@/lib/auth';
import { env } from '@/lib/env';
import { exchangeCode, safeEqual, verifyGoogleIdToken } from '@/lib/google';
import { HttpError, clientMeta, handle } from '@/lib/http';
import { verifyTx } from '@/lib/jwt';
import { rateLimit } from '@/lib/ratelimit';
import { createSession, upsertGoogleUser } from '@/lib/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Paso 2: valida state, intercambia el code (PKCE), verifica el id_token y abre sesión. */
export const GET = handle(async (req: NextRequest) => {
  rateLimit(req, 'oauth-cb', 20, 60_000);
  const sp = req.nextUrl.searchParams;
  if (sp.get('error')) throw new HttpError(400, 'Autenticación cancelada o rechazada por Google');

  const code = sp.get('code');
  const state = sp.get('state');
  const txCookie = req.cookies.get('oauth_tx')?.value;
  if (!code || !state || !txCookie) throw new HttpError(400, 'Solicitud OAuth incompleta');

  const tx = await verifyTx(txCookie).catch(() => {
    throw new HttpError(400, 'Sesión OAuth inválida o expirada');
  });
  if (!safeEqual(tx.state, state)) throw new HttpError(400, 'Parámetro state inválido');

  const idToken = await exchangeCode(code, tx.verifier);
  const profile = await verifyGoogleIdToken(idToken, tx.nonce);
  const user = await upsertGoogleUser(profile);
  if (!user.active) throw new HttpError(403, 'Usuario desactivado');

  const { access, refresh } = await createSession(user, clientMeta(req));
  const res = NextResponse.redirect(new URL(tx.redirect, env().APP_URL));
  setAuthCookies(res, access, refresh);
  res.cookies.set('oauth_tx', '', { path: '/api/auth/google', maxAge: 0 });
  return res;
});
