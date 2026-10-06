import Stripe from "stripe";
import { env, isStripeReady } from "./env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!isStripeReady()) return null;
  if (!stripe) {
    stripe = new Stripe(env().STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripe;
}

export function stripeStatus() {
  const e = env();
  return {
    configured: isStripeReady(),
    publishable_key_present: Boolean(e.STRIPE_PUBLISHABLE_KEY),
    // Accept standard (sk_) and restricted (rk_) keys.
    mode: /^(sk|rk)_live_/.test(e.STRIPE_SECRET_KEY ?? "")
      ? "live"
      : /^(sk|rk)_test_/.test(e.STRIPE_SECRET_KEY ?? "")
        ? "test"
        : e.STRIPE_SECRET_KEY
          ? "unknown"
          : "unset",
    key_type: e.STRIPE_SECRET_KEY?.startsWith("rk_")
      ? "restricted"
      : e.STRIPE_SECRET_KEY?.startsWith("sk_")
        ? "standard"
        : null,
  };
}

export { isStripeReady } from "./env";
