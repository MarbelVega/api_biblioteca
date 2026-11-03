import { handle } from '@/lib/http';
import { getOne, remove, update } from '@/lib/crud';
import { getResource } from '@/lib/resources';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const GET = handle<Ctx>(async (req, { params }) => {
  const p = await params;
  return getOne(req, getResource(p.resource), p.id);
});
const upd = handle<Ctx>(async (req, { params }) => {
  const p = await params;
  return update(req, getResource(p.resource), p.id);
});
export const PUT = upd;
export const PATCH = upd;
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const p = await params;
  return remove(req, getResource(p.resource), p.id);
});
