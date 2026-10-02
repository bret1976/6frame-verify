import type { CreativeContinuityInput, Finding } from "@6frame/contracts";
import { scoreFindings } from "./scoring.js";

/**
 * Phase 3 stub: creative continuity returns not_evaluable for all shots
 * until the media/vision evaluator ships. Never invents a pass.
 */
export function evaluateCreativeStub(input: CreativeContinuityInput): {
  findings: Finding[];
  score: number;
  release_decision: ReturnType<typeof scoreFindings>["release_decision"];
  summary: ReturnType<typeof scoreFindings>["summary"];
} {
  const findings: Finding[] = input.shots.map((shot, i) => ({
    requirement_id: `creative-shot-${shot.id || i}`,
    verdict: "not_evaluable" as const,
    severity: "info" as const,
    confidence: 1,
    reason:
      "Creative continuity evaluator is not active in V1 (Phase 3). Schema accepted; evaluation deferred.",
    repair: "Resubmit after creative-continuity@1.x media evaluator is published",
    evidence_ids: [],
  }));

  findings.push({
    requirement_id: "creative-bible",
    verdict: "not_evaluable",
    severity: "info",
    confidence: 1,
    reason: "Creative bible locks are stored but not scored until Phase 3",
    evidence_ids: [],
  });

  const scored = scoreFindings(findings);
  return { findings, ...scored };
}
