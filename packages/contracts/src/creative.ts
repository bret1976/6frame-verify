import { z } from "zod";

export const CreativeShotSchema = z.object({
  id: z.string(),
  prompt: z.string().optional(),
  reference_urls: z.array(z.string().url()).default([]),
  generated_urls: z.array(z.string().url()).default([]),
  intended_action: z.string().optional(),
});

export const CreativeContinuityInputSchema = z.object({
  creative_bible: z.record(z.unknown()),
  shots: z.array(CreativeShotSchema).min(1).max(30),
  output_type: z.enum(["prompt_package", "image_sequence", "video_sequence"]),
  sku: z.enum(["creative_pack", "creative_sequence"]).default("creative_pack"),
});

export type CreativeContinuityInput = z.infer<typeof CreativeContinuityInputSchema>;
