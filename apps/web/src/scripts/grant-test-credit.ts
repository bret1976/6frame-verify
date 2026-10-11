import pg from "pg";

/**
 * Internal, operator-only test credit grant (NOT revenue). Run inside the web container:
 *   pnpm --filter @6frame/web grant-test-credit "<tenant name>" <cents> "<note>"
 * Writes one append-only credit_ledgers row with reason 'internal_test_grant' plus an
 * audit event. Capped at $50 per grant. Never reachable over HTTP.
 */
async function main() {
  const tenantName = process.argv[2];
  const cents = Number(process.argv[3]);
  const note = process.argv[4] || "internal e2e test";
  if (!tenantName || !Number.isInteger(cents) || cents <= 0 || cents > 5000) {
    throw new Error("usage: grant-test-credit <tenant name> <cents 1..5000> [note]");
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query(`SELECT id FROM tenants WHERE name=$1 LIMIT 1`, [tenantName]);
    if (!t.rows[0]) throw new Error(`tenant not found: ${tenantName}`);
    const tenantId = t.rows[0].id as string;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('credits:' || $1::text))`, [tenantId]);
    const bal = await client.query(
      `SELECT COALESCE(SUM(delta),0)::int AS b FROM credit_ledgers WHERE tenant_id=$1`,
      [tenantId],
    );
    const after = Number(bal.rows[0].b) + cents;
    const idem = `internal_test_grant:${Date.now()}`;
    await client.query(
      `INSERT INTO credit_ledgers (tenant_id, order_id, delta, reason, balance_after, idempotency_key)
       VALUES ($1,NULL,$2,'internal_test_grant',$3,$4)`,
      [tenantId, cents, after, idem],
    );
    await client.query(
      `INSERT INTO audit_events (tenant_id, actor_type, actor_id, action, object_type, metadata)
       VALUES ($1,'operator','grant-test-credit','credit.internal_test_grant','tenant',$2)`,
      [tenantId, JSON.stringify({ cents, note, idem })],
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ tenant: tenantName, granted_cents: cents, balance_after: after, note }));
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
