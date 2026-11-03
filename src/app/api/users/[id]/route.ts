import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, requireRole } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { HttpError, handle } from '@/lib/http';
import { revokeAllForUser } from '@/lib/sessions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  role: z.enum(['admin', 'bibliotecario', 'lector']).optional(),
  active: z.boolean().optional(),
}).strict();

type Ctx = { params: Promise<{ id: string }> };

/** Solo admin. Cambiar rol/estado revoca las sesiones del usuario. */
export const PATCH = handle<Ctx>(async (req: NextRequest, { params }) => {
  const me = await authenticate(req);
  requireRole(me, ['admin']);
  const { id } = await params;
  const data = body.parse(await req.json().catch(() => ({})));
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(400, 'id inválido');
  if (id === me.id) throw new HttpError(409, 'No puede modificar su propio rol o estado');
  if (data.role === undefined && data.active === undefined) throw new HttpError(400, 'Nada que actualizar');

  const { rows } = await getPool().query(
    'update app_user set role = coalesce($2, role), active = coalesce($3, active) where id = $1 returning id, email, role, active',
    [id, data.role ?? null, data.active ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado');
  await revokeAllForUser(id);
  return NextResponse.json({ data: rows[0] });
});
