import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const { rows } = await query(
    `SELECT p.slug, p.enabled, pv.version, pv.schema_json, pv.pricing_config, pv.evaluator_config, pv.published_at
     FROM profiles p
     JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.slug = $1`,
    [slug],
  );
  if (!rows[0]) return jsonError("not_found", `Profile ${slug} not found`, { status: 404 });
  const p = rows[0];
  return jsonOk({
    slug: p.slug,
    version: p.version,
    enabled: p.enabled,
    published_at: p.published_at,
    schema: p.schema_json,
    pricing: p.pricing_config,
    evaluator: p.evaluator_config,
    sample_request:
      slug === "website-acceptance"
        ? {
            order_id: "ord_...",
            profile: { slug: "website-acceptance", version: "1.0.0" },
            input: {
              brief: "Dark luxury homepage. Hero must contain brand name.",
              target_url: "https://example.com",
              required_paths: ["/", "/about"],
              brand_rules: {
                required_terms: ["6Frame Studio"],
                forbidden_terms: ["revolutionary"],
                required_ctas: ["View the Work"],
              },
              test_mode: "read_only",
              sku: "website_quick",
            },
          }
        : {
            order_id: "ord_...",
            profile: { slug: "creative-continuity", version: "1.0.0" },
            input: {
              creative_bible: { characters: [] },
              shots: [{ id: "s1", prompt: "..." }],
              output_type: "prompt_package",
              sku: "creative_pack",
            },
          },
  });
}
