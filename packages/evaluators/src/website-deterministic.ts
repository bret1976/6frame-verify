import type { Finding } from "@6frame/contracts";
import type { CompiledRequirement } from "./brief-compiler.js";

export type PageCapture = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  metaDescription: string | null;
  h1Count: number;
  bodyText: string;
  ctaTexts: string[];
  consoleErrors: string[];
  overflowX: boolean;
  screenshotPath?: string;
  pathStatuses: Record<string, number>;
};

export function evaluateDeterministic(
  requirements: CompiledRequirement[],
  capture: PageCapture,
): Finding[] {
  const findings: Finding[] = [];

  for (const req of requirements) {
    const rule = req.normalized_rule;
    const kind = String(rule.kind ?? "");

    if (req.type === "not_evaluable") {
      findings.push({
        requirement_id: req.external_key,
        external_key: req.external_key,
        verdict: "not_evaluable",
        severity: req.severity,
        confidence: 1,
        reason: String(rule.reason ?? "Requirement is not machine-evaluable as written"),
        repair: "Rewrite as structured brand_rules / required_paths / viewport rules",
        evidence_ids: [],
      });
      continue;
    }

    switch (kind) {
      case "http_ok": {
        const ok = capture.status >= 200 && capture.status < 400;
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "fail",
          severity: req.severity,
          confidence: 1,
          reason: ok
            ? `HTTP ${capture.status} at ${capture.finalUrl}`
            : `HTTP ${capture.status} at ${capture.finalUrl}`,
          repair: ok ? undefined : "Ensure the target URL returns a successful HTTPS response",
          evidence_ids: [],
        });
        break;
      }
      case "path_status": {
        const path = String(rule.path);
        const status = capture.pathStatuses[path];
        const ok = typeof status === "number" && status >= 200 && status < 400;
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "fail",
          severity: req.severity,
          confidence: 1,
          reason:
            status === undefined
              ? `Path ${path} was not fetched`
              : `Path ${path} returned HTTP ${status}`,
          repair: ok ? undefined : `Make ${path} publicly reachable with HTTP 2xx`,
          evidence_ids: [],
        });
        break;
      }
      case "text_present": {
        const term = String(rule.term);
        const ok = capture.bodyText.toLowerCase().includes(term.toLowerCase());
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "fail",
          severity: req.severity,
          confidence: 1,
          reason: ok ? `Found required term "${term}"` : `Missing required term "${term}"`,
          repair: ok ? undefined : `Add visible text containing "${term}"`,
          evidence_ids: [],
        });
        break;
      }
      case "text_absent": {
        const term = String(rule.term);
        const present = capture.bodyText.toLowerCase().includes(term.toLowerCase());
        findings.push({
          requirement_id: req.external_key,
          verdict: present ? "fail" : "pass",
          severity: req.severity,
          confidence: 1,
          reason: present
            ? `Forbidden term "${term}" appears on page`
            : `Forbidden term "${term}" not found`,
          repair: present ? `Remove "${term}" from visible copy` : undefined,
          evidence_ids: [],
        });
        break;
      }
      case "cta_present": {
        const cta = String(rule.cta);
        const ok = capture.ctaTexts.some((t) =>
          t.toLowerCase().includes(cta.toLowerCase()),
        ) || capture.bodyText.toLowerCase().includes(cta.toLowerCase());
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "fail",
          severity: req.severity,
          confidence: 0.9,
          reason: ok ? `CTA "${cta}" found` : `CTA "${cta}" not found in links/buttons`,
          repair: ok ? undefined : `Add a button or link labeled "${cta}"`,
          evidence_ids: [],
        });
        break;
      }
      case "seo_title": {
        const ok = Boolean(capture.title && capture.title.trim().length > 0);
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "fail",
          severity: req.severity,
          confidence: 1,
          reason: ok ? `Title: ${capture.title}` : "Missing <title>",
          repair: ok ? undefined : "Set a descriptive <title> element",
          evidence_ids: [],
        });
        break;
      }
      case "seo_meta_description": {
        const ok = Boolean(capture.metaDescription && capture.metaDescription.trim().length > 0);
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "warning",
          severity: req.severity,
          confidence: 1,
          reason: ok
            ? `Meta description present (${capture.metaDescription!.length} chars)`
            : "Missing meta description",
          repair: ok ? undefined : "Add <meta name=\"description\" content=\"...\">",
          evidence_ids: [],
        });
        break;
      }
      case "seo_h1_count": {
        const ok = capture.h1Count === 1;
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : capture.h1Count === 0 ? "fail" : "warning",
          severity: req.severity,
          confidence: 1,
          reason: `Found ${capture.h1Count} H1 element(s)`,
          repair: ok ? undefined : "Use exactly one H1 on the page",
          evidence_ids: [],
        });
        break;
      }
      case "no_h_overflow": {
        findings.push({
          requirement_id: req.external_key,
          verdict: capture.overflowX ? "warning" : "pass",
          severity: req.severity,
          confidence: 0.85,
          reason: capture.overflowX
            ? "Horizontal overflow detected on at least one viewport"
            : "No horizontal overflow detected",
          repair: capture.overflowX
            ? "Fix elements wider than the viewport (overflow-x)"
            : undefined,
          evidence_ids: [],
        });
        break;
      }
      default:
        findings.push({
          requirement_id: req.external_key,
          verdict: "not_evaluable",
          severity: "info",
          confidence: 1,
          reason: `Unknown deterministic rule kind: ${kind}`,
          evidence_ids: [],
        });
    }
  }

  if (capture.consoleErrors.length > 5) {
    findings.push({
      requirement_id: "console-errors",
      verdict: "warning",
      severity: "low",
      confidence: 1,
      reason: `${capture.consoleErrors.length} console errors recorded`,
      repair: "Resolve recurring console errors on load",
      evidence_ids: [],
    });
  }

  return findings;
}
