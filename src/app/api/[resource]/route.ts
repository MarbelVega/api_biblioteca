import { handle } from '@/lib/http';
import { create, list } from '@/lib/crud';
import { getResource } from '@/lib/resources';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resource: string }> };

export const GET = handle<Ctx>(async (req, { params }) => list(req, getResource((await params).resource)));
export const POST = handle<Ctx>(async (req, { params }) => create(req, getResource((await params).resource)));
