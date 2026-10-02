import { z } from "zod";
import { FindingVerdict, ReleaseDecision, Severity } from "./enums.js";

export const FindingSchema = z.object({
  requirement_id: z.string(),
  external_key: z.string().optional(),
  verdict: FindingVerdict,
  severity: Severity,
  confidence: z.number().min(0).max(1).default(1),
  reason: z.string(),
  repair: z.string().optional(),
  evidence_ids: z.array(z.string()).default([]),
});

export const ReportSummarySchema = z.object({
  pass: z.number().int(),
  warning: z.number().int(),
  fail: z.number().int(),
  not_evaluable: z.number().int(),
  skipped: z.number().int().default(0),
});

export const TerminalReportSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  release_decision: ReleaseDecision,
  score: z.number().min(0).max(100),
  profile_version: z.string(),
  summary: ReportSummarySchema,
  findings: z.array(FindingSchema),
  artifact: z
    .object({
      report_url: z.string().optional(),
      expires_at: z.string().datetime().optional(),
    })
    .optional(),
  integrity: z.object({
    input_hash: z.string(),
    report_hash: z.string(),
    signature: z.string(),
  }),
  generated_at: z.string().datetime(),
});

export type TerminalReport = z.infer<typeof TerminalReportSchema>;
export type Finding = z.infer<typeof FindingSchema>;
