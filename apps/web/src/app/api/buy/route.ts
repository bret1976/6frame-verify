import { z } from "zod";
import { SKU_PRICES_CENTS } from "@6frame/contracts";
import { assertSafePublicHttpsUrl } from "@6frame/evaluators";
import { jsonOk, jsonError } from "@/lib/http";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { isStripeReady } from "@/lib/env";
import { rateLimit, subjectHash, clientIp, HOUR, DAY } from "@/lib/ratelimit";
import { buildWebsiteInput } from "@/lib/checks";
import { createCheckoutForCheck } from "@/lib/fulfil";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BuySchema = z.object({
  url: z.string().trim().min(4).max(2000),
  email: z.string().trim().toLowerCase().email().max(254),
  website: z.string().max(0).optional().or(z.literal("")), // honeypot
});

/** Homepage "Check my site — $3" box → Stripe Checkout. The check runs automatically after payment. */
export async function POST(req: Request) {
  const parsed = BuySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid_input", "Enter your site URL and a valid email", { status: 422 });
  let url = parsed.data.url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/^http:\/\//i, "https://");
  const safe = await assertSafePublicHttpsUrl(url);
  if (!safe.ok) return jsonError("unsafe_url", `That URL can't be checked: ${safe.message}`, { status: 422 });

  const ip = clientIp(req);
  const lim = await rateLimit("buy_ip", subjectHash(ip), [
    { seconds: HOUR, max: 10 },
    { seconds: DAY, max: 30 },
  ]);
  if (!lim.ok) return jsonError("rate_limited", `Too many checkout attempts. Retry in ${lim.retry_after_sec}s`, { status: 429 });
  if (!isStripeReady()) return jsonError("stripe_not_configured", "Payments are temporarily unavailable", { status: 503 });

  const email = parsed.data.email;
  const existing = await query(
    `SELECT id FROM tenants WHERE lower(email)=$1 AND type='buyer' AND status='active' ORDER BY created_at ASC LIMIT 1`,
    [email],
  );
  const tenantId =
    (existing.rows[0]?.id as string | undefined) ??
    ((await query(`INSERT INTO tenants (name, type, status, email) VALUES ($1,'buyer','active',$1) RETURNING id`, [email])).rows[0].id as string);

  const input = buildWebsiteInput({ url, sku: "website_quick" });
  const { order, session, price_source } = await createCheckoutForCheck(getStripe()!, {
    tenantId,
    sku: "website_quick",
    amountCents: SKU_PRICES_CENTS.website_quick,
    input,
    customerEmail: email,
    origin: "homepage",
  });
  await audit({ tenant_id: tenantId, actor_type: "web", actor_id: "homepage_buy", action: "order.payment_pending", object_type: "order", object_id: order.id, metadata: { price_source } });
  return jsonOk({ checkout_url: session.url, order_id: order.id });
}
