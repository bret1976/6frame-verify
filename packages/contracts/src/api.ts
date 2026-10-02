import { z } from "zod";
import { WebsiteAcceptanceInputSchema } from "./website.js";
import { CreativeContinuityInputSchema } from "./creative.js";

export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
    retryable: z.boolean(),
    details: z.unknown().optional(),
  }),
});

export const QuoteRequestSchema = z.object({
  profile: z.object({
    slug: z.enum(["website-acceptance", "creative-continuity"]),
    version: z.string().default("1.0.0"),
  }),
  sku: z
    .enum([
      "website_quick",
      "website_full",
      "creative_pack",
      "creative_sequence",
    ])
    .optional(),
  input: z.union([WebsiteAcceptanceInputSchema, CreativeContinuityInputSchema]),
});

export const OrderRequestSchema = z.object({
  quote_id: z.string().uuid(),
  payment_mode: z.enum(["checkout", "payment_intent", "credit"]).default("checkout"),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

export const JobCreateRequestSchema = z.object({
  order_id: z.string().uuid(),
  profile: z.object({
    slug: z.enum(["website-acceptance", "creative-continuity"]),
    version: z.string().default("1.0.0"),
  }),
  callback: z
    .object({
      url: z.string().url(),
      secret: z.string().min(8).optional(),
      secret_ref: z.string().optional(),
    })
    .optional(),
  input: z.union([WebsiteAcceptanceInputSchema, CreativeContinuityInputSchema]),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
export type OrderRequest = z.infer<typeof OrderRequestSchema>;
export type JobCreateRequest = z.infer<typeof JobCreateRequestSchema>;
