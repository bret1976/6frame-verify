import { z } from "zod";
import { CREDIT_PACK_USABLE_CENTS, SKU_LABELS, SKU_PRICES_CENTS } from "@6frame/contracts";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { getStripe } from "@/lib/stripe";
import { env, isStripeReady } from "@/lib/env";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
  })
  .default({});

/**
 * POST /v1/credits/checkout — buy a prepaid credit pack ($100 → $110 usable).
 * Creates a live Stripe Checkout Session for STRIPE_PRICE_CREDIT_PACK. Credits are added
 * ONLY when the signed checkout.session.completed webhook confirms payment.
 */
export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer fv_live_ API key required", { status: 401 });
  if (!requireScope(auth, "billing:write") && !requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing billing scope", { status: 403 });
  }
  const idem = req.headers.get("idempotency-key");
  if (!idem) return jsonError("idempotency_required", "Idempotency-Key header required", { status: 400 });
  const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/credits/checkout");
  if (cached) return jsonOk(cached.response_body, { status: cached.response_status });

  const raw = await req.text();
  let body: unknown = undefined;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("invalid_json", "Body must be JSON (or empty)", { status: 400 });
    }
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_input", "Credit checkout request failed validation", {
      status: 422,
      details: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  if (!isStripeReady()) {
    return jsonError("stripe_not_configured", "Stripe is not configured. No credits without payment.", {
      status: 503,
      retryable: true,
    });
  }
  const stripe = getStripe()!;
  const e = env();
  const base = e.APP_BASE_URL;
  const amount = SKU_PRICES_CENTS.credit_pack;

  const { rows: orders } = await query(
    `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, idempotency_key)
     VALUES ($1,NULL,'credit_pack',$2,'usd','payment_pending',$3) RETURNING *`,
    [auth.tenantId, amount, `credit_checkout:${idem}`],
  );
  const order = orders[0];
  const metadata = { order_id: order.id, tenant_id: auth.tenantId, sku: "credit_pack" };

  const lineItem = e.STRIPE_PRICE_CREDIT_PACK
    ? { price: e.STRIPE_PRICE_CREDIT_PACK, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: `6Frame Verify — ${SKU_LABELS.credit_pack}` },
        },
      };

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: data.success_url || `${base}/status?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: data.cancel_url || `${base}/pricing?cancelled=1`,
        line_items: [lineItem],
        metadata,
        payment_intent_data: { metadata },
      },
      { idempotencyKey: `cs_credit_${order.id}` },
    );
  } catch (err) {
    await query(`UPDATE orders SET status='failed' WHERE id=$1`, [order.id]);
    const se = err as { type?: string; code?: string; message?: string; statusCode?: number };
    return jsonError("stripe_error", se.message || "Stripe checkout creation failed", {
      status: 502,
      retryable: true,
      details: { type: se.type, code: se.code, stripe_status: se.statusCode },
    });
  }

  if (session.amount_total != null && session.amount_total !== amount) {
    await query(`UPDATE orders SET status='failed' WHERE id=$1`, [order.id]);
    return jsonError(
      "price_mismatch",
      `Stripe credit pack price is ${session.amount_total} cents, expected ${amount}`,
      { status: 500 },
    );
  }

  await query(`UPDATE orders SET stripe_checkout_session_id=$1 WHERE id=$2`, [session.id, order.id]);
  const response = {
    id: order.id,
    sku: "credit_pack",
    status: "payment_pending",
    amount_cents: amount,
    stripe_amount_total: session.amount_total,
    currency: "usd",
    credits_on_payment_cents: CREDIT_PACK_USABLE_CENTS,
    checkout_url: session.url,
    checkout_session_id: session.id,
    note: "Credits are added only after Stripe's signed checkout.session.completed webhook. Check GET /v1/credits.",
  };
  await saveIdempotentResponse(auth, idem, "POST", "/v1/credits/checkout", data, 200, response);
  await audit({
    tenant_id: auth.tenantId,
    actor_type: "api_client",
    actor_id: auth.clientId,
    action: "credit_pack.payment_pending",
    object_type: "order",
    object_id: order.id,
  });
  return jsonOk(response);
}
