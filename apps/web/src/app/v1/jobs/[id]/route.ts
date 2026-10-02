import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  const { id } = await ctx.params;
  const { rows } = await query(
    `SELECT j.*, p.slug AS profile_slug, pv.version AS profile_version
     FROM jobs j
     JOIN profile_versions pv ON pv.id = j.profile_version_id
     JOIN profiles p ON p.id = pv.profile_id
     WHERE j.id=$1 AND j.tenant_id=$2`,
    [id, auth.tenantId],
  );
  if (!rows[0]) return jsonError("not_found", "Job not found", { status: 404 });
  const j = rows[0];
  const { rows: steps } = await query(
    `SELECT step_name, status, started_at, finished_at, error_code FROM job_steps WHERE job_id=$1 ORDER BY started_at ASC NULLS LAST`,
    [id],
  );
  return jsonOk({
    id: j.id,
    status: j.status,
    order_id: j.order_id,
    profile: { slug: j.profile_slug, version: j.profile_version },
    attempt_count: j.attempt_count,
    started_at: j.started_at,
    finished_at: j.finished_at,
    deadline_at: j.deadline_at,
    error_code: j.error_code,
    error_message: j.error_message,
    steps,
  });
}
