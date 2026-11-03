import { Pool, PoolClient, types } from 'pg';
import { env } from './env';

// DATE (oid 1082) como string 'YYYY-MM-DD' (evita desfases por zona horaria)
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!g.__pgPool) {
    g.__pgPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    g.__pgPool.on('error', (err) => console.error('[pg] error en cliente inactivo', err));
  }
  return g.__pgPool;
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
