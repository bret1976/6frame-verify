import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { hmacSign } from "@/lib/crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  const { id } = await ctx.params;
  const { rows: jobs } = await query(`SELECT id, status FROM jobs WHERE id=$1 AND tenant_id=$2`, [
    id,
    auth.tenantId,
  ]);
  if (!jobs[0]) return jsonError("not_found", "Job not found", { status: 404 });
  const terminal = [
    "completed",
    "completed_with_warnings",
    "failed_platform",
    "rejected_policy",
    "cancelled",
    "expired",
  ];
  if (!terminal.includes(jobs[0].status)) {
    return jsonError("not_ready", "Report available only after terminal state", {
      status: 409,
      details: { status: jobs[0].status },
    });
  }
  const { rows } = await query(
    `SELECT * FROM reports WHERE job_id=$1 ORDER BY report_version DESC LIMIT 1`,
    [id],
  );
  if (!rows[0]) return jsonError("report_missing", "No report artifact", { status: 404 });
  const r = rows[0];
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const sig = hmacSign(
    env().API_ENCRYPTION_KEY || "dev-only-report-hmac",
    `${id}:${expiresAt}`,
  );
  const base = env().APP_BASE_URL;
  const reportUrl = `${base}/v1/jobs/${id}/report?download=1&exp=${encodeURIComponent(expiresAt)}&sig=${sig}`;
  return jsonOk({
    ...(r.artifact_json as object),
    artifact: { report_url: reportUrl, expires_at: expiresAt },
  });
}
