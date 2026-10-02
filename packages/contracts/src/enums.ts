import { z } from "zod";

export const OrderStatus = z.enum([
  "draft",
  "payment_pending",
  "paid",
  "credit_reserved",
  "consumed",
  "refunded",
  "expired",
  "disputed",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const JobStatus = z.enum([
  "created",
  "validating_input",
  "queued",
  "running",
  "awaiting_artifact",
  "completed",
  "completed_with_warnings",
  "failed_platform",
  "rejected_policy",
  "cancelled",
  "expired",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const FindingVerdict = z.enum([
  "pending",
  "pass",
  "fail",
  "warning",
  "not_evaluable",
  "skipped",
]);
export type FindingVerdict = z.infer<typeof FindingVerdict>;

export const ReleaseDecision = z.enum([
  "pass",
  "pass_with_warnings",
  "fail",
  "cannot_evaluate",
]);
export type ReleaseDecision = z.infer<typeof ReleaseDecision>;

export const Severity = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof Severity>;
