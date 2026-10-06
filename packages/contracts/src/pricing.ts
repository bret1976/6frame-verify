import { z } from "zod";

export const PricingSku = z.enum([
  "website_quick",
  "website_full",
  "creative_pack",
  "creative_sequence",
  "credit_pack",
]);
export type PricingSku = z.infer<typeof PricingSku>;

/** Amounts in USD cents — product config, seeded into profile_versions */
export const SKU_PRICES_CENTS: Record<PricingSku, number> = {
  website_quick: 300,
  website_full: 1200,
  creative_pack: 600,
  creative_sequence: 2500,
  credit_pack: 10000,
};

export const SKU_LABELS: Record<PricingSku, string> = {
  website_quick: "Website Quick Check",
  website_full: "Website Full Acceptance",
  creative_pack: "Creative Prompt/Continuity Pack",
  creative_sequence: "Creative Sequence Acceptance",
  credit_pack: "Prepaid Credit Pack ($110 usable)",
};

export const CREDIT_PACK_USABLE_CENTS = 11000;

/**
 * SKUs currently SOLD. Creative SKUs (creative_pack $6, creative_sequence $25) are backed by
 * a stub evaluator (creative-stub) that returns not_evaluable for every shot, so they are
 * NOT offered and must never be quoted, ordered, or charged until a real evaluator ships.
 */
export const OFFERED_SKUS = ["website_quick", "website_full", "credit_pack"] as const;
export type OfferedSku = (typeof OFFERED_SKUS)[number];
export const DISABLED_SKUS: readonly PricingSku[] = ["creative_pack", "creative_sequence"];

export function isSkuOffered(sku: string | null | undefined): sku is OfferedSku {
  return !!sku && (OFFERED_SKUS as readonly string[]).includes(sku);
}

/** Profiles currently sold. creative-continuity is hidden while its evaluator is a stub. */
export const OFFERED_PROFILES = ["website-acceptance"] as const;
export function isProfileOffered(slug: string | null | undefined): boolean {
  return !!slug && (OFFERED_PROFILES as readonly string[]).includes(slug);
}

/** Public SKU catalog (offered SKUs only). */
export function offeredSkuCatalog(): Record<OfferedSku, { label: string; amount_cents: number; currency: "usd" }> {
  return Object.fromEntries(
    OFFERED_SKUS.map((k) => [k, { label: SKU_LABELS[k], amount_cents: SKU_PRICES_CENTS[k], currency: "usd" as const }]),
  ) as Record<OfferedSku, { label: string; amount_cents: number; currency: "usd" }>;
}
