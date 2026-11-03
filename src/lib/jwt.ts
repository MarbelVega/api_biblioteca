import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import type { Role } from './auth';

const key = () => new TextEncoder().encode(env().JWT_SECRET);

export interface AccessClaims {
  sub: string;
  email: string;
  role: Role;
}

export async function signAccessToken(u: { id: string; email: string; role: Role }) {
  const e = env();
  return new SignJWT({ email: u.email, role: u.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(u.id)
    .setIssuer(e.JWT_ISSUER)
    .setAudience(e.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${e.ACCESS_TOKEN_TTL}s`)
    .setJti(randomUUID())
    .sign(key());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const e = env();
  const { payload } = await jwtVerify(token, key(), {
    issuer: e.JWT_ISSUER,
    audience: e.JWT_AUDIENCE,
    algorithms: ['HS256'], // evita ataques de confusión de algoritmo
  });
  if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new Error('claims incompletos');
  }
  return { sub: payload.sub, email: payload.email, role: payload.role as Role };
}

// Cookie firmada de corta vida para el flujo OAuth (state/nonce/PKCE).
// Usa otro "audience" para que nunca pueda ser aceptada como access token.
const TX_AUD = 'oauth-tx';
export interface OAuthTx { state: string; nonce: string; verifier: string; redirect: string }

export async function signTx(tx: OAuthTx) {
  return new SignJWT({ ...tx })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(TX_AUD)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key());
}

export async function verifyTx(token: string): Promise<OAuthTx> {
  const { payload } = await jwtVerify(token, key(), { audience: TX_AUD, algorithms: ['HS256'] });
  return payload as unknown as OAuthTx;
}
