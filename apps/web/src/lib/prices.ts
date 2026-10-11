import type Stripe from "stripe";
import { SKU_LABELS, SKU_PRICES_CENTS, type PricingSku } from "@6frame/contracts";
import { env } from "./env";

/**
 * Reusable Stripe prices — one Price per SKU instead of a fresh inline price per order.
 * Resolution order (first that matches the expected amount wins):
 *   1. STRIPE_PRICE_<SKU> env var (existing live prices)
 *   2. A price with lookup_key `6fv_<sku>_v1` (created once by this service if its key may)
 *   3. Inline price_data with a human-readable name (fallback; logged)
 */
type Resolved = { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; source: "env" | "lookup_key" | "created" | "inline" };

const cache = new Map<string, { price: string; source: Resolved["source"] }>();
const lastSource = new Map<string, Resolved["source"]>();
/** After a failed create, skip retrying for a while (avoid an extra API call per order). */
const inlineUntil = new Map<string, number>();

function envPriceId(sku: PricingSku): string | undefined {
  const e = env();
  switch (sku) {
    case "website_quick":
      return e.STRIPE_PRICE_WEBSITE_QUICK;
    case "website_full":
      return e.STRIPE_PRICE_WEBSITE_FULL;
    case "credit_pack_9":
      return e.STRIPE_PRICE_CREDIT_PACK_9;
    case "credit_pack_29":
      return e.STRIPE_PRICE_CREDIT_PACK_29;
    default:
      return undefined;
  }
}

export function lookupKey(sku: PricingSku) {
  return `6fv_${sku}_v1`;
}

export function priceSources(): Record<string, string> {
  return Object.fromEntries(lastSource.entries());
}

export async function lineItemFor(stripe: Stripe, sku: PricingSku): Promise<Resolved> {
  const amount = SKU_PRICES_CENTS[sku];
  const name = `6Frame Verify — ${SKU_LABELS[sku]}`;
  const hit = cache.get(sku);
  if (hit) {
    lastSource.set(sku, hit.source);
    return { lineItem: { price: hit.price, quantity: 1 }, source: hit.source };
  }

  const fromEnv = envPriceId(sku);
  if (fromEnv) {
    try {
      const p = await stripe.prices.retrieve(fromEnv);
      if (p.active && p.unit_amount === amount && p.currency === "usd") {
        cache.set(sku, { price: p.id, source: "env" });
        lastSource.set(sku, "env");
        return { lineItem: { price: p.id, quantity: 1 }, source: "env" };
      }
      console.warn("[prices] env price mismatch", sku, p.id, p.unit_amount, p.active);
    } catch (e) {
      console.warn("[prices] env price retrieve failed", sku, (e as Error).message);
    }
  }

  try {
    const found = await stripe.prices.list({ lookup_keys: [lookupKey(sku)], active: true, limit: 1 });
    const p = found.data[0];
    if (p && p.unit_amount === amount && p.currency === "usd") {
      cache.set(sku, { price: p.id, source: "lookup_key" });
      lastSource.set(sku, "lookup_key");
      return { lineItem: { price: p.id, quantity: 1 }, source: "lookup_key" };
    }
  } catch (e) {
    console.warn("[prices] lookup failed", sku, (e as Error).message);
  }

  if ((inlineUntil.get(sku) ?? 0) > Date.now()) {
    lastSource.set(sku, "inline");
    return {
      lineItem: { quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name } } },
      source: "inline",
    };
  }
  try {
    const p = await stripe.prices.create({
      currency: "usd",
      unit_amount: amount,
      lookup_key: lookupKey(sku),
      transfer_lookup_key: true,
      product_data: { name, metadata: { app: "6frame-verify", sku } },
      metadata: { app: "6frame-verify", sku },
    });
    cache.set(sku, { price: p.id, source: "created" });
    lastSource.set(sku, "created");
    console.log("[prices] created reusable price", sku, p.id);
    return { lineItem: { price: p.id, quantity: 1 }, source: "created" };
  } catch (e) {
    console.warn("[prices] cannot create reusable price, using inline price_data", sku, (e as Error).message);
    inlineUntil.set(sku, Date.now() + 10 * 60 * 1000);
  }

  lastSource.set(sku, "inline");
  return {
    lineItem: {
      quantity: 1,
      price_data: { currency: "usd", unit_amount: amount, product_data: { name } },
    },
    source: "inline",
  };
}
