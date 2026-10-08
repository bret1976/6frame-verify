/**
 * Webhook Inbox Pack (webhook-inbox-v1) — make Stripe webhook retries actually retry.
 *
 * Before this pack the handler treated ANY error on the webhook_events INSERT as
 * "replay" and answered 200 {duplicate:true}. Two money-losing holes:
 *   1. An event whose processing FAILED (row marked 'failed', 500 returned) was
 *      acked as a duplicate when Stripe retried it, so the paid order / credit
 *      pack grant was never applied.
 *   2. A transient DB error on the INSERT itself was also acked 200, so Stripe
 *      stopped retrying a payment we never recorded.
 *
 * Now (transactional-inbox pattern):
 *   - INSERT … ON CONFLICT DO NOTHING claims a fresh event.
 *   - A retry of a 'failed' event (or one stuck 'received'/'retrying' longer than
 *     WEBHOOK_INBOX_STALE_SEC, e.g. the process died mid-request) is atomically
 *     re-claimed (single UPDATE … RETURNING, so concurrent deliveries can't both
 *     run) and processed again. All existing handlers are already idempotent
 *     (status-guarded UPDATEs, one-grant/one-clawback unique indexes).
 *   - Truly processed events still get the cheap 200 {duplicate:true}.
 *   - A delivery that arrives while the same event is still being processed gets
 *     409 retryable (Stripe tries again later) instead of a silent 200.
 *   - Any DB error while claiming → 503 retryable, so Stripe keeps retrying.
 *   - After WEBHOOK_INBOX_MAX_ATTEMPTS the event is "parked" (acked 200) so a
 *     permanently broken event can't loop forever; it shows in the summary.
 *
 * Never sends anything, never calls Stripe, never moves money by itself.
 * Kill switch: WEBHOOK_INBOX=0 restores the exact previous behavior.
 *
 * Pattern credits (ideas only, no code copied):
 *   - Stripe docs "Handle duplicate events" / at-least-once delivery guidance
 *   - dj-stripe/dj-stripe (MIT) WebhookEventTrigger processed/valid + reprocess
 *   - svix/svix-webhooks (MIT) & hookdeck/outpost (Apache-2.0) attempt tracking
 *   - frain-dev/convoy (MPL-2.0, idea only) dedup design write-up
 *   - r/bun "Stripe webhooks are easy until the same event arrives twice":
 *     "don't treat 'event exists' and 'event was processed' as the same state"
 */

export const PACK = "webhook-inbox-v1";

export type QueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;

export type ClaimResult =
  | { kind: "fresh"; attempt: 1 }
  | { kind: "reclaimed"; attempt: number; previous_status: string; payload_mismatch: boolean }
  | { kind: "duplicate" }
  | { kind: "in_flight"; attempt: number }
  | { kind: "parked"; attempt: number }
  | { kind: "db_unavailable"; error: string };

const DEFAULT_STALE_SEC = 120;
const DEFAULT_MAX_ATTEMPTS = 25;

function truthy(name: string, defaultValue = "1"): boolean {
  const raw = process.env[name];
  const v = (raw == null ? defaultValue : raw).trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off" && v !== "";
}

