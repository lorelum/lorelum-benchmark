import { sha256Text } from "../../../fs";
import { canonicalJson, redactedProjectionReason } from "./canonical";
import type { AsyncReportAccounting, AccountingState, CalibrationStatus, JudgeUsage, ReplanEvidence, UsageValue } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hash(value: unknown): Promise<string> {
  return sha256Text(canonicalJson(value));
}

function usageValue(value: unknown): UsageValue {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : "unavailable";
}

export function normalizeUsage(usage?: Partial<JudgeUsage>): JudgeUsage {
  return {
    input_tokens: usageValue(usage?.input_tokens),
    output_tokens: usageValue(usage?.output_tokens),
    total_tokens: usageValue(usage?.total_tokens),
    cost_usd: usageValue(usage?.cost_usd),
  };
}

export async function accountingIdentity(value: unknown): Promise<string> {
  return hash(value);
}

export function buildAccounting(input: {
  state: AccountingState;
  blind_case_id: string;
  plan: { id: string; version: string; hash: string };
  evidence: { schema_version: "replan-evidence/v1"; hash: string };
  rubric: { id: string; version: string; hash: string };
  prompt_hash: string;
  input_hash: string;
  provider: { id: string; version: string; model: string | null };
  calibration: { id: string; version: string; hash: string; status: CalibrationStatus };
  calls: { calibration: number; scoring: number };
  duration_ms: number;
  usage?: Partial<JudgeUsage>;
  failure_reason?: string;
}): AsyncReportAccounting {
  const result: AsyncReportAccounting = {
    schema_version: "async-report-replan-judge-accounting/v1",
    accounting_version: 1,
    state: input.state,
    blind_case_id: input.blind_case_id,
    plan: input.plan,
    evidence: input.evidence,
    rubric: input.rubric,
    prompt_hash: input.prompt_hash,
    input_hash: input.input_hash,
    provider: input.provider,
    calibration: input.calibration,
    calls: input.calls,
    duration_ms: Math.max(0, Math.round(input.duration_ms)),
    usage: normalizeUsage(input.usage),
    ...(input.failure_reason ? { failure_reason: redactedProjectionReason(input.failure_reason) } : {}),
  };
  assertAsyncReportAccounting(result);
  return result;
}

export function assertAsyncReportAccounting(value: unknown): asserts value is AsyncReportAccounting {
  if (!record(value) || value.schema_version !== "async-report-replan-judge-accounting/v1" || value.accounting_version !== 1) throw new Error("async-report accounting identity is invalid");
  const allowed = ["schema_version", "accounting_version", "state", "blind_case_id", "plan", "evidence", "rubric", "prompt_hash", "input_hash", "provider", "calibration", "calls", "duration_ms", "usage", "failure_reason"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("async-report accounting contains unsupported fields");
  if (!["observed", "indeterminate", "judge-unavailable", "not-run"].includes(String(value.state))) throw new Error("async-report accounting state is invalid");
  if (typeof value.blind_case_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.blind_case_id)) throw new Error("async-report accounting blind case is invalid");
  for (const key of ["prompt_hash", "input_hash"] as const) if (typeof value[key] !== "string" || !/^[a-f0-9]{64}$/.test(value[key])) throw new Error(`async-report accounting ${key} is invalid`);
  if (!record(value.plan) || typeof value.plan.id !== "string" || typeof value.plan.version !== "string" || typeof value.plan.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.plan.hash)) throw new Error("async-report accounting plan is invalid");
  if (!record(value.evidence) || value.evidence.schema_version !== "replan-evidence/v1" || typeof value.evidence.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.evidence.hash)) throw new Error("async-report accounting evidence is invalid");
  if (!record(value.rubric) || typeof value.rubric.id !== "string" || typeof value.rubric.version !== "string" || typeof value.rubric.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.rubric.hash)) throw new Error("async-report accounting rubric is invalid");
  if (!record(value.provider) || typeof value.provider.id !== "string" || typeof value.provider.version !== "string" || (value.provider.model !== null && typeof value.provider.model !== "string")) throw new Error("async-report accounting provider is invalid");
  if (!record(value.calibration) || typeof value.calibration.id !== "string" || typeof value.calibration.version !== "string" || typeof value.calibration.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.calibration.hash) || !["qualified", "diagnostic", "not-run"].includes(String(value.calibration.status))) throw new Error("async-report accounting calibration is invalid");
  if (!record(value.calls) || !Number.isInteger(value.calls.calibration) || value.calls.calibration < 0 || value.calls.calibration > 9 || !Number.isInteger(value.calls.scoring) || value.calls.scoring < 0 || value.calls.scoring > 1) throw new Error("async-report accounting call counts are invalid");
  if (!Number.isInteger(value.duration_ms) || value.duration_ms < 0 || !record(value.usage)) throw new Error("async-report accounting duration or usage is invalid");
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "cost_usd"] as const) {
    const item = value.usage[key];
    if (item !== "unavailable" && (typeof item !== "number" || !Number.isFinite(item) || item < 0 || (key !== "cost_usd" && !Number.isInteger(item)))) throw new Error(`async-report accounting usage.${key} is invalid`);
  }
  if (value.state !== "observed" && (typeof value.failure_reason !== "string" || !value.failure_reason)) throw new Error("non-observed async-report accounting requires a failure reason");
  if (value.failure_reason !== undefined && (typeof value.failure_reason !== "string" || !value.failure_reason)) throw new Error("async-report accounting failure reason is invalid");
}

export function accountingStateFromJudgeState(state: string): AccountingState {
  if (state === "observed" || state === "indeterminate" || state === "judge-unavailable" || state === "not-run") return state;
  return "judge-unavailable";
}

export function evidenceRef(evidence: ReplanEvidence | { evidence_hash: string }): { schema_version: "replan-evidence/v1"; hash: string } {
  return { schema_version: "replan-evidence/v1", hash: evidence.evidence_hash };
}
