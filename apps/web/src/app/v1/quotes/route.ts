import {
  QuoteRequestSchema,
  SKU_PRICES_CENTS,
  WebsiteAcceptanceInputSchema,
  CreativeContinuityInputSchema,
} from "@6frame/contracts";
import { assertSafePublicHttpsUrl } from "@6frame/evaluators";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { query } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { jsonOk, jsonError } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer fv_live_ API key required", { status: 401 });
  if (!requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing verify:write scope", { status: 403 });
  }
  const idem = req.headers.get("idempotency-key");
  if (!idem) {
    return jsonError("idempotency_required", "Idempotency-Key header required", { status: 400 });
  }
  const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/quotes");
  if (cached) return jsonOk(cached.response_body, { status: cached.response_status });

  const body = await req.json().catch(() => null);
  const parsed = QuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_input", "Quote request failed validation", {
      status: 422,
      details: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  let sku = data.sku;
  if (data.profile.slug === "website-acceptance") {
    const input = WebsiteAcceptanceInputSchema.parse(data.input);
    sku = sku ?? input.sku ?? "website_quick";
    const safe = await assertSafePublicHttpsUrl(input.target_url);
    if (!safe.ok) {
      return jsonError("unsafe_url", safe.message, { status: 422, details: { code: safe.code } });
    }
  } else {
    const input = CreativeContinuityInputSchema.parse(data.input);
    sku = sku ?? input.sku ?? "creative_pack";
  }

  const amount = SKU_PRICES_CENTS[sku as keyof typeof SKU_PRICES_CENTS];
  if (!amount) return jsonError("invalid_sku", `Unknown SKU ${sku}`, { status: 422 });

  const { rows: pv } = await query(
    `SELECT pv.id, pv.version FROM profiles p
     JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.slug=$1 AND p.enabled=true`,
    [data.profile.slug],
  );
  if (!pv[0]) return jsonError("profile_unavailable", "Profile not published", { status: 404 });

  const inputHash = sha256(JSON.stringify(data.input));
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO quotes (tenant_id, profile_version_id, sku, normalized_input_hash, quote_amount, currency, input_json, expires_at, status)
     VALUES ($1,$2,$3,$4,$5,'usd',$6,$7,'open') RETURNING id, quote_amount, currency, expires_at, sku`,
    [auth.tenantId, pv[0].id, sku, inputHash, amount, JSON.stringify(data.input), expires.toISOString()],
  );
  const quote = rows[0];
  const response = {
    id: quote.id,
    sku: quote.sku,
    amount_cents: quote.quote_amount,
    currency: quote.currency,
    expires_at: quote.expires_at,
    profile: { slug: data.profile.slug, version: pv[0].version },
    input_hash: inputHash,
    status: "open",
  };
  await saveIdempotentResponse(auth, idem, "POST", "/v1/quotes", data, 200, response);
  await audit({
    tenant_id: auth.tenantId,
    actor_type: "api_client",
    actor_id: auth.clientId,
    action: "quote.created",
    object_type: "quote",
    object_id: quote.id,
  });
  return jsonOk(response);
}
