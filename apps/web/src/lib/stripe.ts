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
    mode: e.STRIPE_SECRET_KEY?.startsWith("sk_live_")
      ? "live"
      : e.STRIPE_SECRET_KEY?.startsWith("sk_test_")
        ? "test"
        : "unset",
  };
}

export { isStripeReady } from "./env";
