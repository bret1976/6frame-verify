import type { WebsiteAcceptanceInput } from "@6frame/contracts";

export type CompiledRequirement = {
  external_key: string;
  text: string;
  type: "deterministic" | "semantic" | "manual_input_required" | "not_evaluable";
  severity: "critical" | "high" | "medium" | "low" | "info";
  normalized_rule: Record<string, unknown>;
};

/**
 * Deterministic brief compiler — extracts structured checks from brand_rules
 * and required_paths without calling a model. Ambiguous free-text lines become
 * not_evaluable rather than silent passes.
 */
export function compileWebsiteBrief(input: WebsiteAcceptanceInput): CompiledRequirement[] {
  const reqs: CompiledRequirement[] = [];

  reqs.push({
    external_key: "avail-https",
    text: "Target URL must be reachable over HTTPS with a successful response",
    type: "deterministic",
    severity: "critical",
    normalized_rule: { kind: "http_ok", url: input.target_url },
  });

  for (const path of input.required_paths) {
    const key = `path-${path.replace(/[^a-zA-Z0-9]+/g, "-") || "root"}`;
    reqs.push({
      external_key: key,
      text: `Required path ${path} must return HTTP 2xx`,
      type: "deterministic",
      severity: "high",
      normalized_rule: { kind: "path_status", path },
    });
  }

  for (const [i, term] of (input.brand_rules.required_terms ?? []).entries()) {
    reqs.push({
      external_key: `term-req-${i}`,
      text: `Required term present: "${term}"`,
      type: "deterministic",
      severity: "high",
      normalized_rule: { kind: "text_present", term },
    });
  }

  for (const [i, term] of (input.brand_rules.forbidden_terms ?? []).entries()) {
    reqs.push({
      external_key: `term-forbid-${i}`,
      text: `Forbidden term absent: "${term}"`,
      type: "deterministic",
      severity: "high",
      normalized_rule: { kind: "text_absent", term },
    });
  }

  for (const [i, cta] of (input.brand_rules.required_ctas ?? []).entries()) {
    reqs.push({
      external_key: `cta-${i}`,
      text: `Required CTA present: "${cta}"`,
      type: "deterministic",
      severity: "medium",
      normalized_rule: { kind: "cta_present", cta },
    });
  }

  reqs.push({
    external_key: "seo-title",
    text: "Document has a non-empty <title>",
    type: "deterministic",
    severity: "medium",
    normalized_rule: { kind: "seo_title" },
  });

  reqs.push({
    external_key: "seo-meta-desc",
    text: "Document has a meta description",
    type: "deterministic",
    severity: "low",
    normalized_rule: { kind: "seo_meta_description" },
  });

  reqs.push({
    external_key: "seo-h1",
    text: "Document has exactly one H1",
    type: "deterministic",
    severity: "medium",
    normalized_rule: { kind: "seo_h1_count" },
  });

  reqs.push({
    external_key: "viewport-overflow",
    text: "No horizontal overflow on declared viewports",
    type: "deterministic",
    severity: "medium",
    normalized_rule: { kind: "no_h_overflow" },
  });

  // Free-text brief lines that look like requirements but aren't structured
  // become not_evaluable rather than guessed passes.
  const lines = input.brief
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 12 && /must|should|require|need/i.test(l));

  let ambiguous = 0;
  for (const line of lines.slice(0, 20)) {
    const alreadyCovered =
      /https|path|cta|title|h1|forbidden|required term/i.test(line) ||
      (input.brand_rules.required_terms ?? []).some((t) =>
        line.toLowerCase().includes(t.toLowerCase()),
      );
    if (alreadyCovered) continue;
    ambiguous += 1;
    reqs.push({
      external_key: `brief-ambiguous-${ambiguous}`,
      text: line.slice(0, 240),
      type: "not_evaluable",
      severity: "info",
      normalized_rule: {
        kind: "ambiguous_brief_line",
        reason: "Provide a structured brand_rules / required_paths entry for this requirement",
      },
    });
  }

  return reqs;
}
