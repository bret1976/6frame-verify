import type pg from "pg";
import { CREDIT_PACK_USABLE_CENTS, SKU_PRICES_CENTS } from "@6frame/contracts";
import { query, withTransaction } from "./db";

/**
 * Prepaid credits — append-only Postgres ledger (credit_ledgers).
 * Balance = SUM(delta). Every mutation takes a per-tenant transaction-scoped advisory
 * lock so concurrent reservations cannot overdraw and balance_after stays exact.
 * Credits are ONLY granted from a signature-verified Stripe webhook for a paid
 * credit_pack order whose amount matches the live price. No manual / fake grants.
 */

type Db = pg.PoolClient;

export async function lockTenantCredits(client: Db, tenantId: string) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('credits:' || $1::text))`, [tenantId]);
}

export async function balanceOf(client: Db | null, tenantId: string): Promise<number> {
  const sql = `SELECT COALESCE(SUM(delta),0)::int AS balance FROM credit_ledgers WHERE tenant_id=$1`;
  const { rows } = client ? await client.query(sql, [tenantId]) : await query(sql, [tenantId]);
  return rows[0]?.balance ?? 0;
}

export async function recentLedger(tenantId: string, limit = 20) {
  const { rows } = await query(
    `SELECT id, order_id, delta, reason, balance_after, created_at
     FROM credit_ledgers WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

/** Atomically reserve credits for an order. Returns null if insufficient. */
export async function reserveCredits(
  client: Db,
  tenantId: string,
  orderId: string,
  amount: number,
): Promise<{ balance_after: number } | null> {
  await lockTenantCredits(client, tenantId);
  const balance = await balanceOf(client, tenantId);
  if (balance < amount) return null;
  const after = balance - amount;
  await client.query(
    `INSERT INTO credit_ledgers (tenant_id, order_id, delta, reason, balance_after, idempotency_key)
     VALUES ($1,$2,$3,'reserve_for_order',$4,$5)`,
    [tenantId, orderId, -amount, after, `reserve:${orderId}`],
  );
  return { balance_after: after };
}

export type GrantResult =
  | { status: "granted"; credited_cents: number; balance_after: number }
  | { status: "already_granted" }
  | { status: "rejected"; reason: string };

/**
 * Called only from the verified Stripe webhook. Marks the credit_pack order paid and
 * credits CREDIT_PACK_USABLE_CENTS to the tenant exactly once.
 */
export async function grantCreditPack(args: {
  orderId: string;
  amountPaidCents: number | null | undefined;
  currency: string | null | undefined;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
}): Promise<GrantResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [args.orderId]);
    const order = rows[0];
    if (!order) return { status: "rejected", reason: "order_not_found" };
    if (order.sku !== "credit_pack") return { status: "rejected", reason: "not_credit_pack" };
    if (order.status === "credited") return { status: "already_granted" };
    if (!["draft", "payment_pending", "paid"].includes(order.status)) {
      return { status: "rejected", reason: `order_status_${order.status}` };
    }
    if (
      args.checkoutSessionId &&
      order.stripe_checkout_session_id &&
      order.stripe_checkout_session_id !== args.checkoutSessionId
    ) {
      return { status: "rejected", reason: "checkout_session_mismatch" };
    }
    const expected = SKU_PRICES_CENTS.credit_pack;
    if ((args.currency ?? "").toLowerCase() !== "usd" || (args.amountPaidCents ?? 0) < expected) {
      return { status: "rejected", reason: "amount_mismatch" };
    }

    await lockTenantCredits(client, order.tenant_id);
    const existing = await client.query(
      `SELECT 1 FROM credit_ledgers WHERE order_id=$1 AND reason='credit_pack_purchase'`,
      [order.id],
    );
    if (existing.rows[0]) {
      await client.query(`UPDATE orders SET status='credited' WHERE id=$1`, [order.id]);
      return { status: "already_granted" };
    }
    const balance = await balanceOf(client, order.tenant_id);
    const after = balance + CREDIT_PACK_USABLE_CENTS;
    await client.query(
      `INSERT INTO credit_ledgers (tenant_id, order_id, delta, reason, balance_after, idempotency_key)
       VALUES ($1,$2,$3,'credit_pack_purchase',$4,$5)`,
      [order.tenant_id, order.id, CREDIT_PACK_USABLE_CENTS, after, `grant:${order.id}`],
    );
    await client.query(
      `UPDATE orders SET status='credited', paid_at=COALESCE(paid_at, now()),
         stripe_payment_intent_id=COALESCE(stripe_payment_intent_id, $2)
       WHERE id=$1`,
      [order.id, args.paymentIntentId],
    );
    return { status: "granted", credited_cents: CREDIT_PACK_USABLE_CENTS, balance_after: after };
  });
}

/** Refund of a credit_pack charge: claw back the granted credits once (balance may go negative). */
export async function clawbackCreditPack(orderId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order || order.sku !== "credit_pack") return false;
    await lockTenantCredits(client, order.tenant_id);
    const granted = await client.query(
      `SELECT delta FROM credit_ledgers WHERE order_id=$1 AND reason='credit_pack_purchase'`,
      [order.id],
    );
    const already = await client.query(
      `SELECT 1 FROM credit_ledgers WHERE order_id=$1 AND reason='credit_pack_refund'`,
      [order.id],
    );
    if (granted.rows[0] && !already.rows[0]) {
      const balance = await balanceOf(client, order.tenant_id);
      const delta = -Number(granted.rows[0].delta);
      await client.query(
        `INSERT INTO credit_ledgers (tenant_id, order_id, delta, reason, balance_after, idempotency_key)
         VALUES ($1,$2,$3,'credit_pack_refund',$4,$5)`,
        [order.tenant_id, order.id, delta, balance + delta, `clawback:${order.id}`],
      );
    }
    await client.query(`UPDATE orders SET status='refunded', refunded_at=now() WHERE id=$1`, [order.id]);
    return true;
  });
}
