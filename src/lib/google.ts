import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';
import { HttpError } from './http';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export const redirectUri = () => `${env().APP_URL}/api/auth/google/callback`;

export function newPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export const randomToken = (n = 24) => randomBytes(n).toString('base64url');

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Solo rutas relativas internas (evita open redirect). */
export function safeRedirect(p: string | null): string {
  return p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : '/';
}

export function buildAuthUrl(p: { state: string; nonce: string; challenge: string }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return u.toString();
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const e = env();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new HttpError(401, 'Google rechazó el código de autorización');
  const data = (await r.json()) as { id_token?: string };
  if (!data.id_token) throw new HttpError(401, 'Respuesta de Google sin id_token');
  return data.id_token;
}

export interface GoogleProfile { sub: string; email: string; name?: string; picture?: string }

/** Verifica firma (JWKS de Google), iss, aud, exp, nonce, email verificado y dominio permitido. */
export async function verifyGoogleIdToken(idToken: string, nonce?: string): Promise<GoogleProfile> {
  const e = env();
  let p;
  try {
    ({ payload: p } = await jwtVerify(idToken, JWKS, { issuer: ISSUERS, audience: e.GOOGLE_CLIENT_ID }));
  } catch {
    throw new HttpError(401, 'id_token de Google inválido');
  }
  if (nonce !== undefined && (typeof p.nonce !== 'string' || !safeEqual(p.nonce, nonce))) {
    throw new HttpError(401, 'Nonce inválido');
  }
  if (p.email_verified !== true || typeof p.email !== 'string' || !p.sub) {
    throw new HttpError(403, 'La cuenta de Google no tiene un correo verificado');
  }
  if (e.allowedDomains.length) {
    const domain = p.email.split('@')[1]?.toLowerCase();
    const hd = typeof p.hd === 'string' ? p.hd.toLowerCase() : '';
    if (!domain || !e.allowedDomains.includes(domain) || !e.allowedDomains.includes(hd)) {
      throw new HttpError(403, 'Dominio de correo no autorizado');
    }
  }
  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    name: typeof p.name === 'string' ? p.name : undefined,
    picture: typeof p.picture === 'string' ? p.picture : undefined,
  };
}
