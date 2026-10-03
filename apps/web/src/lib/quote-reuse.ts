/**
 * Quote Reuse Pack — return an existing open non-expired quote for the same
 * tenant + normalized_input_hash instead of inserting a duplicate.
 *
 * Idea inspiration (no code copied):
 * - Matthew-Selvam/Open-Dispatch / agent-ledger style fingerprint + ledger
 * - pinnedai rate-limit / idempotency fixture patterns
 * - Prior MCSC intake-guard-v1 / autopilot run-guard-v1 scout packs
 *
 * Original TypeScript only. Prefers Postgres (quotes table already stores
 * tenant_id + normalized_input_hash + status + expires_at). Process-local
 * counters supplement ops summary for reuse hits this process.
 *
 * Env: QUOTE_REUSE (default on; set 0/false/off to always create new quotes)
 *      QUOTE_REUSE_COLLISION_WINDOW_SEC (default 86400) — soft-note window for
 *      recently accepted/expired identical hashes (log/summary only).
 */
import { query } from "./db";

export const PACK = "quote-reuse-v1";
const DEFAULT_COLLISION_WINDOW_SEC = 24 * 60 * 60;

export type ReusableQuoteRow = {
  id: string;
  sku: string;
  quote_amount: number;
  currency: string;
  expires_at: string;
  normalized_input_hash: string;
  status: string;
  profile_slug: string;
  profile_version: string;
};

type ReuseStore = {
  reuse_hits: number;
  create_hits: number;
  collision_notes: number;
  last_reuse_at: string | null;
  last_quote_id: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __sixframeQuoteReuseStore: ReuseStore | undefined;
}

function truthy(name: string, defaultValue = "1"): boolean {
  const raw = process.env[name];
  const v = (raw == null ? defaultValue : raw).trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off" && v !== "";
}

export function reuseEnabled(): boolean {
  return truthy("QUOTE_REUSE", "1");
}

export function collisionWindowSec(): number {
  try {
    return Math.max(
      60,
      Number.parseInt(process.env.QUOTE_REUSE_COLLISION_WINDOW_SEC || "", 10) ||
        DEFAULT_COLLISION_WINDOW_SEC,
    );
  } catch {
    return DEFAULT_COLLISION_WINDOW_SEC;
  }
}

function store(): ReuseStore {
  if (!globalThis.__sixframeQuoteReuseStore) {
    globalThis.__sixframeQuoteReuseStore = {
      reuse_hits: 0,
      create_hits: 0,
      collision_notes: 0,
      last_reuse_at: null,
      last_quote_id: null,
    };
  }
  return globalThis.__sixframeQuoteReuseStore;
}

/** Look up an open, non-expired quote for the same tenant + input hash. */
export async function findReusableOpenQuote(
  tenantId: string,
  inputHash: string,
): Promise<ReusableQuoteRow | null> {
  if (!reuseEnabled()) return null;
  const { rows } = await query<ReusableQuoteRow>(
    `SELECT q.id, q.sku, q.quote_amount, q.currency, q.expires_at,
            q.normalized_input_hash, q.status,
            p.slug AS profile_slug, pv.version AS profile_version
     FROM quotes q
     JOIN profile_versions pv ON pv.id = q.profile_version_id
     JOIN profiles p ON p.id = pv.profile_id
     WHERE q.tenant_id = $1
       AND q.normalized_input_hash = $2
       AND q.status = 'open'
       AND q.expires_at > now()
     ORDER BY q.created_at DESC
     LIMIT 1`,
    [tenantId, inputHash],
  );
  return rows[0] ?? null;
}

/**
 * Soft-note: identical hash recently accepted/expired (ops visibility only).
 * Does not block creating a new open quote.
 */
export async function noteRecentCollision(
  tenantId: string,
  inputHash: string,
): Promise<{ noted: boolean; status?: string; quote_id?: string }> {
  const windowSec = collisionWindowSec();
  const { rows } = await query<{ id: string; status: string }>(
    `SELECT id, status FROM quotes
     WHERE tenant_id = $1
       AND normalized_input_hash = $2
       AND status IN ('accepted', 'expired')
       AND created_at > now() - ($3::int * interval '1 second')
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, inputHash, windowSec],
  );
  if (!rows[0]) return { noted: false };
  const s = store();
  s.collision_notes += 1;
  console.info(
    JSON.stringify({
      pack: PACK,
      event: "quote_hash_collision_soft",
      tenant_id: tenantId,
      input_hash: inputHash,
      prior_quote_id: rows[0].id,
      prior_status: rows[0].status,
    }),
  );
  return { noted: true, status: rows[0].status, quote_id: rows[0].id };
}

export function recordReuseHit(quoteId: string): void {
  const s = store();
  s.reuse_hits += 1;
  s.last_reuse_at = new Date().toISOString();
  s.last_quote_id = quoteId;
}

export function recordCreateHit(): void {
  store().create_hits += 1;
}

export function buildQuoteResponse(
  quote: ReusableQuoteRow,
  opts?: { reused?: boolean; inputHash?: string },
) {
  return {
    id: quote.id,
    sku: quote.sku,
    amount_cents: quote.quote_amount,
    currency: quote.currency,
    expires_at: quote.expires_at,
    profile: { slug: quote.profile_slug, version: quote.profile_version },
    input_hash: opts?.inputHash ?? quote.normalized_input_hash,
    status: "open" as const,
    ...(opts?.reused ? { reused: true as const } : {}),
  };
}

export async function quoteReuseSummary(): Promise<Record<string, unknown>> {
  const s = store();
  let openReusable = 0;
  let openTotal = 0;
  try {
    const { rows } = await query<{ open_reusable: string; open_total: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open' AND expires_at > now())::text AS open_total,
         COUNT(*) FILTER (
           WHERE status = 'open' AND expires_at > now()
         )::text AS open_reusable
       FROM quotes`,
    );
    openTotal = Number.parseInt(rows[0]?.open_total || "0", 10) || 0;
    openReusable = Number.parseInt(rows[0]?.open_reusable || "0", 10) || 0;
  } catch {
    // DB may be briefly unavailable during boot — still return process counters.
  }
  return {
    pack: PACK,
    enabled: reuseEnabled(),
    collision_window_sec: collisionWindowSec(),
    process: {
      reuse_hits: s.reuse_hits,
      create_hits: s.create_hits,
      collision_notes: s.collision_notes,
      last_reuse_at: s.last_reuse_at,
      last_quote_id: s.last_quote_id,
    },
    db: {
      open_quotes: openTotal,
      open_reusable_candidates: openReusable,
    },
  };
}
