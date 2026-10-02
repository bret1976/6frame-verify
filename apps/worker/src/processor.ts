import {
  WebsiteAcceptanceInputSchema,
  CreativeContinuityInputSchema,
} from "@6frame/contracts";
import {
  compileWebsiteBrief,
  evaluateDeterministic,
  evaluateCreativeStub,
  scoreFindings,
  jobStatusForDecision,
} from "@6frame/evaluators";
import { query } from "./db.js";
import { captureWebsite } from "./browser.js";
import { sha256, signReport, hmacSign } from "./crypto.js";
import { storeEvidence } from "./storage.js";

async function step(
  jobId: string,
  name: string,
  status: string,
  extra?: { error_code?: string },
) {
  await query(
    `INSERT INTO job_steps (job_id, step_name, status, started_at, finished_at, worker_version, error_code)
     VALUES ($1,$2,$3,now(),now(),'worker@1.0.0',$4)`,
    [jobId, name, status, extra?.error_code ?? null],
  );
}

export async function processJob(jobId: string) {
  const { rows } = await query(
    `SELECT j.*, p.slug AS profile_slug, pv.version AS profile_version
     FROM jobs j
     JOIN profile_versions pv ON pv.id = j.profile_version_id
     JOIN profiles p ON p.id = pv.profile_id
     WHERE j.id=$1`,
    [jobId],
  );
  const job = rows[0];
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (!["queued", "running"].includes(job.status)) {
    console.log("[worker] skip non-queued", jobId, job.status);
    return;
  }

  await query(
    `UPDATE jobs SET status='running', started_at=now(), attempt_count=attempt_count+1 WHERE id=$1`,
    [jobId],
  );
  await step(jobId, "start", "running");

  try {
    const manifest = job.input_manifest as {
      profile: { slug: string; version: string };
      input: unknown;
    };

    if (manifest.profile.slug === "creative-continuity") {
      const input = CreativeContinuityInputSchema.parse(manifest.input);
      await step(jobId, "creative_stub", "running");
      const result = evaluateCreativeStub(input);
      await finalize(job, result.findings, result.score, result.release_decision, result.summary, []);
      return;
    }

    const input = WebsiteAcceptanceInputSchema.parse(manifest.input);
    await step(jobId, "ssrf_validate", "running");
    await step(jobId, "browser_capture", "running");
    const capture = await captureWebsite(jobId, input);
    await step(jobId, "browser_capture", "completed");

    const { rows: reqRows } = await query(
      `SELECT external_key, text, type, severity, normalized_rule FROM requirements WHERE job_id=$1`,
      [jobId],
    );
    const compiled =
      reqRows.length > 0
        ? reqRows.map((r) => ({
            external_key: r.external_key as string,
            text: r.text as string,
            type: r.type as "deterministic" | "semantic" | "manual_input_required" | "not_evaluable",
            severity: r.severity as "critical" | "high" | "medium" | "low" | "info",
            normalized_rule: r.normalized_rule as Record<string, unknown>,
          }))
        : compileWebsiteBrief(input);

    await step(jobId, "deterministic_eval", "running");
    const findings = evaluateDeterministic(compiled, capture);
    const scored = scoreFindings(findings);

    // Persist evidence rows
    const evidenceIds: string[] = [];
    for (const uri of capture.evidencePaths) {
      const buf = Buffer.from(uri); // hash of uri path marker; file already stored
      const { rows: ev } = await query(
        `INSERT INTO evidence_items (job_id, type, uri, content_hash, capture_metadata)
         VALUES ($1,'screenshot',$2,$3,$4) RETURNING id`,
        [
          jobId,
          uri,
          sha256(uri),
          JSON.stringify({ finalUrl: capture.finalUrl, status: capture.status }),
        ],
      );
      if (ev[0]) evidenceIds.push(ev[0].id);
    }

    // Attach first evidence id to findings for linking
    const firstEv = evidenceIds[0];
    if (firstEv) {
      for (const f of findings) {
        f.evidence_ids = [firstEv];
      }
    }

    await finalize(
      job,
      findings,
      scored.score,
      scored.release_decision,
      scored.summary,
      evidenceIds,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "worker error";
    const code = (e as { code?: string }).code || "worker_error";
    const policy = ["private_ip", "https_required", "blocked_host", "ssrf_redirect", "credentials_forbidden"].includes(
      code,
    );
    await query(
      `UPDATE jobs SET status=$2, finished_at=now(), error_code=$3, error_message=$4 WHERE id=$1`,
      [jobId, policy ? "rejected_policy" : "failed_platform", code, msg],
    );
    await step(jobId, "error", "failed", { error_code: code });
    // Platform failure: restore order to paid for retry/refund path
    if (!policy) {
      await query(
        `UPDATE orders SET status='paid' WHERE id=$1 AND status='consumed'`,
        [job.order_id],
      );
    }
    throw e;
  }
}

async function finalize(
  job: Record<string, unknown>,
  findings: import("@6frame/contracts").Finding[],
  score: number,
  release_decision: import("@6frame/contracts").ReleaseDecision,
  summary: {
    pass: number;
    warning: number;
    fail: number;
    not_evaluable: number;
    skipped: number;
  },
  evidenceIds: string[],
) {
  const jobId = String(job.id);
  for (const f of findings) {
    await query(
      `INSERT INTO findings (job_id, external_key, verdict, severity, confidence, rationale, repair, evidence_count, evaluator_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'1.0.0')`,
      [
        jobId,
        f.requirement_id,
        f.verdict,
        f.severity,
        f.confidence,
        f.reason,
        f.repair ?? null,
        f.evidence_ids?.length ?? 0,
      ],
    );
  }

  const status = jobStatusForDecision(release_decision);
  // Map fail decision to completed_with_warnings status machine — evaluation completed
  const jobStatus =
    release_decision === "fail" ? "completed_with_warnings" : status;

  const report = {
    job_id: jobId,
    status: jobStatus,
    release_decision,
    score,
    profile_version: `${job.profile_slug}@${job.profile_version}`,
    summary,
    findings,
    integrity: {
      input_hash: String(job.input_hash),
      report_hash: "",
      signature: "",
    },
    generated_at: new Date().toISOString(),
    evidence_count: evidenceIds.length,
  };
  const provisional = JSON.stringify({ ...report, integrity: undefined });
  const reportHash = sha256(provisional);
  report.integrity.report_hash = reportHash;
  const reportJson = JSON.stringify(report);
  report.integrity.signature = signReport(reportJson);
  const finalJson = JSON.stringify(report);

  await storeEvidence(jobId, "report.json", Buffer.from(finalJson));

  await query(
    `INSERT INTO reports (job_id, report_version, status, score, release_decision, artifact_json, signature, input_hash, report_hash)
     VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      jobId,
      jobStatus,
      score,
      release_decision,
      finalJson,
      report.integrity.signature,
      String(job.input_hash),
      reportHash,
    ],
  );

  await query(`UPDATE jobs SET status=$2, finished_at=now() WHERE id=$1`, [jobId, jobStatus]);
  await step(jobId, "report", "completed");

  if (job.callback_url && job.callback_secret) {
    const payload = JSON.stringify({
      event: `job.${jobStatus}`,
      job_id: jobId,
      release_decision,
    });
    const sig = hmacSign(String(job.callback_secret), payload);
    try {
      await fetch(String(job.callback_url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-6frame-signature": sig,
        },
        body: payload,
      });
    } catch {
      // buyer can poll
    }
  }
}
