import { query } from "./db";
import { reportPageUrl } from "./links";

export const TERMINAL = ["completed", "completed_with_warnings", "failed_platform", "rejected_policy", "cancelled", "expired"];

export async function jobForTenant(jobId: string, tenantId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  const { rows } = await query(
    `SELECT id, status, public_token, error_code, error_message, created_at, started_at, finished_at, input_manifest
     FROM jobs WHERE id=$1 AND tenant_id=$2`,
    [jobId, tenantId],
  );
  const j = rows[0];
  if (!j) return null;
  return {
    id: j.id,
    status: j.status,
    terminal: TERMINAL.includes(j.status),
    target_url: j.input_manifest?.input?.target_url,
    report_page: j.public_token ? reportPageUrl(j.public_token) : null,
    error: j.error_code ? { code: j.error_code, message: j.error_message } : undefined,
    created_at: j.created_at,
    finished_at: j.finished_at,
  };
}

export async function reportForTenant(jobId: string, tenantId: string) {
  const job = await jobForTenant(jobId, tenantId);
  if (!job) return { job: null, report: null };
  const { rows } = await query(
    `SELECT artifact_json FROM reports WHERE job_id=$1 ORDER BY report_version DESC LIMIT 1`,
    [jobId],
  );
  return { job, report: rows[0]?.artifact_json ?? null };
}
