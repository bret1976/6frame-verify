import { DISABLED_SKUS, isProfileOffered, offeredSkuCatalog } from "@6frame/contracts";
import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { stripeStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  // Capabilities are readable with or without auth (discovery), but paid endpoints require auth.
  const { rows: profiles } = await query<{
    slug: string;
    version: string;
    pricing_config: unknown;
    evaluator_config: unknown;
    schema_json: unknown;
    enabled: boolean;
  }>(
    `SELECT p.slug, p.enabled, pv.version, pv.pricing_config, pv.evaluator_config, pv.schema_json
     FROM profiles p
     JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.enabled = true`,
  );

  return jsonOk({
    product: "6Frame Verify",
    owner: "6Frame Studio",
    api_version: "v1",
    authenticated: Boolean(auth),
    transports: ["rest", "mcp", "a2a"],
    endpoints: {
      openapi: "/.well-known/openapi.json",
      agent_card: "/.well-known/agent-card.json",
      mcp: "/mcp",
      base: "/v1",
    },
    payments: {
      ...stripeStatus(),
      note: "Jobs queue only after verified Stripe webhook payment or atomic credit reservation. Unpaid jobs are refused.",
    },
    skus: offeredSkuCatalog(),
    profiles: profiles.filter((p) => isProfileOffered(p.slug)).map((p) => ({
      slug: p.slug,
      version: p.version,
      enabled: p.enabled,
      pricing: p.pricing_config,
      evaluator: p.evaluator_config,
      schema: p.schema_json,
    })),
    limits: {
      rate_limit_per_minute: auth?.rateLimit ?? 60,
      idempotency_required_on_writes: true,
    },
  });
}
