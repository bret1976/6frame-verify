import { z } from "zod";

export const BrandRulesSchema = z.object({
  required_terms: z.array(z.string()).default([]),
  forbidden_terms: z.array(z.string()).default([]),
  required_ctas: z.array(z.string()).default([]),
  colors: z.array(z.string()).optional(),
  logo_hint: z.string().optional(),
});

export const ViewportSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const WebsiteAcceptanceInputSchema = z.object({
  brief: z.string().min(8).max(50_000),
  target_url: z.string().url(),
  required_paths: z.array(z.string()).max(50).default(["/"]),
  viewport_matrix: z
    .array(ViewportSchema)
    .min(1)
    .max(5)
    .default([
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]),
  brand_rules: BrandRulesSchema.default({}),
  test_mode: z.enum(["read_only", "safe_forms"]).default("read_only"),
  sku: z.enum(["website_quick", "website_full"]).default("website_quick"),
});

export type WebsiteAcceptanceInput = z.infer<typeof WebsiteAcceptanceInputSchema>;

export const DEFAULT_WEBSITE_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
