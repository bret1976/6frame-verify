import { CREDIT_PACKS, SKU_PRICES_CENTS, type SoldCreditPack } from "@6frame/contracts";
import type { AuthContext } from "./auth";
import { query } from "./db";
import { getStripe } from "./stripe";
import { isStripeReady } from "./env";
import { lineItemFor } from "./prices";
import { publicToken } from "./fulfil";
import { orderPageUrl, baseUrl } from "./links";

/** Checkout for a credit pack (used by MCP verify_buy_credits). Credits land only via the signed webhook. */
export async function createCreditCheckout(auth: AuthContext, pack: SoldCreditPack) {
  if (!isStripeReady()) throw Object.assign(new Error("Payments unavailable"), { code: "stripe_not_configured" });
  const stripe = getStripe()!;
  const amount = SKU_PRICES_CENTS[pack];
  const token = publicToken();
  const { rows } = await query(
    `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, public_token, payment_source)
     VALUES ($1,NULL,$2,$3,'usd','payment_pending',$4,'stripe') RETURNING id`,
    [auth.tenantId, pack, amount, token],
  );
  const orderId = rows[0].id as string;
  const metadata = { order_id: orderId, tenant_id: auth.tenantId, sku: pack, app: "6frame-verify" };
  const { lineItem } = await lineItemFor(stripe, pack);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [lineItem],
      success_url: `${orderPageUrl(token)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/pricing?cancelled=1`,
      metadata,
      payment_intent_data: { metadata },
    },
    { idempotencyKey: `cs_credit_${orderId}` },
  );
  await query(`UPDATE orders SET stripe_checkout_session_id=$1 WHERE id=$2`, [session.id, orderId]);
  return {
    order_id: orderId,
    pack,
    amount_cents: amount,
    credits_on_payment_cents: CREDIT_PACKS[pack].usable_cents,
    checkout_url: session.url,
    order_page: orderPageUrl(token),
  };
}
