import { z } from "zod";
import { FREE_QUICK_CHECKS_PER_DAY } from "@6frame/contracts";
import { query, withTransaction } from "./db";
import { generateApiKey, hashApiKey } from "./crypto";
import { rateLimit, subjectHash, countRecent, HOUR, DAY } from "./ratelimit";
import { audit } from "./audit";
import { baseUrl } from "./links";

export const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional(),
  /** Honeypot: real users never fill this. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type SignupOutcome =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string; details?: unknown };

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
]);

/** Issue a self-serve API key. Abuse limits: per IP 5/h & 20/day, per email 3/day, global 500/day. */
export async function selfServeSignup(raw: unknown, ip: string, channel: "rest" | "form" | "mcp"): Promise<SignupOutcome> {
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 422, code: "invalid_input", message: "A valid email is required", details: parsed.error.flatten() };
  }
  const { email, name } = parsed.data;
  const domain = email.split("@")[1] ?? "";
  if (DISPOSABLE.has(domain)) {
    return { ok: false, status: 422, code: "email_rejected", message: "Please use a non-disposable email address" };
  }
  if ((await countRecent("signup_global", "all", DAY)) >= Number(process.env.SIGNUP_GLOBAL_DAILY_MAX || 500)) {
    return { ok: false, status: 429, code: "signups_paused", message: "Daily signup capacity reached; try again tomorrow" };
  }
  const ipLim = await rateLimit("signup_ip", subjectHash(ip), [
    { seconds: HOUR, max: 5 },
    { seconds: DAY, max: 20 },
  ]);
  if (!ipLim.ok) {
    return { ok: false, status: 429, code: "rate_limited", message: `Too many signups from this network. Retry in ${ipLim.retry_after_sec}s`, details: ipLim };
  }
  const emLim = await rateLimit("signup_email", subjectHash(email), [{ seconds: DAY, max: 3 }]);
  if (!emLim.ok) {
    return { ok: false, status: 429, code: "rate_limited", message: `Too many keys for this email today. Retry in ${emLim.retry_after_sec}s`, details: emLim };
  }
  await query(`INSERT INTO rate_events (bucket, subject) VALUES ('signup_global','all')`);

  const key = generateApiKey();
  const hash = await hashApiKey(key.raw);
  const tenantId = await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM tenants WHERE lower(email)=$1 AND type='buyer' AND status='active' ORDER BY created_at ASC LIMIT 1`,
      [email],
    );
    let tid = existing.rows[0]?.id as string | undefined;
    if (!tid) {
      const t = await client.query(
        `INSERT INTO tenants (name, type, status, email) VALUES ($1,'buyer','active',$2) RETURNING id`,
        [name ? `${name} <${email}>` : email, email],
      );
      tid = t.rows[0].id as string;
    }
    await client.query(
      `INSERT INTO api_clients (tenant_id, name, key_prefix, key_hash, scopes, email)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tid, `self-serve (${channel})`, key.prefix, hash, ["verify:read", "verify:write", "billing:write"], email],
    );
    return tid;
  });
  await audit({
    tenant_id: tenantId,
    actor_type: "self_serve",
    actor_id: channel,
    action: "api_key.created",
    object_type: "api_client",
    object_id: key.prefix,
  });
  const base = baseUrl();
  return {
    ok: true,
    body: {
      api_key: key.raw,
      key_prefix: key.prefix,
      note: "Store this key now — it is shown only once.",
      free_tier: { quick_checks_per_day: FREE_QUICK_CHECKS_PER_DAY, resets: "00:00 UTC" },
      next: {
        run_free_check: `curl -X POST ${base}/v1/checks -H "Authorization: Bearer ${key.raw}" -H "content-type: application/json" -d '{"url":"https://your-site.com"}'`,
        mcp: { url: `${base}/mcp`, header: `Authorization: Bearer ${key.raw}`, tool: "verify_check_site" },
        docs: `${base}/docs`,
      },
    },
  };
}
