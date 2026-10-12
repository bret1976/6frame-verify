import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError, unauthorized } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { runCheck, x402AnonymousAuth } from "@/lib/checks";
import { x402Config } from "@/lib/x402";
import { ensureStripeDeposit } from "@/lib/x402-stripe";
import { baseUrl } from "@/lib/links";
import { clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /v1/checks {url, sku?, brief?, paths?, pay_with?}
 * One call: uses today's free Quick Check, else prepaid credit, else returns 402 + Stripe checkout_url.
 * Idempotency-Key optional (recommended for retries).
 * No key? If x402 is enabled, keyless agents get a 402 with x402 USDC payment requirements and can
 * retry with X-PAYMENT (or PAYMENT-SIGNATURE) to pay per check autonomously.
 */
export async function POST(req: Request) {
  await ensureStripeDeposit().catch(() => {});
  const payment = req.headers.get("x-payment") ?? req.headers.get("payment-signature");
  const resource = `${baseUrl()}/v1/checks`;
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) {
    if (!x402Config()) return unauthorized();
    const body = await req.json().catch(() => null);
    const out = await runCheck(await x402AnonymousAuth(), body, clientIp(req), { payment, resource, anonymous: true });
    return jsonOk(out.body, { status: out.status, headers: out.headers });
  }
  if (!requireScope(auth, "verify:write")) return jsonError("forbidden", "Missing verify:write scope", { status: 403 });
  const idem = req.headers.get("idempotency-key");
  if (idem) {
    const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/checks");
    if (cached) return jsonOk(cached.response_body, { status: cached.response_status });
  }
  const body = await req.json().catch(() => null);
  const out = await runCheck(auth, body, clientIp(req), { payment, resource });
  if (idem && out.status < 500 && out.status !== 429) {
    await saveIdempotentResponse(auth, idem, "POST", "/v1/checks", body, out.status, out.body);
  }
  return jsonOk(out.body, { status: out.status, headers: out.headers });
}
