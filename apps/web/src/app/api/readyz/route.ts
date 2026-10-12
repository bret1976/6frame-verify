import { jsonOk, jsonError } from "@/lib/http";
import { getPool } from "@/lib/db";
import { stripeStatus } from "@/lib/stripe";
import { x402Config } from "@/lib/x402";
import { ensureStripeDeposit, stripeDepositStatus } from "@/lib/x402-stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    const stripe = stripeStatus();
    await ensureStripeDeposit().catch(() => {});
    const xc = x402Config();
    return jsonOk({
      ready: true,
      database: "ok",
      stripe,
      x402: { enabled: !!xc, network: xc?.network ?? null, pay_to: xc?.payTo ?? null, stripe_deposit: { enabled: stripeDepositStatus().enabled, ok: !stripeDepositStatus().last_error } },
      redis: process.env.REDIS_URL ? "configured" : "missing",
    });
  } catch (e) {
    return jsonError("not_ready", e instanceof Error ? e.message : "not ready", {
      status: 503,
      retryable: true,
    });
  }
}
