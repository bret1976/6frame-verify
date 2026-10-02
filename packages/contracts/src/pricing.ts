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
