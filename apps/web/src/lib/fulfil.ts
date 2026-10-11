import crypto from "node:crypto";
import type pg from "pg";
import type Stripe from "stripe";
import { WebsiteAcceptanceInputSchema, SKU_LABELS, type CheckSku, type WebsiteAcceptanceInput } from "@6frame/contracts";
import { compileWebsiteBrief } from "@6frame/evaluators";
import { query, withTransaction } from "./db";
import { sha256 } from "./crypto";
import { enqueueVerifyJob } from "./queue";
import { audit } from "./audit";
import { lineItemFor } from "./prices";
import { baseUrl, orderPageUrl } from "./links";

export function publicToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

/** Insert a queued job (+ compiled requirements) for an already-paid order, inside a txn. */
export async function insertJobForOrder(
  client: pg.PoolClient,
  args: {
    tenantId: string;
    orderId: string;
    input: WebsiteAcceptanceInput;
    idempotencyKey?: string | null;
    callback?: { url: string; secret?: string } | null;
  },
): Promise<{ id: string; public_token: string; deadline_at: string; input_hash: string }> {
  const { rows: pv } = await client.query(
    `SELECT pv.id FROM profiles p JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.slug='website-acceptance'`,
  );
  if (!pv[0]) throw new Error("website-acceptance profile not published");
  const inputHash = sha256(JSON.stringify(args.input));
  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const token = publicToken();
  const ins = await client.query(
    `INSERT INTO jobs (tenant_id, order_id, profile_version_id, input_manifest, input_hash, status,
       deadline_at, callback_url, callback_secret, idempotency_key, public_token)
     VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,$10) RETURNING id`,
    [
      args.tenantId,
      args.orderId,
      pv[0].id,
      JSON.stringify({ profile: { slug: "website-acceptance", version: "1.0.0" }, input: args.input }),
      inputHash,
      deadline,
      args.callback?.url ?? null,
      args.callback?.secret ?? null,
      args.idempotencyKey ?? null,
      token,
    ],
  );
  const jobId = ins.rows[0].id as string;
  for (const r of compileWebsiteBrief(args.input)) {
    await client.query(
      `INSERT INTO requirements (job_id, external_key, text, type, severity, normalized_rule)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [jobId, r.external_key, r.text, r.type, r.severity, JSON.stringify(r.normalized_rule)],
    );
  }
  await client.query(`UPDATE orders SET status='consumed' WHERE id=$1`, [args.orderId]);
  return { id: jobId, public_token: token, deadline_at: deadline, input_hash: inputHash };
}

/** Enqueue; on queue failure mark the job failed_platform and restore the order to paid. */
export async function enqueueOrFail(jobId: string, orderId: string): Promise<boolean> {
  try {
    await enqueueVerifyJob(jobId);
    return true;
  } catch (e) {
    await query(
      `UPDATE jobs SET status='failed_platform', error_code='queue_unavailable', error_message=$2 WHERE id=$1`,
      [jobId, e instanceof Error ? e.message : "queue error"],
    );
    await query(`UPDATE orders SET status='paid' WHERE id=$1 AND status='consumed'`, [orderId]);
    return false;
  }
}

/**
 * Mark a non-credit-pack order paid (idempotent). If it was created with auto_job (homepage
 * buy box / POST /v1/checks), create and enqueue its job from the stored quote input.
 * Called from the signed Stripe webhook and from the order page after a server-side
 * Stripe session retrieve — never from a browser redirect alone.
 */
export async function onOrderPaid(orderId: string, paymentIntentId: string | null, actor: string) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) return null;
    if (["draft", "payment_pending", "expired"].includes(order.status)) {
      await client.query(
        `UPDATE orders SET status='paid', paid_at=COALESCE(paid_at, now()),
           stripe_payment_intent_id=COALESCE(stripe_payment_intent_id, $2) WHERE id=$1`,
        [orderId, paymentIntentId],
      );
      order.status = "paid";
    }
    if (!order.auto_job || order.status !== "paid") return { order, job: null };
    const existing = await client.query(
      `SELECT id FROM jobs WHERE order_id=$1 AND status <> 'failed_platform' LIMIT 1`,
      [orderId],
    );
    if (existing.rows[0]) return { order, job: null };
    const { rows: q } = await client.query(`SELECT input_json FROM quotes WHERE id=$1`, [order.quote_id]);
    if (!q[0]) return { order, job: null };
    const input = WebsiteAcceptanceInputSchema.parse(q[0].input_json);
    const job = await insertJobForOrder(client, { tenantId: order.tenant_id, orderId, input });
    return { order, job };
  });
  if (result?.job) {
    await enqueueOrFail(result.job.id, orderId);
    await audit({
      tenant_id: result.order.tenant_id,
      actor_type: "system",
      actor_id: actor,
      action: "job.auto_queued",
      object_type: "job",
      object_id: result.job.id,
    });
  }
  return result;
}

/** Create a quote row (accepted) + payment_pending order + Stripe Checkout for one check. */
export async function createCheckoutForCheck(
  stripe: Stripe,
  args: {
    tenantId: string;
    sku: CheckSku;
    amountCents: number;
    input: WebsiteAcceptanceInput;
    customerEmail?: string | null;
    origin: "homepage" | "api_checks";
    cancelUrl?: string;
  },
) {
  const { rows: pv } = await query(
    `SELECT pv.id FROM profiles p JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.slug='website-acceptance'`,
  );
  const inputHash = sha256(JSON.stringify(args.input));
  const { rows: qr } = await query(
    `INSERT INTO quotes (tenant_id, profile_version_id, sku, normalized_input_hash, quote_amount, currency, input_json, expires_at, status)
     VALUES ($1,$2,$3,$4,$5,'usd',$6, now() + interval '1 day','accepted') RETURNING id`,
    [args.tenantId, pv[0].id, args.sku, inputHash, args.amountCents, JSON.stringify(args.input)],
  );
  const token = publicToken();
  const { rows: or } = await query(
    `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, public_token, auto_job, customer_email, payment_source)
     VALUES ($1,$2,$3,$4,'usd','payment_pending',$5,true,$6,'stripe') RETURNING *`,
    [args.tenantId, qr[0].id, args.sku, args.amountCents, token, args.customerEmail ?? null],
  );
  const order = or[0];
  const { lineItem, source } = await lineItemFor(stripe, args.sku);
  const metadata = { order_id: order.id, tenant_id: args.tenantId, sku: args.sku, origin: args.origin, app: "6frame-verify" };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [lineItem],
      success_url: `${orderPageUrl(token)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: args.cancelUrl || `${baseUrl()}/?cancelled=1`,
      customer_email: args.customerEmail || undefined,
      metadata,
      payment_intent_data: {
        metadata,
        description: `6Frame Verify — ${SKU_LABELS[args.sku]}: ${args.input.target_url}`.slice(0, 500),
      },
    },
    { idempotencyKey: `cs_${order.id}` },
  );
  await query(`UPDATE orders SET stripe_checkout_session_id=$1 WHERE id=$2`, [session.id, order.id]);
  return { order, session, price_source: source, order_url: orderPageUrl(token) };
}

/** Server-side Stripe check used by the order page so customers aren't stuck if a webhook lags. */
export async function reconcileOrderWithStripe(stripe: Stripe, order: { id: string; status: string; stripe_checkout_session_id: string | null; sku: string }) {
  if (order.status !== "payment_pending" || !order.stripe_checkout_session_id) return;
  if (order.sku.startsWith("credit_pack")) return; // credit grants only via webhook
  try {
    const s = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
    if (s.payment_status === "paid" && s.metadata?.order_id === order.id) {
      await onOrderPaid(order.id, typeof s.payment_intent === "string" ? s.payment_intent : null, "order_page_reconcile");
    } else if (s.status === "expired") {
      await query(`UPDATE orders SET status='expired' WHERE id=$1 AND status='payment_pending'`, [order.id]);
    }
  } catch (e) {
    console.warn("[order] reconcile failed", order.id, (e as Error).message);
  }
}
