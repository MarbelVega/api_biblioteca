import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool, withTx } from './db';
import { env } from './env';
import { HttpError } from './http';
import { signAccessToken } from './jwt';
import type { Role } from './auth';
import type { GoogleProfile } from './google';

export interface DbUser {
  id: string; google_sub: string; email: string; name: string | null;
  picture: string | null; role: Role; active: boolean;
}
type Meta = { ip: string | null; userAgent: string | null };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function upsertGoogleUser(p: GoogleProfile): Promise<DbUser> {
  const isAdmin = env().adminEmails.includes(p.email);
  const { rows } = await getPool().query<DbUser>(
    `insert into app_user (google_sub, email, name, picture, role, last_login_at)
     values ($1,$2,$3,$4, case when $5 then 'admin' else 'lector' end, now())
     on conflict (google_sub) do update
       set email = excluded.email, name = excluded.name, picture = excluded.picture,
           last_login_at = now(),
           role = case when $5 then 'admin' else app_user.role end
     returning *`,
    [p.sub, p.email, p.name ?? null, p.picture ?? null, isAdmin],
  );
  return rows[0];
}

async function insertRefresh(q: { query: Function }, userId: string, familyId: string, meta: Meta) {
  const raw = randomBytes(48).toString('base64url');
  const id = randomUUID();
  await q.query(
    `insert into refresh_token (id, user_id, family_id, token_hash, expires_at, ip, user_agent)
     values ($1,$2,$3,$4, now() + ($5 || ' seconds')::interval, $6, $7)`,
    [id, userId, familyId, sha256(raw), String(env().REFRESH_TOKEN_TTL), meta.ip, meta.userAgent],
  );
  return { raw, id };
}

export async function createSession(user: DbUser, meta: Meta) {
  const access = await signAccessToken(user);
  const { raw } = await insertRefresh(getPool(), user.id, randomUUID(), meta);
  return { access, refresh: raw };
}

/** Rota el refresh token. Si se reutiliza uno ya revocado, se revoca toda la familia. */
export async function rotateRefresh(raw: string, meta: Meta) {
  const outcome = await withTx(async (c) => {
    const { rows } = await c.query(
      `select rt.*, u.email, u.role, u.active
         from refresh_token rt join app_user u on u.id = rt.user_id
        where rt.token_hash = $1 for update of rt`,
      [sha256(raw)],
    );
    const t = rows[0];
    if (!t) return { status: 'invalid' as const };
    if (t.revoked_at) {
      await c.query('update refresh_token set revoked_at = now() where family_id = $1 and revoked_at is null', [t.family_id]);
      return { status: 'reuse' as const };
    }
    if (new Date(t.expires_at) < new Date() || !t.active) return { status: 'invalid' as const };
    const next = await insertRefresh(c, t.user_id, t.family_id, meta);
    await c.query('update refresh_token set revoked_at = now(), replaced_by = $2 where id = $1', [t.id, next.id]);
    return { status: 'ok' as const, user: { id: t.user_id, email: t.email, role: t.role as Role }, refresh: next.raw };
  });
  if (outcome.status !== 'ok') throw new HttpError(401, 'Refresh token inválido, expirado o reutilizado');
  return { access: await signAccessToken(outcome.user), refresh: outcome.refresh };
}

export async function revokeFamilyByToken(raw: string) {
  await getPool().query(
    `update refresh_token set revoked_at = now()
      where revoked_at is null and family_id = (select family_id from refresh_token where token_hash = $1)`,
    [sha256(raw)],
  );
}

export async function revokeAllForUser(userId: string) {
  await getPool().query('update refresh_token set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
}
