import { authenticateBearer } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonOk, jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  const { id } = await ctx.params;
  const { rows } = await query(`SELECT * FROM jobs WHERE id=$1 AND tenant_id=$2`, [
    id,
    auth.tenantId,
  ]);
  const job = rows[0];
  if (!job) return jsonError("not_found", "Job not found", { status: 404 });
  if (!["created", "validating_input", "queued"].includes(job.status)) {
    return jsonError("not_cancellable", "Job already started", { status: 409 });
  }
  await query(`UPDATE jobs SET status='cancelled', finished_at=now() WHERE id=$1`, [id]);
  // Restore credit / mark order refundable path handled by billing reconciliation
  await query(
    `UPDATE orders SET status='paid' WHERE id=$1 AND status='consumed'`,
    [job.order_id],
  );
  await audit({
    tenant_id: auth.tenantId,
    actor_type: "api_client",
    actor_id: auth.clientId,
    action: "job.cancelled",
    object_type: "job",
    object_id: id,
  });
  return jsonOk({ id, status: "cancelled" });
}