function intEnv(name: string, def: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function inboxEnabled(): boolean {
  return truthy("WEBHOOK_INBOX", "1");
}

export function staleSec(): number {
  return intEnv("WEBHOOK_INBOX_STALE_SEC", DEFAULT_STALE_SEC, 30, 86400);
}

export function maxAttempts(): number {
  return intEnv("WEBHOOK_INBOX_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 2, 1000);
}

type Counters = {
  fresh: number;
  duplicate_acked: number;
  reclaimed: number;
  reclaim_succeeded: number;
  reclaim_failed: number;
  processing_failed: number;
  in_flight_deferred: number;
  db_unavailable_deferred: number;
  parked_acked: number;
  payload_mismatch: number;
  last_reclaimed_at: string | null;
  last_recovered_at: string | null;
  last_deferred_at: string | null;
  since: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __sixframeWebhookInbox: Counters | undefined;
}

export function counters(): Counters {
  if (!globalThis.__sixframeWebhookInbox) {
    globalThis.__sixframeWebhookInbox = {
      fresh: 0,
      duplicate_acked: 0,
      reclaimed: 0,
      reclaim_succeeded: 0,
      reclaim_failed: 0,
      processing_failed: 0,
      in_flight_deferred: 0,
      db_unavailable_deferred: 0,
      parked_acked: 0,
      payload_mismatch: 0,
      last_reclaimed_at: null,
      last_recovered_at: null,
      last_deferred_at: null,
      since: new Date().toISOString(),
    };
  }
  return globalThis.__sixframeWebhookInbox;
}

export function resetCountersForTest(): void {
  globalThis.__sixframeWebhookInbox = undefined;
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

/**
 * Pure classification of an existing row that could NOT be re-claimed.
 * (Exported for tests.)
 */
export function classifyExisting(row: {
  processing_status: string;
  attempt_count: number;
  age_sec: number;
}, opts: { staleSec: number; maxAttempts: number }): "duplicate" | "parked" | "in_flight" {
  if (row.processing_status === "processed") return "duplicate";
  const retryable =
    row.processing_status === "failed" ||
    ((row.processing_status === "received" || row.processing_status === "retrying") &&
      row.age_sec >= opts.staleSec);
  if (retryable && row.attempt_count >= opts.maxAttempts) return "parked";
  if (
    row.processing_status === "received" ||
    row.processing_status === "retrying" ||
    row.processing_status === "failed"
  ) {
    // Being processed right now (or just re-claimed by a concurrent delivery):
    // ask Stripe to come back later instead of acking.
    return "in_flight";
  }
  // Unknown legacy status: treat as already handled (previous behavior).
  return "duplicate";
}

/** Claim an inbound event for processing. Never throws. */
export async function claimWebhookEvent(
  q: QueryFn,
  args: { provider: string; eventId: string; payloadHash: string },
): Promise<ClaimResult> {
  const c = counters();
  const stale = staleSec();
  const max = maxAttempts();
  try {
    const ins = await q(
      `INSERT INTO webhook_events
         (provider, provider_event_id, payload_hash, processing_status, attempt_count, last_attempt_at)
       VALUES ($1,$2,$3,'received',1,now())
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [args.provider, args.eventId, args.payloadHash],
    );
    if (ins.rows.length > 0) {
      c.fresh += 1;
      return { kind: "fresh", attempt: 1 };
    }

    // Atomic re-claim: only one concurrent delivery can flip the row.
    const prev = await q(
      `WITH prev AS (
         SELECT id, processing_status FROM webhook_events
         WHERE provider=$1 AND provider_event_id=$2
       )
       UPDATE webhook_events w
          SET processing_status='retrying',
              attempt_count = w.attempt_count + 1,
              last_attempt_at = now()
         FROM prev
        WHERE w.id = prev.id
          AND w.attempt_count < $3
          AND (
            w.processing_status = 'failed'
            OR (w.processing_status IN ('received','retrying')
                AND COALESCE(w.last_attempt_at, w.received_at) < now() - ($4::int * interval '1 second'))
          )
       RETURNING w.attempt_count, w.payload_hash, prev.processing_status AS previous_status`,
      [args.provider, args.eventId, max, stale],
    );
    if (prev.rows.length > 0) {
      const r = prev.rows[0]!;
      const mismatch = String(r.payload_hash ?? "") !== args.payloadHash;
      c.reclaimed += 1;
      if (mismatch) c.payload_mismatch += 1;
      c.last_reclaimed_at = new Date().toISOString();
      console.info(
        JSON.stringify({
          pack: PACK,
          event: "webhook_reclaimed",
          provider: args.provider,
          provider_event_id: args.eventId,
          attempt: Number(r.attempt_count),
          previous_status: String(r.previous_status),
          payload_mismatch: mismatch,
        }),
      );
      return {
        kind: "reclaimed",
        attempt: Number(r.attempt_count),
        previous_status: String(r.previous_status),
        payload_mismatch: mismatch,
      };
    }

    const cur = await q(
      `SELECT processing_status, attempt_count,
              EXTRACT(EPOCH FROM (now() - COALESCE(last_attempt_at, received_at)))::int AS age_sec
         FROM webhook_events WHERE provider=$1 AND provider_event_id=$2`,
      [args.provider, args.eventId],
    );
    const row = cur.rows[0];
    if (!row) {
      // Conflict but no row visible: let Stripe retry rather than guess.
      c.db_unavailable_deferred += 1;
      c.last_deferred_at = new Date().toISOString();
      return { kind: "db_unavailable", error: "row_not_visible" };
    }
    const kind = classifyExisting(
      {
        processing_status: String(row.processing_status),
        attempt_count: Number(row.attempt_count ?? 1),
        age_sec: Number(row.age_sec ?? 0),
      },
      { staleSec: stale, maxAttempts: max },
    );
    if (kind === "duplicate") {
      c.duplicate_acked += 1;
      return { kind: "duplicate" };
    }
    if (kind === "parked") {
      c.parked_acked += 1;
      return { kind: "parked", attempt: Number(row.attempt_count ?? 0) };
    }
    c.in_flight_deferred += 1;
    c.last_deferred_at = new Date().toISOString();
    return { kind: "in_flight", attempt: Number(row.attempt_count ?? 1) };
  } catch (e) {
    c.db_unavailable_deferred += 1;
    c.last_deferred_at = new Date().toISOString();
    console.warn(
      JSON.stringify({ pack: PACK, event: "webhook_claim_db_error", error: errMsg(e) }),
    );
    return { kind: "db_unavailable", error: errMsg(e) };
  }
}

export async function markProcessed(
  q: QueryFn,
  args: { provider: string; eventId: string; claim: ClaimResult },
): Promise<void> {
  await q(
    `UPDATE webhook_events SET processed_at=now(), processing_status='processed', last_error=NULL
      WHERE provider=$1 AND provider_event_id=$2`,
    [args.provider, args.eventId],
  );
  if (args.claim.kind === "reclaimed") {
    const c = counters();
    c.reclaim_succeeded += 1;
    c.last_recovered_at = new Date().toISOString();
  }
}

export async function markFailed(
  q: QueryFn,
  args: { provider: string; eventId: string; claim: ClaimResult; error: unknown },
): Promise<void> {
  const c = counters();
  c.processing_failed += 1;
  if (args.claim.kind === "reclaimed") c.reclaim_failed += 1;
  try {
    await q(
      `UPDATE webhook_events SET processing_status='failed', last_error=$3
        WHERE provider=$1 AND provider_event_id=$2`,
      [args.provider, args.eventId, errMsg(args.error)],
    );
  } catch {
    // Row stays 'received'/'retrying'; it becomes re-claimable once stale.
  }
}

/** Read-only ops summary. Counts only — no event ids, payloads or error text. */
export async function webhookInboxSummary(q: QueryFn): Promise<Record<string, unknown>> {
  const c = counters();
  const stale = staleSec();
  const max = maxAttempts();
  let db: Record<string, unknown> = { available: false };
  try {
    const { rows } = await q(
      `SELECT
         COUNT(*)::int AS total_30d,
         COUNT(*) FILTER (WHERE processing_status='processed')::int AS processed,
         COUNT(*) FILTER (WHERE processing_status='processed' AND attempt_count > 1)::int AS recovered_after_retry,
         COUNT(*) FILTER (WHERE processing_status='failed' AND attempt_count < $2)::int AS failed_awaiting_retry,
         COUNT(*) FILTER (WHERE processing_status IN ('received','retrying')
                          AND COALESCE(last_attempt_at, received_at) < now() - ($1::int * interval '1 second'))::int AS stuck,
         COUNT(*) FILTER (WHERE processing_status <> 'processed' AND attempt_count >= $2)::int AS parked,
         COALESCE(MAX(EXTRACT(EPOCH FROM (now() - received_at)))
           FILTER (WHERE processing_status <> 'processed'), 0)::int AS oldest_unprocessed_age_sec,
         MAX(received_at) AS last_received_at
       FROM webhook_events
       WHERE provider='stripe' AND received_at > now() - interval '30 days'`,
      [stale, max],
    );
    const r = rows[0] ?? {};
    db = {
      available: true,
      window_days: 30,
      total: Number(r.total_30d ?? 0),
      processed: Number(r.processed ?? 0),
      recovered_after_retry: Number(r.recovered_after_retry ?? 0),
      failed_awaiting_retry: Number(r.failed_awaiting_retry ?? 0),
      stuck: Number(r.stuck ?? 0),
      parked: Number(r.parked ?? 0),
      oldest_unprocessed_age_sec: Number(r.oldest_unprocessed_age_sec ?? 0),
      last_received_at: r.last_received_at ? new Date(String(r.last_received_at)).toISOString() : null,
    };
  } catch {
    // DB briefly unavailable or migration not yet applied — still return counters.
  }
  const attention =
    db.available === true &&
    (Number(db.failed_awaiting_retry) > 0 || Number(db.stuck) > 0 || Number(db.parked) > 0);
  return {
    pack: PACK,
    enabled: inboxEnabled(),
    stale_sec: stale,
    max_attempts: max,
    needs_attention: attention,
    process: { ...c },
    db,
  };
}
