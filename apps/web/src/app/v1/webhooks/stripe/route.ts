import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { env, isStripeReady } from "@/lib/env";
import { audit } from "@/lib/audit";
import { grantCreditPack, clawbackCreditPack } from "@/lib/credits";
import {
  claimWebhookEvent,
  inboxEnabled,
  markFailed,
  markProcessed,
  type ClaimResult,
} from "@/lib/webhook-inbox";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeReady()) {
    return jsonError("stripe_not_configured", "Stripe webhook secret not configured", {
      status: 503,
    });
  }
  const stripe = getStripe()!;
  const sig = req.headers.get("stripe-signature");
  if (!sig) return jsonError("missing_signature", "stripe-signature required", { status: 400 });

  const rawBody = Buffer.from(await req.arrayBuffer());
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env().STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return jsonError("invalid_signature", e instanceof Error ? e.message : "bad signature", {
      status: 400,
    });
  }

  const payloadHash = `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
  let claim: ClaimResult | null = null;
  if (inboxEnabled()) {
    // webhook-inbox-v1: retry failed/stuck events; never ack a DB error as a replay.
    claim = await claimWebhookEvent(query, {
      provider: "stripe",
      eventId: event.id,
      payloadHash,
    });
    if (claim.kind === "duplicate") return jsonOk({ received: true, duplicate: true });
    if (claim.kind === "parked") return jsonOk({ received: true, duplicate: true });
    if (claim.kind === "in_flight") {
      return jsonError("event_in_progress", "Event is being processed; retry later", {
        status: 409,
        retryable: true,
      });
    }
    if (claim.kind === "db_unavailable") {
      return jsonError("storage_unavailable", "Webhook could not be recorded; retry later", {
        status: 503,
        retryable: true,
      });
    }
  } else {
    try {
      await query(
        `INSERT INTO webhook_events (provider, provider_event_id, payload_hash, processing_status)
         VALUES ('stripe',$1,$2,'received')`,
        [event.id, payloadHash],
      );
    } catch {
      // unique violation = replay
      return jsonOk({ received: true, duplicate: true });
    }
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId && session.payment_status === "paid" && session.metadata?.sku === "credit_pack") {
        const result = await grantCreditPack({
          orderId,
          amountPaidCents: session.amount_total,
          currency: session.currency,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          checkoutSessionId: session.id,
        });
        await audit({
          tenant_id: session.metadata?.tenant_id,
          actor_type: "stripe",
          actor_id: event.id,
          action: `credit_pack.${result.status}`,
          object_type: "order",
          object_id: orderId,
          metadata: result as unknown as Record<string, unknown>,
        });
      } else if (orderId && session.payment_status === "paid") {
        await query(
          `UPDATE orders SET status='paid', paid_at=now(),
             stripe_payment_intent_id=COALESCE(stripe_payment_intent_id, $2)
           WHERE id=$1 AND status IN ('draft','payment_pending')`,
          [
            orderId,
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          ],
        );
        await audit({
          tenant_id: session.metadata?.tenant_id,
          actor_type: "stripe",
          actor_id: event.id,
          action: "order.paid",
          object_type: "order",
          object_id: orderId,
        });
      }
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (orderId && pi.metadata?.sku === "credit_pack") {
        const result = await grantCreditPack({
          orderId,
          amountPaidCents: pi.amount_received,
          currency: pi.currency,
          paymentIntentId: pi.id,
          checkoutSessionId: null,
        });
        await audit({
          tenant_id: pi.metadata?.tenant_id,
          actor_type: "stripe",
          actor_id: event.id,
          action: `credit_pack.${result.status}`,
          object_type: "order",
          object_id: orderId,
          metadata: result as unknown as Record<string, unknown>,
        });
      } else if (orderId) {
        await query(
          `UPDATE orders SET status='paid', paid_at=now(), stripe_payment_intent_id=$2
           WHERE id=$1 AND status IN ('draft','payment_pending')`,
          [orderId, pi.id],
        );
        await audit({
          tenant_id: pi.metadata?.tenant_id,
          actor_type: "stripe",
          actor_id: event.id,
          action: "order.paid",
          object_type: "order",
          object_id: orderId,
        });
      }
    } else if (event.type === "charge.refunded" || event.type === "payment_intent.canceled") {
      const obj = event.data.object as { metadata?: { order_id?: string }; id?: string };
      const orderId = obj.metadata?.order_id;
      if (orderId && (obj.metadata as { sku?: string })?.sku === "credit_pack") {
        if (event.type === "charge.refunded") await clawbackCreditPack(orderId);
      } else if (orderId) {
        await query(
          `UPDATE orders SET status='refunded', refunded_at=now() WHERE id=$1`,
          [orderId],
        );
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        await query(`UPDATE orders SET status='expired' WHERE id=$1 AND status='payment_pending'`, [orderId]);
      }
    }

    if (claim) {
      await markProcessed(query, { provider: "stripe", eventId: event.id, claim });
    } else {
      await query(
        `UPDATE webhook_events SET processed_at=now(), processing_status='processed' WHERE provider='stripe' AND provider_event_id=$1`,
        [event.id],
      );
    }
  } catch (e) {
    if (claim) {
      await markFailed(query, { provider: "stripe", eventId: event.id, claim, error: e });
    } else {
      await query(
        `UPDATE webhook_events SET processing_status='failed' WHERE provider='stripe' AND provider_event_id=$1`,
        [event.id],
      );
    }
    return jsonError("processing_failed", e instanceof Error ? e.message : "failed", {
      status: 500,
      retryable: true,
    });
  }

  return jsonOk({ received: true });
}
