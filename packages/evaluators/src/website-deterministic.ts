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
  /** Optional extended signals (worker >= 1.1). Missing → rule reports not_evaluable. */
  loadMs?: number;
  linksChecked?: number;
  brokenLinks?: { url: string; status: number }[];
  imagesTotal?: number;
  imagesMissingAlt?: number;
  ogTitle?: string | null;
  ogImage?: string | null;
  hasViewportMeta?: boolean;
  hasFavicon?: boolean;
};

function notEval(req: CompiledRequirement, why: string): Finding {
  return {
    requirement_id: req.external_key,
    verdict: "not_evaluable",
    severity: "info",
    confidence: 1,
    reason: why,
    evidence_ids: [],
  };
}

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
      case "links_ok": {
        if (capture.brokenLinks === undefined) { findings.push(notEval(req, "Link check not captured")); break; }
        const broken = capture.brokenLinks;
        findings.push({
          requirement_id: req.external_key,
          verdict: broken.length === 0 ? "pass" : "fail",
          severity: req.severity,
          confidence: 0.95,
          reason:
            broken.length === 0
              ? `${capture.linksChecked ?? 0} links checked, none broken`
              : `${broken.length} broken link(s): ${broken.slice(0, 5).map((b) => `${b.url} (${b.status || "no response"})`).join(", ")}`,
          repair: broken.length === 0 ? undefined : "Fix or remove the broken links listed",
          evidence_ids: [],
        });
        break;
      }
      case "img_alt": {
        if (capture.imagesMissingAlt === undefined) { findings.push(notEval(req, "Image scan not captured")); break; }
        const n = capture.imagesMissingAlt;
        findings.push({
          requirement_id: req.external_key,
          verdict: n === 0 ? "pass" : "warning",
          severity: req.severity,
          confidence: 1,
          reason: n === 0 ? `All ${capture.imagesTotal ?? 0} images have alt attributes` : `${n} of ${capture.imagesTotal ?? n} images have no alt attribute`,
          repair: n === 0 ? undefined : "Add descriptive alt text (or alt=\"\" for decorative images)",
          evidence_ids: [],
        });
        break;
      }
      case "og_tags": {
        if (capture.ogTitle === undefined) { findings.push(notEval(req, "Social tags not captured")); break; }
        const ok = Boolean(capture.ogTitle) && Boolean(capture.ogImage);
        findings.push({
          requirement_id: req.external_key,
          verdict: ok ? "pass" : "warning",
          severity: req.severity,
          confidence: 1,
          reason: ok ? "og:title and og:image present" : `Missing ${[!capture.ogTitle && "og:title", !capture.ogImage && "og:image"].filter(Boolean).join(" and ")} — links shared on social/chat get a bare preview`,
          repair: ok ? undefined : "Add <meta property=\"og:title\"> and <meta property=\"og:image\">",
          evidence_ids: [],
        });
        break;
      }
      case "viewport_meta": {
        if (capture.hasViewportMeta === undefined) { findings.push(notEval(req, "Viewport meta not captured")); break; }
        findings.push({
          requirement_id: req.external_key,
          verdict: capture.hasViewportMeta ? "pass" : "fail",
          severity: req.severity,
          confidence: 1,
          reason: capture.hasViewportMeta ? "Mobile viewport meta tag present" : "No <meta name=\"viewport\"> — page will render zoomed-out on phones",
          repair: capture.hasViewportMeta ? undefined : "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
          evidence_ids: [],
        });
        break;
      }
      case "favicon": {
        if (capture.hasFavicon === undefined) { findings.push(notEval(req, "Favicon not captured")); break; }
        findings.push({
          requirement_id: req.external_key,
          verdict: capture.hasFavicon ? "pass" : "warning",
          severity: req.severity,
          confidence: 0.9,
          reason: capture.hasFavicon ? "Favicon found" : "No favicon found (link rel=icon or /favicon.ico)",
          repair: capture.hasFavicon ? undefined : "Add a favicon",
          evidence_ids: [],
        });
        break;
      }
      case "console_errors": {
        const n = capture.consoleErrors.length;
        findings.push({
          requirement_id: req.external_key,
          verdict: n === 0 ? "pass" : "warning",
          severity: n > 5 ? "medium" : req.severity,
          confidence: 1,
          reason: n === 0 ? "No JavaScript console errors on load" : `${n} console error(s), e.g. ${capture.consoleErrors[0]?.slice(0, 160)}`,
          repair: n === 0 ? undefined : "Open DevTools → Console and fix the errors listed",
          evidence_ids: [],
        });
        break;
      }
      case "load_time": {
        if (capture.loadMs === undefined) { findings.push(notEval(req, "Load time not captured")); break; }
        const s2 = capture.loadMs / 1000;
        findings.push({
          requirement_id: req.external_key,
          verdict: s2 <= 4 ? "pass" : "warning",
          severity: req.severity,
          confidence: 0.8,
          reason: `Page loaded (DOM ready) in ${s2.toFixed(1)}s from our test region`,
          repair: s2 <= 4 ? undefined : "Reduce page weight / blocking scripts; aim for under 4s",
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

  if (capture.consoleErrors.length > 5 && !requirements.some((r) => r.normalized_rule.kind === "console_errors")) {
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
