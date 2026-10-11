import crypto from "node:crypto";
import { query } from "./db";

/** Salted hash so raw IPs / emails never land in rate_events. */
export function subjectHash(value: string): string {
  const salt = process.env.RATE_LIMIT_SALT || process.env.API_ENCRYPTION_KEY || "6fv-rate-salt";
  return crypto.createHmac("sha256", salt).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/** Best-effort client IP behind Railway's proxy. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export type Window = { seconds: number; max: number };
export type LimitResult = { ok: true } | { ok: false; retry_after_sec: number; window_sec: number; max: number };

/**
 * Sliding-window limiter on Postgres. Checks every window; records the hit only if all pass.
 * Not strictly atomic under extreme concurrency — good enough for abuse throttling.
 */
export async function rateLimit(bucket: string, subject: string, windows: Window[]): Promise<LimitResult> {
  for (const w of windows) {
    const { rows } = await query<{ c: number; oldest: string | null }>(
      `SELECT COUNT(*)::int AS c, MIN(created_at) AS oldest FROM rate_events
       WHERE bucket=$1 AND subject=$2 AND created_at > now() - make_interval(secs => $3)`,
      [bucket, subject, w.seconds],
    );
    const c = rows[0]?.c ?? 0;
    if (c >= w.max) {
      const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : Date.now();
      const retry = Math.max(1, Math.ceil((oldest + w.seconds * 1000 - Date.now()) / 1000));
      return { ok: false, retry_after_sec: retry, window_sec: w.seconds, max: w.max };
    }
  }
  await query(`INSERT INTO rate_events (bucket, subject) VALUES ($1,$2)`, [bucket, subject]);
  if (Math.random() < 0.02) {
    await query(`DELETE FROM rate_events WHERE created_at < now() - interval '3 days'`).catch(() => null);
  }
  return { ok: true };
}

/** Count without recording (for global caps checked alongside another limiter). */
export async function countRecent(bucket: string, subject: string, seconds: number): Promise<number> {
  const { rows } = await query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM rate_events WHERE bucket=$1 AND subject=$2 AND created_at > now() - make_interval(secs => $3)`,
    [bucket, subject, seconds],
  );
  return rows[0]?.c ?? 0;
}

export const HOUR = 3600;
export const DAY = 86400;
