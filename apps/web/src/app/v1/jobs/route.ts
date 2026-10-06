import {
  JobCreateRequestSchema,
  WebsiteAcceptanceInputSchema,
  CreativeContinuityInputSchema,
  isProfileOffered,
} from "@6frame/contracts";
import { assertSafePublicHttpsUrl, compileWebsiteBrief } from "@6frame/evaluators";
import { authenticateBearer, requireScope } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { jsonOk, jsonError } from "@/lib/http";
import { loadIdempotentResponse, saveIdempotentResponse } from "@/lib/idempotency";
import { enqueueVerifyJob } from "@/lib/queue";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PAID_STATUSES = new Set(["paid", "credit_reserved"]);

export async function POST(req: Request) {
  const auth = await authenticateBearer(req.headers.get("authorization"));
  if (!auth) return jsonError("unauthorized", "Bearer API key required", { status: 401 });
  if (!requireScope(auth, "verify:write")) {
    return jsonError("forbidden", "Missing verify:write", { status: 403 });
  }
  const idem = req.headers.get("idempotency-key");
  if (!idem) return jsonError("idempotency_required", "Idempotency-Key required", { status: 400 });
  const cached = await loadIdempotentResponse(auth, idem, "POST", "/v1/jobs");
  if (cached) return jsonOk(cached.response_body, { status: cached.response_status });

  const body = await req.json().catch(() => null);
  const parsed = JobCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_input", "Job request failed validation", {
      status: 422,
      details: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  const { rows: orders } = await query(`SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`, [
    data.order_id,
    auth.tenantId,
  ]);
  const order = orders[0];
  if (!order) return jsonError("order_not_found", "Order not found", { status: 404 });

  // HARD RULE: refuse unpaid jobs — no mock unlock
  if (!PAID_STATUSES.has(order.status)) {
    return jsonError(
      "payment_required",
      `Order status is '${order.status}'. Jobs queue only when order is paid or credit_reserved. Success URL redirects are not payment proof.`,
      { status: 402, details: { order_id: order.id, order_status: order.status } },
    );
  }

  // One job per paid order (consumed after queue)
  const { rows: existing } = await query(`SELECT id, status FROM jobs WHERE order_id=$1`, [
    order.id,
  ]);
  if (existing[0]) {
    const response = { id: existing[0].id, status: existing[0].status, reused: true };
    await saveIdempotentResponse(auth, idem, "POST", "/v1/jobs", data, 200, response);
    return jsonOk(response);
  }

  if (!isProfileOffered(data.profile.slug)) {
    return jsonError(
      "profile_unavailable",
      `Profile ${data.profile.slug} is not currently offered`,
      { status: 422 },
    );
  }

  if (data.profile.slug === "website-acceptance") {
    const input = WebsiteAcceptanceInputSchema.parse(data.input);
    const safe = await assertSafePublicHttpsUrl(input.target_url);
    if (!safe.ok) {
      return jsonError("rejected_policy", safe.message, {
        status: 422,
        details: { code: safe.code },
      });
    }
  } else {
    CreativeContinuityInputSchema.parse(data.input);
  }

  const { rows: pv } = await query(
    `SELECT pv.id, pv.version, p.slug FROM profiles p
     JOIN profile_versions pv ON pv.id = p.current_published_version_id
     WHERE p.slug=$1`,
    [data.profile.slug],
  );
  if (!pv[0]) return jsonError("profile_unavailable", "Profile not found", { status: 404 });

  const inputHash = sha256(JSON.stringify(data.input));
  const deadline = new Date(Date.now() + 15 * 60 * 1000);

  const job = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
      [order.id, auth.tenantId],
    );
    const o = locked.rows[0];
    if (!o || !PAID_STATUSES.has(o.status)) {
      throw Object.assign(new Error("payment_required"), { code: "payment_required" });
    }
    const ins = await client.query(
      `INSERT INTO jobs (
         tenant_id, order_id, profile_version_id, input_manifest, input_hash,
         status, deadline_at, callback_url, callback_secret, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,'validating_input',$6,$7,$8,$9) RETURNING *`,
      [
        auth.tenantId,
        order.id,
        pv[0].id,
        JSON.stringify({ profile: data.profile, input: data.input }),
        inputHash,
        deadline.toISOString(),
        data.callback?.url ?? null,
        data.callback?.secret ?? null,
        idem,
      ],
    );
    const j = ins.rows[0];

    if (data.profile.slug === "website-acceptance") {
      const compiled = compileWebsiteBrief(WebsiteAcceptanceInputSchema.parse(data.input));
      for (const r of compiled) {
        await client.query(
          `INSERT INTO requirements (job_id, external_key, text, type, severity, normalized_rule)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [j.id, r.external_key, r.text, r.type, r.severity, JSON.stringify(r.normalized_rule)],
        );
      }
    }

    await client.query(`UPDATE jobs SET status='queued' WHERE id=$1`, [j.id]);
    await client.query(`UPDATE orders SET status='consumed' WHERE id=$1`, [order.id]);
    return j;
  }).catch((e: Error & { code?: string }) => {
    if (e.code === "payment_required" || e.message === "payment_required") return null;
    throw e;
  });

  if (!job) {
    return jsonError("payment_required", "Order is not paid", { status: 402 });
  }

  try {
    await enqueueVerifyJob(job.id);
  } catch (e) {
    await query(
      `UPDATE jobs SET status='failed_platform', error_code='queue_unavailable', error_message=$2 WHERE id=$1`,
      [job.id, e instanceof Error ? e.message : "queue error"],
    );
    return jsonError("queue_unavailable", "Paid job could not be queued", {
      status: 503,
      retryable: true,
      details: { job_id: job.id },
    });
  }

  const response = {
    id: job.id,
    status: "queued",
    order_id: order.id,
    profile: { slug: pv[0].slug, version: pv[0].version },
    input_hash: inputHash,
    deadline_at: deadline.toISOString(),
  };
  await saveIdempotentResponse(auth, idem, "POST", "/v1/jobs", data, 200, response);
  await audit({
    tenant_id: auth.tenantId,
    actor_type: "api_client",
    actor_id: auth.clientId,
    action: "job.queued",
    object_type: "job",
    object_id: job.id,
  });
  return jsonOk(response, { status: 201 });
}
