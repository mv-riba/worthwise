import { Pool, types, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

// Return NUMERIC as JS numbers and DATE as plain 'YYYY-MM-DD' strings.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(1082, (v) => v);

const globalForPg = globalThis as unknown as { __worthwisePool?: Pool };

function createPool(): Pool {
  // DATABASE_URL is Neon's pooled (-pooler) connection string, written by `neon deploy`.
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  // On Vercel Fluid compute, lets idle connections close cleanly before an instance is suspended.
  attachDatabasePool(p);
  return p;
}

export const pool: Pool = globalForPg.__worthwisePool ?? createPool();
globalForPg.__worthwisePool = pool;

export type Db = PoolClient;

/**
 * Runs fn inside one transaction as the restricted `worthwise_app` role,
 * with the signed-in user's id set, so row-level security applies to every query.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!userId) throw new Error('withUser: missing user id');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role worthwise_app');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
