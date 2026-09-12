import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * The single Postgres pool for the whole system.
 *
 * Nothing outside `modules/data` should import `pg` directly — that keeps the
 * driver swappable and means every SQL statement in the codebase is reachable
 * from one directory.
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

/** Run several statements atomically. */
export async function transaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
