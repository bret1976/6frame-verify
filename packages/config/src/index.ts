import { z } from "zod";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_TOKEN: z.string().min(8).optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  STORAGE_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  STORAGE_BUCKET: z.string().default("6frame-verify-evidence"),
  STORAGE_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STORAGE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STORAGE_REGION: z.string().default("us-east-1"),
  EVIDENCE_DIR: z.string().default("./evidence"),
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PUBLISHABLE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_WEBSITE_QUICK: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_WEBSITE_FULL: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_CREATIVE_PACK: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_CREATIVE_SEQUENCE: z.preprocess(emptyToUndefined, z.string().optional()),
  STRIPE_PRICE_CREDIT_PACK: z.preprocess(emptyToUndefined, z.string().optional()),
  REPORT_SIGNING_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  API_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().optional()),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(emptyToUndefined, z.string().optional()),
  MODEL_PROVIDER_PRIMARY_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  MODEL_PROVIDER_FALLBACK_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export function stripeConfigured(env: Env = loadEnv()): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function assertProductionStripe(env: Env = loadEnv()) {
  if (env.APP_ENV !== "production" && env.NODE_ENV !== "production") return;
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Production requires STRIPE_SECRET_KEY");
  }
  // Standard (sk_live_) and restricted (rk_live_) live keys are both accepted.
  if (/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY)) {
    throw new Error("Production must not use Stripe test keys");
  }
}

export const API_VERSION = "2026-10-02";
export const PRODUCT_NAME = "6Frame Verify";
export const PRODUCT_OWNER = "6Frame Studio";
