import { CREDIT_PACK_USABLE_CENTS, SKU_PRICES_CENTS } from "@6frame/contracts";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError } from "@/lib/http";
import { balanceOf, recentLedger } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** GET /v1/credits — prepaid credit balance + recent ledger entries for the caller's tenant. */
export async function GET(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer fv_live_ API key required", { status: 401 });
  if (!requireScope(auth, "verify:read") && !requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing verify:read scope", { status: 403 });
  }
  const balance = await balanceOf(null, auth.tenantId);
  return jsonOk({
    balance_cents: balance,
    currency: "usd",
    credit_pack: {
      sku: "credit_pack",
      price_cents: SKU_PRICES_CENTS.credit_pack,
      usable_cents: CREDIT_PACK_USABLE_CENTS,
      purchase: "POST /v1/credits/checkout",
    },
    spend: "POST /v1/orders with payment_mode=credit (website_quick / website_full quotes)",
    ledger: await recentLedger(auth.tenantId),
  });
}
