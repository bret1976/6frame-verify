import { OrderRequestSchema, isSkuOffered } from "@6frame/contracts";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { getStripe } from "@/lib/stripe";
import { isStripeReady } from "@/lib/env";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { withTransaction } from "@/lib/db";
import { reserveCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer fv_live_ API key required", { status: 401 });
  if (!requireScope(auth, "billing:write") && !requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing billing scope", { status: 403 });
  }
  const idem = req.headers.get("idempotency-key");
  if (!idem) return jsonError("idempotency_required", "Idempotency-Key header required", { status: 400 });
  const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/orders");
  if (cached) return jsonOk(cached.response_body, { status: cached.response_status });

  const body = await req.json().catch(() => null);
  const parsed = OrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_input", "Order request failed validation", {
      status: 422,
      details: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  const { rows: quotes } = await query(
    `SELECT * FROM quotes WHERE id=$1 AND tenant_id=$2`,
    [data.quote_id, auth.tenantId],
  );
  const quote = quotes[0];
  if (!quote) return jsonError("quote_not_found", "Quote not found", { status: 404 });
  if (quote.status !== "open") return jsonError("quote_not_open", "Quote is not open", { status: 409 });
  if (quote.sku === "credit_pack") {
    return jsonError("use_credit_checkout", "Buy credit packs via POST /v1/credits/checkout", { status: 422 });
  }
  if (!isSkuOffered(quote.sku)) {
    return jsonError("sku_unavailable", `SKU ${quote.sku} is not currently offered`, { status: 422 });
  }
  if (new Date(quote.expires_at) < new Date()) {
    await query(`UPDATE quotes SET status='expired' WHERE id=$1`, [quote.id]);
    return jsonError("quote_expired", "Quote expired", { status: 409 });
  }

  if (data.payment_mode === "credit") {
    // Atomic credit drawdown: per-tenant advisory lock + ledger insert in one transaction
    const result = await withTransaction(async (client) => {
      const q = await client.query(`SELECT status FROM quotes WHERE id=$1 FOR UPDATE`, [quote.id]);
      if (q.rows[0]?.status !== "open") return { kind: "quote_not_open" as const };
      const { rows: orders } = await client.query(
        `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, paid_at, idempotency_key)
         VALUES ($1,$2,$3,$4,'usd','credit_reserved',now(),$5) RETURNING *`,
        [auth.tenantId, quote.id, quote.sku, quote.quote_amount, idem],
      );
      const order = orders[0];
      const reserved = await reserveCredits(client, auth.tenantId, order.id, quote.quote_amount);
      if (!reserved) throw Object.assign(new Error("insufficient_credit"), { code: "insufficient_credit" });
      await client.query(`UPDATE quotes SET status='accepted' WHERE id=$1`, [quote.id]);
      return { kind: "ok" as const, order, balance_after: reserved.balance_after };
    }).catch(async (e: Error & { code?: string }) => {
      if (e.code === "insufficient_credit") {
        const { rows: bal } = await query(
          `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_ledgers WHERE tenant_id=$1`,
          [auth.tenantId],
        );
        return { kind: "insufficient" as const, balance: bal[0]?.balance ?? 0 };
      }
      throw e;
    });
    if (result.kind === "quote_not_open") {
      return jsonError("quote_not_open", "Quote is not open", { status: 409 });
    }
    if (result.kind === "insufficient") {
      return jsonError("insufficient_credit", "Not enough prepaid credit. Buy a pack via POST /v1/credits/checkout", {
        status: 402,
        details: { balance_cents: result.balance, required_cents: quote.quote_amount },
      });
    }
    const order = result.order;
    const response = {
      id: order.id,
      status: order.status,
      amount_cents: order.amount,
      currency: order.currency,
      payment_mode: "credit",
      paid_at: order.paid_at,
      credit_balance_after_cents: result.balance_after,
    };
    await saveIdempotentResponse(auth, idem, "POST", "/v1/orders", data, 200, response);
    await audit({
      tenant_id: auth.tenantId,
      actor_type: "api_client",
      actor_id: auth.clientId,
      action: "order.credit_reserved",
      object_type: "order",
      object_id: order.id,
    });
    return jsonOk(response);
  }

  // Stripe Checkout / PaymentIntent — real Stripe only; refuse if not configured
  if (!isStripeReady()) {
    return jsonError(
      "stripe_not_configured",
      "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Unpaid jobs are refused — no mock unlock.",
      { status: 503, retryable: true },
    );
  }
  const stripe = getStripe()!;
  const base = env().APP_BASE_URL;

  const { rows: orders } = await query(
    `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, idempotency_key)
     VALUES ($1,$2,$3,$4,'usd','payment_pending',$5) RETURNING *`,
    [auth.tenantId, quote.id, quote.sku, quote.quote_amount, idem],
  );
  const order = orders[0];

  if (data.payment_mode === "payment_intent") {
    const pi = await stripe.paymentIntents.create(
      {
        amount: quote.quote_amount,
        currency: "usd",
        metadata: { order_id: order.id, tenant_id: auth.tenantId, sku: quote.sku },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `pi_${order.id}` },
    );
    await query(
      `UPDATE orders SET stripe_payment_intent_id=$1 WHERE id=$2`,
      [pi.id, order.id],
    );
    const response = {
      id: order.id,
      status: "payment_pending",
      amount_cents: order.amount,
      currency: order.currency,
      payment_mode: "payment_intent",
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
      note: "Job will not queue until Stripe webhook confirms payment_intent.succeeded",
    };
    await saveIdempotentResponse(auth, idem, "POST", "/v1/orders", data, 200, response);
    return jsonOk(response);
  }

  // default: checkout
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url:
        data.success_url ||
        `${base}/status?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: data.cancel_url || `${base}/pricing?cancelled=1`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.quote_amount,
            product_data: {
              name: `6Frame Verify — ${quote.sku}`,
              metadata: { order_id: order.id },
            },
          },
        },
      ],
      metadata: { order_id: order.id, tenant_id: auth.tenantId, sku: quote.sku },
      payment_intent_data: {
        metadata: { order_id: order.id, tenant_id: auth.tenantId },
      },
    },
    { idempotencyKey: `cs_${order.id}` },
  );
  await query(
    `UPDATE orders SET stripe_checkout_session_id=$1, stripe_payment_intent_id=$2 WHERE id=$3`,
    [session.id, typeof session.payment_intent === "string" ? session.payment_intent : null, order.id],
  );
  await query(`UPDATE quotes SET status='accepted' WHERE id=$1`, [quote.id]);
  const response = {
    id: order.id,
    status: "payment_pending",
    amount_cents: order.amount,
    currency: order.currency,
    payment_mode: "checkout",
    checkout_url: session.url,
    checkout_session_id: session.id,
    note: "Browser redirect is NOT payment proof. Wait for webhook-driven status=paid before submitting a job.",
  };
  await saveIdempotentResponse(auth, idem, "POST", "/v1/orders", data, 200, response);
  await audit({
    tenant_id: auth.tenantId,
    actor_type: "api_client",
    actor_id: auth.clientId,
    action: "order.payment_pending",
    object_type: "order",
    object_id: order.id,
  });
  return jsonOk(response);
}
