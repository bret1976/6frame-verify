import { z } from "zod";
import {
  SKU_PRICES_CENTS,
  WebsiteAcceptanceInputSchema,
  FREE_QUICK_CHECKS_PER_DAY,
  type CheckSku,
} from "@6frame/contracts";
import { assertSafePublicHttpsUrl } from "@6frame/evaluators";
import type { AuthContext } from "./auth";
import { query, withTransaction } from "./db";
import { sha256 } from "./crypto";
import { reserveCredits, balanceOf } from "./credits";
import { insertJobForOrder, enqueueOrFail, publicToken, createCheckoutForCheck } from "./fulfil";
import { rateLimit, subjectHash, countRecent, HOUR, DAY } from "./ratelimit";
import { getStripe } from "./stripe";
import { isStripeReady } from "./env";
import { audit } from "./audit";
import { reportPageUrl, baseUrl } from "./links";

export const CheckRequestSchema = z.object({
  url: z.string().url(),
  brief: z.string().max(5000).optional(),
  sku: z.enum(["website_quick", "website_full"]).default("website_quick"),
  /** Extra paths for website_full (max 10 incl. "/"). */
  paths: z.array(z.string().startsWith("/").max(300)).max(10).optional(),
  pay_with: z.enum(["auto", "free", "credit", "checkout"]).default("auto"),
  required_terms: z.array(z.string().max(120)).max(20).optional(),
  required_ctas: z.array(z.string().max(120)).max(20).optional(),
  forbidden_terms: z.array(z.string().max(120)).max(20).optional(),
  callback: z.object({ url: z.string().url(), secret: z.string().min(8).optional() }).optional(),
});
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export type CheckOutcome = { status: number; body: Record<string, unknown> };

export function buildWebsiteInput(req: { url: string; brief?: string; sku: CheckSku; paths?: string[]; required_terms?: string[]; required_ctas?: string[]; forbidden_terms?: string[] }) {
  const paths = req.sku === "website_full" ? Array.from(new Set(["/", ...(req.paths ?? [])])).slice(0, 10) : ["/"];
  return WebsiteAcceptanceInputSchema.parse({
    brief: req.brief && req.brief.trim().length >= 8 ? req.brief.trim() : `Pre-launch QA check of ${req.url}`,
    target_url: req.url,
    required_paths: paths,
    brand_rules: {
      required_terms: req.required_terms ?? [],
      required_ctas: req.required_ctas ?? [],
      forbidden_terms: req.forbidden_terms ?? [],
    },
    sku: req.sku,
  });
}

const FREE_GLOBAL_DAILY_MAX = Number(process.env.FREE_CHECKS_GLOBAL_DAILY_MAX || 300);

/**
 * One-call check: free daily Quick Check → prepaid credit → Stripe Checkout link (402).
 */
