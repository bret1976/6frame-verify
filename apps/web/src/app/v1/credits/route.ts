import { CREDIT_PACKS, SOLD_CREDIT_PACKS, SKU_LABELS, FREE_QUICK_CHECKS_PER_DAY } from "@6frame/contracts";
import { query } from "@/lib/db";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError, unauthorized } from "@/lib/http";
import { balanceOf, recentLedger } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** GET /v1/credits — prepaid credit balance + recent ledger entries for the caller's tenant. */
export async function GET(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return unauthorized("Bearer fv_live_ API key required");
  if (!requireScope(auth, "verify:read") && !requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing verify:read scope", { status: 403 });
  }
  const balance = await balanceOf(null, auth.tenantId);
  const { rows: fr } = await query(
    `SELECT COUNT(*)::int AS c FROM free_checks WHERE tenant_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date`,
    [auth.tenantId],
  );
  const freeUsed = fr[0]?.c ?? 0;
  return jsonOk({
    balance_cents: balance,
    currency: "usd",
    credit_packs: SOLD_CREDIT_PACKS.map((sku) => ({
      sku,
      label: SKU_LABELS[sku],
      price_cents: CREDIT_PACKS[sku].price_cents,
      usable_cents: CREDIT_PACKS[sku].usable_cents,
      purchase: `POST /v1/credits/checkout {"pack":"${sku}"}`,
    })),
    free_tier: {
      quick_checks_per_day: FREE_QUICK_CHECKS_PER_DAY,
      used_today: freeUsed,
    },
    spend: "POST /v1/checks {url} (auto: free → credit → checkout) or POST /v1/orders payment_mode=credit",
    ledger: await recentLedger(auth.tenantId),
  });
}
