import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  claimWebhookEvent,
  classifyExisting,
  counters,
  markFailed,
  markProcessed,
  resetCountersForTest,
  staleSec,
  maxAttempts,
  inboxEnabled,
  webhookInboxSummary,
  type QueryFn,
} from "../src/lib/webhook-inbox";

type Step = { match: RegExp; rows?: Record<string, unknown>[]; throws?: Error };

/** Scripted fake: each SQL call must match the next expected step. */
function fakeQuery(steps: Step[]) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const q: QueryFn = async (text, params) => {
    calls.push({ text, params });
    const s = steps.shift();
    if (!s) throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    assert.match(text, s.match);
    if (s.throws) throw s.throws;
    return { rows: s.rows ?? [] };
  };
  return { q, calls, steps };
}

const ARGS = { provider: "stripe", eventId: "evt_1", payloadHash: "sha256:aa" };

beforeEach(() => {
  resetCountersForTest();
  delete process.env.WEBHOOK_INBOX;
  delete process.env.WEBHOOK_INBOX_STALE_SEC;
  delete process.env.WEBHOOK_INBOX_MAX_ATTEMPTS;
});

test("defaults: enabled, stale 120s, max 25 attempts; kill switch works", () => {
  assert.equal(inboxEnabled(), true);
  assert.equal(staleSec(), 120);
  assert.equal(maxAttempts(), 25);
  for (const v of ["0", "false", "off", "no"]) {
    process.env.WEBHOOK_INBOX = v;
    assert.equal(inboxEnabled(), false);
  }
  process.env.WEBHOOK_INBOX_STALE_SEC = "5";
  assert.equal(staleSec(), 30, "clamped to min 30");
  process.env.WEBHOOK_INBOX_MAX_ATTEMPTS = "abc";
  assert.equal(maxAttempts(), 25);
});

test("fresh event is claimed with ON CONFLICT insert", async () => {
  const f = fakeQuery([{ match: /INSERT INTO webhook_events[\s\S]*ON CONFLICT/, rows: [{ id: "x" }] }]);
  const r = await claimWebhookEvent(f.q, ARGS);
  assert.deepEqual(r, { kind: "fresh", attempt: 1 });
  assert.equal(counters().fresh, 1);
  assert.deepEqual(f.calls[0]!.params, ["stripe", "evt_1", "sha256:aa"]);
});

test("retry of a FAILED event is re-claimed (the old code acked it as duplicate)", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    {
      match: /UPDATE webhook_events w[\s\S]*processing_status='retrying'/,
      rows: [{ attempt_count: 2, payload_hash: "sha256:aa", previous_status: "failed" }],
    },
  ]);
  const r = await claimWebhookEvent(f.q, ARGS);
  assert.deepEqual(r, { kind: "reclaimed", attempt: 2, previous_status: "failed", payload_mismatch: false });
  assert.equal(counters().reclaimed, 1);
  assert.deepEqual(f.calls[1]!.params, ["stripe", "evt_1", 25, 120]);
});

test("payload hash mismatch on reclaim is counted", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    { match: /retrying/, rows: [{ attempt_count: 3, payload_hash: "sha256:bb", previous_status: "received" }] },
  ]);
  const r = await claimWebhookEvent(f.q, ARGS);
  assert.equal(r.kind, "reclaimed");
  assert.equal(counters().payload_mismatch, 1);
});

test("processed event → duplicate (cheap 200 no-op)", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    { match: /retrying/, rows: [] },
    { match: /SELECT processing_status/, rows: [{ processing_status: "processed", attempt_count: 1, age_sec: 9 }] },
  ]);
  assert.deepEqual(await claimWebhookEvent(f.q, ARGS), { kind: "duplicate" });
  assert.equal(counters().duplicate_acked, 1);
});

test("event still being processed → in_flight (409 retryable)", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    { match: /retrying/, rows: [] },
    { match: /SELECT processing_status/, rows: [{ processing_status: "received", attempt_count: 1, age_sec: 3 }] },
  ]);
  assert.deepEqual(await claimWebhookEvent(f.q, ARGS), { kind: "in_flight", attempt: 1 });
  assert.equal(counters().in_flight_deferred, 1);
});

