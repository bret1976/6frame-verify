import type { Finding, ReleaseDecision } from "@6frame/contracts";

export function scoreFindings(findings: Finding[]): {
  score: number;
  release_decision: ReleaseDecision;
  summary: {
    pass: number;
    warning: number;
    fail: number;
    not_evaluable: number;
    skipped: number;
  };
} {
  let score = 100;
  let criticalOrHighFail = false;
  const summary = { pass: 0, warning: 0, fail: 0, not_evaluable: 0, skipped: 0 };
  let requiredNotEval = 0;
  let requiredTotal = 0;

  for (const f of findings) {
    if (f.verdict === "pass") summary.pass += 1;
    else if (f.verdict === "warning") {
      summary.warning += 1;
      if (f.severity === "medium") score -= 5;
      else if (f.severity === "low" || f.severity === "info") score -= 1;
      else score -= 5;
    } else if (f.verdict === "fail") {
      summary.fail += 1;
      if (f.severity === "critical" || f.severity === "high") {
        criticalOrHighFail = true;
        score -= 20;
      } else if (f.severity === "medium") score -= 5;
      else score -= 1;
    } else if (f.verdict === "not_evaluable") {
      summary.not_evaluable += 1;
      requiredNotEval += 1;
      requiredTotal += 1;
    } else {
      summary.skipped += 1;
    }
    if (f.verdict !== "skipped" && f.verdict !== "not_evaluable") {
      requiredTotal += 1;
    }
  }

  score = Math.max(0, Math.min(100, score));

  if (requiredTotal > 0 && requiredNotEval / requiredTotal > 0.4) {
    return { score, release_decision: "cannot_evaluate", summary };
  }
  if (criticalOrHighFail || score < 75) {
    return { score, release_decision: "fail", summary };
  }
  if (score >= 90 && summary.not_evaluable === 0) {
    return { score, release_decision: "pass", summary };
  }
  if (score >= 90 && summary.not_evaluable > 0) {
    return { score, release_decision: "pass_with_warnings", summary };
  }
  if (score >= 75) {
    return { score, release_decision: "pass_with_warnings", summary };
  }
  return { score, release_decision: "fail", summary };
}

export function jobStatusForDecision(
  decision: ReleaseDecision,
): "completed" | "completed_with_warnings" | "failed_platform" {
  if (decision === "pass") return "completed";
  if (decision === "pass_with_warnings") return "completed_with_warnings";
  if (decision === "cannot_evaluate") return "completed_with_warnings";
  return "completed_with_warnings"; // fail is a completed evaluation, not platform failure
}
