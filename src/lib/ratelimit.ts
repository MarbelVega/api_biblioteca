import { NextRequest } from 'next/server';
import { HttpError, clientMeta } from './http';

// Ventana fija en memoria. En producción con varias instancias usar Redis/Upstash.
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(req: NextRequest, bucket: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${bucket}:${clientMeta(req).ip ?? 'unknown'}`;
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
  } else if (++h.count > limit) {
    throw new HttpError(429, 'Demasiadas solicitudes, intente más tarde');
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}
