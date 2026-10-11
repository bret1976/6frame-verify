import { z } from "zod";

export const PricingSku = z.enum([
  "website_quick",
  "website_full",
  "creative_pack",
  "creative_sequence",
  "credit_pack",
  "credit_pack_9",
  "credit_pack_29",
]);
export type PricingSku = z.infer<typeof PricingSku>;

/** Amounts in USD cents — product config, seeded into profile_versions */
export const SKU_PRICES_CENTS: Record<PricingSku, number> = {
  website_quick: 300,
  website_full: 1200,
  creative_pack: 600,
  creative_sequence: 2500,
  credit_pack: 10000, // legacy, no longer sold
  credit_pack_9: 900,
  credit_pack_29: 2900,
};

/** Human-readable names (also used as Stripe line-item names). */
export const SKU_LABELS: Record<PricingSku, string> = {
  website_quick: "Website Quick Check (1 page)",
  website_full: "Website Full Check (up to 10 pages)",
  creative_pack: "Creative Prompt/Continuity Pack",
  creative_sequence: "Creative Sequence Acceptance",
  credit_pack: "Prepaid Credit Pack ($110 usable)",
  credit_pack_9: "Starter Credits — $10 usable",
  credit_pack_29: "Pro Credits — $35 usable",
};

/** Credit packs: price paid → usable balance (cents). */
export const CREDIT_PACKS = {
  credit_pack_9: { price_cents: 900, usable_cents: 1000 },
  credit_pack_29: { price_cents: 2900, usable_cents: 3500 },
  /** Legacy $100 pack: kept only so already-created orders/webhooks still resolve. Not sold. */
  credit_pack: { price_cents: 10000, usable_cents: 11000 },
} as const;
export type CreditPackSku = keyof typeof CREDIT_PACKS;
export const SOLD_CREDIT_PACKS = ["credit_pack_9", "credit_pack_29"] as const;
export type SoldCreditPack = (typeof SOLD_CREDIT_PACKS)[number];

export function isCreditPackSku(sku: string | null | undefined): sku is CreditPackSku {
  return !!sku && Object.prototype.hasOwnProperty.call(CREDIT_PACKS, sku);
}
export function isSoldCreditPack(sku: string | null | undefined): sku is SoldCreditPack {
  return !!sku && (SOLD_CREDIT_PACKS as readonly string[]).includes(sku);
}

/** @deprecated legacy $100 pack usable amount; use CREDIT_PACKS[sku].usable_cents */
export const CREDIT_PACK_USABLE_CENTS = 11000;

/** Free tier: one Quick Check per API key (tenant) per UTC day. */
export const FREE_QUICK_CHECKS_PER_DAY = 1;

/**
 * SKUs currently SOLD. Creative SKUs are backed by a stub evaluator and are NOT offered.
 */
export const OFFERED_SKUS = ["website_quick", "website_full", "credit_pack_9", "credit_pack_29"] as const;
export type OfferedSku = (typeof OFFERED_SKUS)[number];
export const DISABLED_SKUS: readonly PricingSku[] = ["creative_pack", "creative_sequence", "credit_pack"];
export const CHECK_SKUS = ["website_quick", "website_full"] as const;
export type CheckSku = (typeof CHECK_SKUS)[number];

export function isSkuOffered(sku: string | null | undefined): sku is OfferedSku {
  return !!sku && (OFFERED_SKUS as readonly string[]).includes(sku);
}

/** Profiles currently sold. creative-continuity is hidden while its evaluator is a stub. */
export const OFFERED_PROFILES = ["website-acceptance"] as const;
export function isProfileOffered(slug: string | null | undefined): boolean {
  return !!slug && (OFFERED_PROFILES as readonly string[]).includes(slug);
}

/** Public SKU catalog (offered SKUs only). */
export function offeredSkuCatalog(): Record<
  OfferedSku,
  { label: string; amount_cents: number; currency: "usd"; usable_cents?: number }
> {
  return Object.fromEntries(
    OFFERED_SKUS.map((k) => [
      k,
      {
        label: SKU_LABELS[k],
        amount_cents: SKU_PRICES_CENTS[k],
        currency: "usd" as const,
        ...(isCreditPackSku(k) ? { usable_cents: CREDIT_PACKS[k].usable_cents } : {}),
      },
    ]),
  ) as Record<OfferedSku, { label: string; amount_cents: number; currency: "usd"; usable_cents?: number }>;
}
