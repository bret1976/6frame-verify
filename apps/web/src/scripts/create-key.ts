import pg from "pg";
import { generateApiKey, hashApiKey } from "../lib/crypto";

async function main() {
  const tenantName = process.argv[2] || "Demo Buyer";
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const t = await pool.query(`SELECT id FROM tenants WHERE name=$1 LIMIT 1`, [tenantName]);
  if (!t.rows[0]) throw new Error(`Tenant not found: ${tenantName}`);
  const key = generateApiKey();
  const hash = await hashApiKey(key.raw);
  await pool.query(
    `INSERT INTO api_clients (tenant_id, name, key_prefix, key_hash, scopes)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      t.rows[0].id,
      `${tenantName} key`,
      key.prefix,
      hash,
      ["verify:read", "verify:write", "billing:write"],
    ],
  );
  console.log(JSON.stringify({ tenant: tenantName, api_key: key.raw, prefix: key.prefix }, null, 2));
  console.log("Store this key now — it will not be shown again.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
