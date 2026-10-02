import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  const { id } = await ctx.params;
  const { rows } = await query(`SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`, [
    id,
    auth.tenantId,
  ]);
  if (!rows[0]) return jsonError("not_found", "Order not found", { status: 404 });
  const o = rows[0];
  return jsonOk({
    id: o.id,
    status: o.status,
    amount_cents: o.amount,
    currency: o.currency,
    sku: o.sku,
    paid_at: o.paid_at,
    refunded_at: o.refunded_at,
    stripe_payment_intent_id: o.stripe_payment_intent_id,
    stripe_checkout_session_id: o.stripe_checkout_session_id,
    created_at: o.created_at,
  });
}
