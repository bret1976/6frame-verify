import { jsonOk, jsonError } from "@/lib/http";
import { getPool } from "@/lib/db";
import { stripeStatus } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    const stripe = stripeStatus();
    return jsonOk({
      ready: true,
      database: "ok",
      stripe,
      redis: process.env.REDIS_URL ? "configured" : "missing",
    });
  } catch (e) {
    return jsonError("not_ready", e instanceof Error ? e.message : "not ready", {
      status: 503,
      retryable: true,
    });
  }
}
