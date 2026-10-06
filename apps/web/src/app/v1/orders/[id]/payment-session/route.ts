import { isSkuOffered } from "@6frame/contracts";
import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { isStripeReady, env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  if (!isStripeReady()) {
    return jsonError("stripe_not_configured", "Stripe not configured", { status: 503 });
  }
  const { id } = await ctx.params;
  const { rows } = await query(`SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`, [
    id,
    auth.tenantId,
  ]);
  const order = rows[0];
  if (!order) return jsonError("not_found", "Order not found", { status: 404 });
  if (order.status === "paid" || order.status === "credit_reserved") {
    return jsonOk({ id: order.id, status: order.status, already_paid: true });
  }
  if (order.sku === "credit_pack") {
    return jsonError("use_credit_checkout", "Start a new credit purchase via POST /v1/credits/checkout", {
      status: 422,
    });
  }
  if (!isSkuOffered(order.sku)) {
    return jsonError("sku_unavailable", `SKU ${order.sku} is not currently offered`, { status: 422 });
  }
  const stripe = getStripe()!;
  const base = env().APP_BASE_URL;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${base}/status?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pricing?cancelled=1`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: order.amount,
            product_data: { name: `6Frame Verify — ${order.sku}` },
          },
        },
      ],
      metadata: { order_id: order.id, tenant_id: auth.tenantId },
    },
    { idempotencyKey: `cs_retry_${order.id}` },
  );
  await query(`UPDATE orders SET stripe_checkout_session_id=$1, status='payment_pending' WHERE id=$2`, [
    session.id,
    order.id,
  ]);
  return jsonOk({
    id: order.id,
    status: "payment_pending",
    checkout_url: session.url,
    checkout_session_id: session.id,
  });
}
