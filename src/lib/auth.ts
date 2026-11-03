import { NextRequest, NextResponse } from 'next/server';
import { HttpError } from './http';
import { verifyAccessToken } from './jwt';
import { env } from './env';

export type Role = 'admin' | 'bibliotecario' | 'lector';
export interface AuthUser { id: string; email: string; role: Role }

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Defensa CSRF para peticiones autenticadas por cookie: el Origin debe ser el de la app. */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin !== new URL(env().APP_URL).origin) {
    throw new HttpError(403, 'Origen no permitido');
  }
}

/** Acepta `Authorization: Bearer <jwt>` o la cookie httpOnly `access_token`. */
export async function authenticate(req: NextRequest): Promise<AuthUser> {
  const header = req.headers.get('authorization');
  let token: string | undefined;
  let viaCookie = false;
  if (header?.toLowerCase().startsWith('bearer ')) {
    token = header.slice(7).trim();
  } else {
    token = req.cookies.get(ACCESS_COOKIE)?.value;
    viaCookie = true;
  }
  if (!token) throw new HttpError(401, 'No autenticado');
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    throw new HttpError(401, 'Token inválido o expirado');
  }
  if (viaCookie && !SAFE_METHODS.has(req.method)) assertSameOrigin(req);
  return { id: claims.sub, email: claims.email, role: claims.role };
}

export function requireRole(user: AuthUser, roles: readonly Role[]) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Permisos insuficientes');
}

export function setAuthCookies(res: NextResponse, access: string, refresh: string) {
  const e = env();
  const base = { httpOnly: true, secure: e.isProd, sameSite: 'strict' as const };
  res.cookies.set(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: e.ACCESS_TOKEN_TTL });
  // El refresh token solo viaja a /api/auth/*
  res.cookies.set(REFRESH_COOKIE, refresh, { ...base, path: '/api/auth', maxAge: e.REFRESH_TOKEN_TTL });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
}
