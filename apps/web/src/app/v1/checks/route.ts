import { authenticateBearer, requireScope } from "@/lib/auth";
import { jsonOk, jsonError, unauthorized } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { runCheck } from "@/lib/checks";
import { clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /v1/checks {url, sku?, brief?, paths?, pay_with?}
 * One call: uses today's free Quick Check, else prepaid credit, else returns 402 + Stripe checkout_url.
 * Idempotency-Key optional (recommended for retries).
 */
export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return unauthorized();
  if (!requireScope(auth, "verify:write")) return jsonError("forbidden", "Missing verify:write scope", { status: 403 });
  const idem = req.headers.get("idempotency-key");
  if (idem) {
    const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/checks");
    if (cached) return jsonOk(cached.response_body, { status: cached.response_status });
  }
  const body = await req.json().catch(() => null);
  const out = await runCheck(auth, body, clientIp(req));
  if (idem && out.status < 500 && out.status !== 429) {
    await saveIdempotentResponse(auth, idem, "POST", "/v1/checks", body, out.status, out.body);
  }
  return jsonOk(out.body, { status: out.status });
}
