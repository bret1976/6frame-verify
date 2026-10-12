import { query } from "./db";

export type SampleRow = { token: string; url: string; score: number; decision: string; generated_at: string; pass: number; warning: number; fail: number };

export async function listSamples(limit = 6): Promise<SampleRow[]> {
  try {
    const { rows } = await query(
      `SELECT j.public_token AS token, j.input_manifest->'input'->>'target_url' AS url, r.score, r.release_decision AS decision,
              r.generated_at, r.artifact_json->'summary' AS summary
       FROM reports r JOIN jobs j ON j.id = r.job_id
       WHERE r.is_sample = true AND j.public_token IS NOT NULL
       ORDER BY r.generated_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      token: r.token,
      url: r.url,
      score: r.score,
      decision: effectiveDecision(r.decision, r.summary?.fail),
      generated_at: r.generated_at,
      pass: r.summary?.pass ?? 0,
      warning: r.summary?.warning ?? 0,
      fail: r.summary?.fail ?? 0,
    }));
  } catch {
    return [];
  }
}

export const DECISION_LABEL: Record<string, string> = {
  pass: "Ready to launch",
  pass_with_warnings: "Launchable, with fixes",
  fail: "Fix before launch",
  cannot_evaluate: "Could not evaluate",
};
/** Normalise legacy reports stored as "pass" despite failed checks. */
export function effectiveDecision(d: string, fail?: number | null) {
  return d === "pass" && (fail ?? 0) > 0 ? "pass_with_warnings" : d;
}
export function decisionClass(d: string) {
  return d === "pass" ? "ok" : d === "pass_with_warnings" ? "warn" : d === "fail" ? "bad" : "muted";
}
