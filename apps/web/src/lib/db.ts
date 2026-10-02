import pg from "pg";
import { env } from "./env";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var __sixframePool: pg.Pool | undefined;
}

export function getPool(): pg.Pool {
  if (!global.__sixframePool) {
    global.__sixframePool = new Pool({
      connectionString: process.env.DATABASE_URL || env().DATABASE_URL,
      max: 10,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return global.__sixframePool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
