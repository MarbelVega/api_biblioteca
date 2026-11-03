import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function pgCode(e: unknown): string | undefined {
  return typeof e === 'object' && e && 'code' in e && typeof (e as { code: unknown }).code === 'string'
    ? (e as { code: string }).code
    : undefined;
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Datos inválidos', details: e.flatten() }, { status: 400 });
  }
  const code = pgCode(e);
  if (code === '23505') return NextResponse.json({ error: 'Registro duplicado (valor único ya existente)' }, { status: 409 });
  if (code === '23503') return NextResponse.json({ error: 'Violación de integridad referencial (registro relacionado inexistente o en uso)' }, { status: 409 });
  if (code === '23502' || code === '23514') return NextResponse.json({ error: 'Restricción de datos incumplida' }, { status: 422 });
  if (code?.startsWith('22')) return NextResponse.json({ error: 'Valor con formato inválido' }, { status: 422 });
  console.error('[api] error no controlado', e);
  return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
}

/** Envuelve un handler para centralizar el manejo de errores. */
export function handle<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export function clientMeta(req: NextRequest) {
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent')?.slice(0, 255) ?? null,
  };
}
