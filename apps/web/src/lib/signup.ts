import { z } from "zod";
import { FREE_QUICK_CHECKS_PER_DAY } from "@6frame/contracts";
import { query, withTransaction } from "./db";
import { generateApiKey, hashApiKey } from "./crypto";
import { rateLimit, subjectHash, countRecent, HOUR, DAY } from "./ratelimit";
import { audit } from "./audit";
import { baseUrl } from "./links";

export const SignupSchema = z.object({
  /** Optional: agents can get a free key without an email. */
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().toLowerCase().email().max(254).optional()),
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

/** Issue a self-serve API key. Abuse limits: per IP 5/h & 20/day, per email 3/day (when given), global 500/day. */
export async function selfServeSignup(raw: unknown, ip: string, channel: "rest" | "form" | "mcp"): Promise<SignupOutcome> {
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 422, code: "invalid_input", message: "Invalid input: email is optional, but if provided it must be a valid address", details: parsed.error.flatten() };
  }
  const { email, name } = parsed.data;
  const domain = email ? (email.split("@")[1] ?? "") : "";
  if (email && DISPOSABLE.has(domain)) {
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
  if (email) {
    const emLim = await rateLimit("signup_email", subjectHash(email), [{ seconds: DAY, max: 3 }]);
    if (!emLim.ok) {
      return { ok: false, status: 429, code: "rate_limited", message: `Too many keys for this email today. Retry in ${emLim.retry_after_sec}s`, details: emLim };
    }
  }
  await query(`INSERT INTO rate_events (bucket, subject) VALUES ('signup_global','all')`);

  const key = generateApiKey();
  const hash = await hashApiKey(key.raw);
  const tenantId = await withTransaction(async (client) => {
    let tid: string | undefined;
    if (email) {
      const existing = await client.query(
        `SELECT id FROM tenants WHERE lower(email)=$1 AND type='buyer' AND status='active' ORDER BY created_at ASC LIMIT 1`,
        [email],
      );
      tid = existing.rows[0]?.id as string | undefined;
    }
    if (!tid) {
      const label = email ? (name ? `${name} <${email}>` : email) : (name ? `${name} (agent, no email)` : `agent key ${key.prefix}`);
      const t = await client.query(
        `INSERT INTO tenants (name, type, status, email) VALUES ($1,'buyer','active',$2) RETURNING id`,
        [label, email ?? null],
      );
      tid = t.rows[0].id as string;
    }
    await client.query(
      `INSERT INTO api_clients (tenant_id, name, key_prefix, key_hash, scopes, email)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tid, `self-serve (${channel})`, key.prefix, hash, ["verify:read", "verify:write", "billing:write"], email ?? null],
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
      free_tier: { quick_checks_per_day: FREE_QUICK_CHECKS_PER_DAY, max_free_checks_per_network_per_day: 3, resets: "00:00 UTC", email_required: false },
      next: {
        run_free_check: `curl -X POST ${base}/v1/checks -H "Authorization: Bearer ${key.raw}" -H "content-type: application/json" -d '{"url":"https://your-site.com"}'`,
        mcp: { url: `${base}/mcp`, header: `Authorization: Bearer ${key.raw}`, tool: "verify_check_site" },
        docs: `${base}/docs`,
      },
    },
  };
}
