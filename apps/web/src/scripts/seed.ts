import pg from "pg";

const SKU_PRICES_CENTS = {
  website_quick: 300,
  website_full: 1200,
  creative_pack: 600,
  creative_sequence: 2500,
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(
    `INSERT INTO tenants (name, type, status)
     SELECT '6Frame Studio', 'admin', 'active'
     WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE type='admin')`,
  );
  await pool.query(
    `INSERT INTO tenants (name, type, status)
     SELECT 'Demo Buyer', 'buyer', 'active'
     WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE name='Demo Buyer')`,
  );

  const wa = await pool.query(
    `INSERT INTO profiles (slug, enabled)
     VALUES ('website-acceptance', true)
     ON CONFLICT (slug) DO UPDATE SET enabled=true
     RETURNING id`,
  );
  const waId = wa.rows[0].id as string;
  const waVersion = await pool.query(
    `INSERT INTO profile_versions (profile_id, version, schema_json, pricing_config, evaluator_config, published_at)
     VALUES ($1,'1.0.0',$2,$3,$4,now())
     ON CONFLICT (profile_id, version) DO UPDATE SET
       schema_json=EXCLUDED.schema_json,
       pricing_config=EXCLUDED.pricing_config,
       evaluator_config=EXCLUDED.evaluator_config,
       published_at=COALESCE(profile_versions.published_at, now())
     RETURNING id`,
    [
      waId,
      JSON.stringify({ input: "WebsiteAcceptanceInput" }),
      JSON.stringify({
        skus: {
          website_quick: { amount_cents: SKU_PRICES_CENTS.website_quick, max_urls: 1 },
          website_full: { amount_cents: SKU_PRICES_CENTS.website_full, max_urls: 10 },
        },
      }),
      JSON.stringify({ engine: "playwright-deterministic@1.0.0" }),
    ],
  );
  await pool.query(`UPDATE profiles SET current_published_version_id=$1 WHERE id=$2`, [
    waVersion.rows[0].id,
    waId,
  ]);

  const cc = await pool.query(
    `INSERT INTO profiles (slug, enabled)
     VALUES ('creative-continuity', true)
     ON CONFLICT (slug) DO UPDATE SET enabled=true
     RETURNING id`,
  );
  const ccId = cc.rows[0].id as string;
  const ccVersion = await pool.query(
    `INSERT INTO profile_versions (profile_id, version, schema_json, pricing_config, evaluator_config, published_at)
     VALUES ($1,'1.0.0',$2,$3,$4,now())
     ON CONFLICT (profile_id, version) DO UPDATE SET
       schema_json=EXCLUDED.schema_json,
       pricing_config=EXCLUDED.pricing_config,
       evaluator_config=EXCLUDED.evaluator_config,
       published_at=COALESCE(profile_versions.published_at, now())
     RETURNING id`,
    [
      ccId,
      JSON.stringify({ input: "CreativeContinuityInput", phase: 3, status: "stub" }),
      JSON.stringify({
        skus: {
          creative_pack: { amount_cents: SKU_PRICES_CENTS.creative_pack, max_shots: 12 },
          creative_sequence: { amount_cents: SKU_PRICES_CENTS.creative_sequence, max_shots: 30 },
        },
      }),
      JSON.stringify({ engine: "creative-stub@1.0.0", evaluable: false }),
    ],
  );
  await pool.query(`UPDATE profiles SET current_published_version_id=$1 WHERE id=$2`, [
    ccVersion.rows[0].id,
    ccId,
  ]);

  console.log("seed complete", { website: waId, creative: ccId });
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