test("attempt cap reached → parked (acked, visible in summary)", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    { match: /retrying/, rows: [] },
    { match: /SELECT processing_status/, rows: [{ processing_status: "failed", attempt_count: 25, age_sec: 3 }] },
  ]);
  assert.deepEqual(await claimWebhookEvent(f.q, ARGS), { kind: "parked", attempt: 25 });
  assert.equal(counters().parked_acked, 1);
});

test("DB error while claiming → db_unavailable (503), never a silent duplicate", async () => {
  const f = fakeQuery([{ match: /ON CONFLICT/, throws: new Error("connect ECONNREFUSED") }]);
  const r = await claimWebhookEvent(f.q, ARGS);
  assert.equal(r.kind, "db_unavailable");
  assert.equal(counters().db_unavailable_deferred, 1);
});

test("conflict but row not visible → db_unavailable (let Stripe retry)", async () => {
  const f = fakeQuery([
    { match: /ON CONFLICT/, rows: [] },
    { match: /retrying/, rows: [] },
    { match: /SELECT processing_status/, rows: [] },
  ]);
  assert.equal((await claimWebhookEvent(f.q, ARGS)).kind, "db_unavailable");
});

test("classifyExisting matrix", () => {
  const o = { staleSec: 120, maxAttempts: 5 };
  assert.equal(classifyExisting({ processing_status: "processed", attempt_count: 9, age_sec: 0 }, o), "duplicate");
  assert.equal(classifyExisting({ processing_status: "received", attempt_count: 1, age_sec: 10 }, o), "in_flight");
  assert.equal(classifyExisting({ processing_status: "retrying", attempt_count: 2, age_sec: 10 }, o), "in_flight");
  assert.equal(classifyExisting({ processing_status: "received", attempt_count: 5, age_sec: 500 }, o), "parked");
  assert.equal(classifyExisting({ processing_status: "failed", attempt_count: 5, age_sec: 1 }, o), "parked");
  assert.equal(classifyExisting({ processing_status: "failed", attempt_count: 2, age_sec: 1 }, o), "in_flight");
  assert.equal(classifyExisting({ processing_status: "weird_legacy", attempt_count: 1, age_sec: 1 }, o), "duplicate");
});

test("markProcessed / markFailed update the row and recovery counters", async () => {
  const ok = fakeQuery([{ match: /processing_status='processed'/ }]);
  await markProcessed(ok.q, { ...ARGS, claim: { kind: "reclaimed", attempt: 2, previous_status: "failed", payload_mismatch: false } });
  assert.equal(counters().reclaim_succeeded, 1);
  assert.ok(counters().last_recovered_at);

  const bad = fakeQuery([{ match: /processing_status='failed', last_error=\$3/ }]);
  await markFailed(bad.q, { ...ARGS, claim: { kind: "fresh", attempt: 1 }, error: new Error("x".repeat(1000)) });
  assert.equal(counters().processing_failed, 1);
  assert.equal(String(bad.calls[0]!.params![2]).length, 300, "error text truncated");

  // markFailed never throws even if the DB is down
  const down = fakeQuery([{ match: /failed/, throws: new Error("down") }]);
  await markFailed(down.q, { ...ARGS, claim: { kind: "reclaimed", attempt: 3, previous_status: "failed", payload_mismatch: false }, error: "e" });
  assert.equal(counters().reclaim_failed, 1);
});

test("summary: counts only, flags attention, survives DB errors", async () => {
  const f = fakeQuery([
    {
      match: /FROM webhook_events/,
      rows: [{ total_30d: 4, processed: 2, recovered_after_retry: 1, failed_awaiting_retry: 1, stuck: 0, parked: 0, oldest_unprocessed_age_sec: 77, last_received_at: "2026-10-08T13:00:00Z" }],
    },
  ]);
  const s = await webhookInboxSummary(f.q);
  assert.equal(s.pack, "webhook-inbox-v1");
  assert.equal(s.enabled, true);
  assert.equal(s.needs_attention, true);
  const db = s.db as Record<string, unknown>;
  assert.equal(db.failed_awaiting_retry, 1);
  assert.equal(db.recovered_after_retry, 1);
  assert.ok(!JSON.stringify(s).includes("evt_"), "no event ids exposed");

  const down = fakeQuery([{ match: /FROM webhook_events/, throws: new Error("no column attempt_count") }]);
  const s2 = await webhookInboxSummary(down.q);
  assert.deepEqual(s2.db, { available: false });
  assert.equal(s2.needs_attention, false);
});
