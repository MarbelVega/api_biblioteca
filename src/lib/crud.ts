import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { z, ZodObject, ZodRawShape } from 'zod';
import { AuthUser, Role, authenticate, requireRole } from './auth';
import { getPool, withTx } from './db';
import { HttpError } from './http';

type Row = Record<string, any>;

export interface Resource {
  table: string;
  pk: string;
  schema: ZodObject<ZodRawShape>;
  /** Campos del body que no son columnas (p. ej. relaciones N:M) */
  virtual?: string[];
  sortable: string[];
  searchable?: string[];
  filterable?: string[];
  /** SELECT base; la tabla siempre tiene alias `t` */
  selectSql?: string;
  access: { read: Role[]; write: Role[]; remove: Role[] };
  /** Condición SQL extra por usuario (row-level security a nivel de API) */
  scope?: (user: AuthUser, param: (v: unknown) => string) => string | null;
  beforeCreate?: (c: PoolClient, d: Row) => Promise<void>;
  beforeUpdate?: (c: PoolClient, prev: Row, d: Row) => Promise<void>;
  afterWrite?: (c: PoolClient, id: number, d: Row, prev: Row | null) => Promise<void>;
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
const idSchema = z.coerce.number().int().positive();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('asc'),
  sort: z.string().optional(),
  q: z.string().max(100).optional(),
});

const baseSelect = (r: Resource) => r.selectSql ?? `select t.* from ${q(r.table)} t`;

async function readOne(c: { query: PoolClient['query'] }, r: Resource, id: number): Promise<Row | undefined> {
  const { rows } = await (c as PoolClient).query(`${baseSelect(r)} where t.${q(r.pk)} = $1`, [id]);
  return rows[0];
}

export async function list(req: NextRequest, r: Resource) {
  const user = await authenticate(req);
  requireRole(user, r.access.read);
  const sp = req.nextUrl.searchParams;
  const p = listSchema.parse(Object.fromEntries(sp));
  const sort = p.sort && r.sortable.includes(p.sort) ? p.sort : r.pk;
  if (p.sort && !r.sortable.includes(p.sort)) {
    throw new HttpError(400, `Campo de orden no permitido. Use: ${r.sortable.join(', ')}`);
  }

  const params: unknown[] = [];
  const param = (v: unknown) => (params.push(v), `$${params.length}`);
  const where: string[] = [];

  for (const f of r.filterable ?? []) {
    if (sp.has(f)) where.push(`t.${q(f)} = ${param(sp.get(f))}`);
  }
  if (p.q && r.searchable?.length) {
    const like = param(`%${p.q.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`(${r.searchable.map((c) => `t.${q(c)}::text ilike ${like}`).join(' or ')})`);
  }
  const scope = r.scope?.(user, param);
  if (scope) where.push(scope);
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const pool = getPool();
  const total = (await pool.query(`select count(*)::int as n from ${q(r.table)} t ${whereSql}`, params)).rows[0].n as number;
  const limit = param(p.limit);
  const offset = param((p.page - 1) * p.limit);
  const { rows } = await pool.query(
    `${baseSelect(r)} ${whereSql} order by t.${q(sort)} ${p.order}, t.${q(r.pk)} asc limit ${limit} offset ${offset}`,
    params,
  );
  return NextResponse.json({
    data: rows,
    meta: { page: p.page, limit: p.limit, total, pages: Math.ceil(total / p.limit) },
  });
}

export async function getOne(req: NextRequest, r: Resource, rawId: string) {
  const user = await authenticate(req);
  requireRole(user, r.access.read);
  const id = idSchema.parse(rawId);
  const params: unknown[] = [id];
  const scope = r.scope?.(user, (v) => (params.push(v), `$${params.length}`));
  const { rows } = await getPool().query(
    `${baseSelect(r)} where t.${q(r.pk)} = $1 ${scope ? `and ${scope}` : ''}`,
    params,
  );
  if (!rows[0]) throw new HttpError(404, 'No encontrado');
  return NextResponse.json({ data: rows[0] });
}

async function readJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'El cuerpo debe ser JSON válido');
  }
}

const split = (r: Resource, d: Row) => {
  const virt = new Set(r.virtual ?? []);
  return Object.entries(d).filter(([k, v]) => !virt.has(k) && v !== undefined);
};

export async function create(req: NextRequest, r: Resource) {
  const user = await authenticate(req);
  requireRole(user, r.access.write);
  const data = r.schema.strict().parse(await readJson(req)) as Row;

  const row = await withTx(async (c) => {
    await r.beforeCreate?.(c, data);
    const cols = split(r, data);
    const sql = cols.length
      ? `insert into ${q(r.table)} (${cols.map(([k]) => q(k)).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning ${q(r.pk)}`
      : `insert into ${q(r.table)} default values returning ${q(r.pk)}`;
    const id = (await c.query(sql, cols.map(([, v]) => v))).rows[0][r.pk] as number;
    await r.afterWrite?.(c, id, data, null);
    return readOne(c, r, id);
  });
  return NextResponse.json({ data: row }, { status: 201, headers: { Location: `${req.nextUrl.pathname}/${row![r.pk]}` } });
}

export async function update(req: NextRequest, r: Resource, rawId: string) {
  const user = await authenticate(req);
  requireRole(user, r.access.write);
  const id = idSchema.parse(rawId);
  const data = r.schema.partial().strict().parse(await readJson(req)) as Row;
  if (!Object.keys(data).length) throw new HttpError(400, 'Debe enviar al menos un campo');

  const row = await withTx(async (c) => {
    const lock = await c.query(`select * from ${q(r.table)} where ${q(r.pk)} = $1 for update`, [id]);
    const prev = lock.rows[0] as Row | undefined;
    if (!prev) throw new HttpError(404, 'No encontrado');
    await r.beforeUpdate?.(c, prev, data);
    const cols = split(r, data);
    if (cols.length) {
      await c.query(
        `update ${q(r.table)} set ${cols.map(([k], i) => `${q(k)} = $${i + 1}`).join(', ')} where ${q(r.pk)} = $${cols.length + 1}`,
        [...cols.map(([, v]) => v), id],
      );
    }
    await r.afterWrite?.(c, id, data, prev);
    return readOne(c, r, id);
  });
  return NextResponse.json({ data: row });
}

export async function remove(req: NextRequest, r: Resource, rawId: string) {
  const user = await authenticate(req);
  requireRole(user, r.access.remove);
  const id = idSchema.parse(rawId);
  const { rowCount } = await getPool().query(`delete from ${q(r.table)} where ${q(r.pk)} = $1`, [id]);
  if (!rowCount) throw new HttpError(404, 'No encontrado');
  return new NextResponse(null, { status: 204 });
}
