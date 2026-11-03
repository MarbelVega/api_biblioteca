import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl, newPkce, randomToken, safeRedirect } from '@/lib/google';
import { signTx } from '@/lib/jwt';
import { handle } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { env } from '@/lib/env';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Paso 1: redirige a Google (Authorization Code + PKCE + state + nonce). */
export const GET = handle(async (req: NextRequest) => {
  rateLimit(req, 'oauth-start', 20, 60_000);
  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = newPkce();
  const redirect = safeRedirect(req.nextUrl.searchParams.get('redirect'));

  const res = NextResponse.redirect(buildAuthUrl({ state, nonce, challenge }));
  res.cookies.set('oauth_tx', await signTx({ state, nonce, verifier, redirect }), {
    httpOnly: true,
    secure: env().isProd,
    sameSite: 'lax', // debe viajar en la redirección cross-site desde Google
    path: '/api/auth/google',
    maxAge: 600,
  });
  return res;
});
