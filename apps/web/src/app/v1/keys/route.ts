import { jsonOk, jsonError } from "@/lib/http";
import { selfServeSignup } from "@/lib/signup";
import { clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** POST /v1/keys {email} — self-serve API key (shown once). Keyless; rate limited per IP/email. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const out = await selfServeSignup(body, clientIp(req), "rest");
  if (!out.ok) return jsonError(out.code, out.message, { status: out.status, details: out.details, retryable: out.status === 429 });
  return jsonOk(out.body, { status: 201 });
}
