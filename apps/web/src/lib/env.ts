import { loadEnv, stripeConfigured, type Env } from "@6frame/config";

export function env(): Env {
  return loadEnv(process.env);
}

export function isStripeReady(): boolean {
  try {
    return stripeConfigured(env());
  } catch {
    return false;
  }
}

export function requireEnv(): Env {
  return env();
}