export async function runCheck(auth: AuthContext, raw: unknown, ip: string): Promise<CheckOutcome> {
  const parsed = CheckRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 422, body: { error: { code: "invalid_input", message: "Body needs {\"url\":\"https://...\"}", details: parsed.error.flatten() } } };
  }
  const req = parsed.data;
  const lim = await rateLimit("checks_key", auth.clientId, [{ seconds: HOUR, max: 30 }]);
  if (!lim.ok) {
    return { status: 429, body: { error: { code: "rate_limited", message: `Too many checks. Retry in ${lim.retry_after_sec}s`, details: lim } } };
  }
  const safe = await assertSafePublicHttpsUrl(req.url);
  if (!safe.ok) {
    return { status: 422, body: { error: { code: "unsafe_url", message: safe.message, details: { code: safe.code } } } };
  }
  const input = buildWebsiteInput(req);
  const amount = SKU_PRICES_CENTS[req.sku];
  const inputHash = sha256(JSON.stringify(input));

  async function makeQuote(client: import("pg").PoolClient) {
    const { rows: pv } = await client.query(
      `SELECT pv.id FROM profiles p JOIN profile_versions pv ON pv.id = p.current_published_version_id WHERE p.slug='website-acceptance'`,
    );
    const { rows } = await client.query(
      `INSERT INTO quotes (tenant_id, profile_version_id, sku, normalized_input_hash, quote_amount, currency, input_json, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,'usd',$6, now() + interval '30 minutes','accepted') RETURNING id`,
      [auth.tenantId, pv[0].id, req.sku, inputHash, amount, JSON.stringify(input)],
    );
    return rows[0].id as string;
  }

  function queuedBody(job: { id: string; public_token: string; deadline_at: string }, orderId: string, paidWith: string, extra: Record<string, unknown> = {}) {
    return {
      job_id: job.id,
      order_id: orderId,
      status: "queued",
      paid_with: paidWith,
      sku: req.sku,
      target_url: req.url,
      report_page: reportPageUrl(job.public_token),
      poll: `${baseUrl()}/v1/jobs/${job.id}`,
      report_api: `${baseUrl()}/v1/jobs/${job.id}/report`,
      deadline_at: job.deadline_at,
      ...extra,
    };
  }

  // 1) Free daily Quick Check
  if (req.sku === "website_quick" && (req.pay_with === "auto" || req.pay_with === "free")) {
    const ipFree = subjectHash(ip);
    const ipUsed = await countRecent("free_ip", ipFree, DAY);
    const globalUsed = await countRecent("free_global", "all", DAY);
    if (ipUsed < 3 && globalUsed < FREE_GLOBAL_DAILY_MAX) {
      const res = await withTransaction(async (client) => {
        const claim = await client.query(
          `INSERT INTO free_checks (tenant_id, day, ip_hash) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)
           ON CONFLICT (tenant_id, day) DO NOTHING RETURNING tenant_id`,
          [auth.tenantId, ipFree],
        );
        if (!claim.rows[0]) return null;
        const quoteId = await makeQuote(client);
        const { rows: or } = await client.query(
          `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, paid_at, public_token, payment_source)
           VALUES ($1,$2,'website_quick',0,'usd','paid',now(),$3,'free') RETURNING id`,
          [auth.tenantId, quoteId, publicToken()],
        );
        const orderId = or[0].id as string;
        await client.query(
          `UPDATE free_checks SET order_id=$1 WHERE tenant_id=$2 AND day=(now() AT TIME ZONE 'UTC')::date`,
          [orderId, auth.tenantId],
        );
        const job = await insertJobForOrder(client, { tenantId: auth.tenantId, orderId, input, callback: req.callback ?? null });
        return { orderId, job };
      });
      if (res) {
        await query(`INSERT INTO rate_events (bucket, subject) VALUES ('free_ip',$1),('free_global','all')`, [ipFree]);
        await enqueueOrFail(res.job.id, res.orderId);
        await audit({ tenant_id: auth.tenantId, actor_type: "api_client", actor_id: auth.clientId, action: "check.free_queued", object_type: "job", object_id: res.job.id });
        return { status: 201, body: queuedBody(res.job, res.orderId, "free_daily", { free_checks_left_today: 0 }) };
      }
    }
    if (req.pay_with === "free") {
      return { status: 402, body: { error: { code: "free_quota_used", message: `Free tier is ${FREE_QUICK_CHECKS_PER_DAY} Quick Check per key per UTC day (and 3 per network). Use pay_with "auto" to pay with credit or Stripe.` } } };
    }
  }

  // 2) Prepaid credit
  if (req.pay_with === "auto" || req.pay_with === "credit") {
    const res = await withTransaction(async (client) => {
      const quoteId = await makeQuote(client);
      const { rows: or } = await client.query(
        `INSERT INTO orders (tenant_id, quote_id, sku, amount, currency, status, paid_at, public_token, payment_source)
         VALUES ($1,$2,$3,$4,'usd','credit_reserved',now(),$5,'credit') RETURNING id`,
        [auth.tenantId, quoteId, req.sku, amount, publicToken()],
      );
      const orderId = or[0].id as string;
      const reserved = await reserveCredits(client, auth.tenantId, orderId, amount);
      if (!reserved) throw Object.assign(new Error("insufficient_credit"), { code: "insufficient_credit" });
      const job = await insertJobForOrder(client, { tenantId: auth.tenantId, orderId, input, callback: req.callback ?? null });
      return { orderId, job, balance_after: reserved.balance_after };
    }).catch((e: Error & { code?: string }) => {
      if (e.code === "insufficient_credit") return null;
      throw e;
    });
    if (res) {
      await enqueueOrFail(res.job.id, res.orderId);
      await audit({ tenant_id: auth.tenantId, actor_type: "api_client", actor_id: auth.clientId, action: "check.credit_queued", object_type: "job", object_id: res.job.id });
      return { status: 201, body: queuedBody(res.job, res.orderId, "credit", { credit_balance_after_cents: res.balance_after }) };
    }
    if (req.pay_with === "credit") {
      const bal = await balanceOf(null, auth.tenantId);
      return { status: 402, body: { error: { code: "insufficient_credit", message: "Not enough prepaid credit", details: { balance_cents: bal, required_cents: amount, buy_credits: "POST /v1/credits/checkout {\"pack\":\"credit_pack_9\"}" } } } };
    }
  }

  // 3) Stripe Checkout — the job runs automatically once Stripe confirms payment
  if (!isStripeReady()) {
    return { status: 503, body: { error: { code: "stripe_not_configured", message: "Payments unavailable", retryable: true } } };
  }
  const { order, session, order_url } = await createCheckoutForCheck(getStripe()!, {
    tenantId: auth.tenantId,
    sku: req.sku,
    amountCents: amount,
    input,
    origin: "api_checks",
  });
  await audit({ tenant_id: auth.tenantId, actor_type: "api_client", actor_id: auth.clientId, action: "check.checkout_created", object_type: "order", object_id: order.id });
  return {
    status: 402,
    body: {
      error: {
        code: "payment_required",
        message: `No free check or credit available. Pay $${(amount / 100).toFixed(2)} at checkout_url (a human completes it); the check then runs automatically.`,
      },
      checkout_url: session.url,
      order_id: order.id,
      order_page: order_url,
      amount_cents: amount,
      sku: req.sku,
      buy_credits: "POST /v1/credits/checkout {\"pack\":\"credit_pack_9\"} ($9 → $10 credit) or credit_pack_29 ($29 → $35)",
    },
  };
}
