import { sha256Text } from "../../../fs";
import { canonicalJson, redactSensitiveText } from "./canonical";
import type { AsyncReportAccounting, AccountingState, CalibrationStatus, JudgeUsage, ReplanEvidence, UsageValue } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`async-report accounting ${label} contains unsupported fields`);
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
  calibration: { id: string; version: string; hash: string; status: CalibrationStatus; duration_ms: number; usage: JudgeUsage };
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
    plan: { id: input.plan.id, version: input.plan.version, hash: input.plan.hash },
    evidence: { schema_version: input.evidence.schema_version, hash: input.evidence.hash },
    rubric: { id: input.rubric.id, version: input.rubric.version, hash: input.rubric.hash },
    prompt_hash: input.prompt_hash,
    input_hash: input.input_hash,
    provider: { id: input.provider.id, version: input.provider.version, model: input.provider.model },
    calibration: { id: input.calibration.id, version: input.calibration.version, hash: input.calibration.hash, status: input.calibration.status, duration_ms: Math.max(0, Math.round(input.calibration.duration_ms)), usage: normalizeUsage(input.calibration.usage) },
    calls: { calibration: input.calls.calibration, scoring: input.calls.scoring },
    duration_ms: Math.max(0, Math.round(input.duration_ms)),
    usage: normalizeUsage(input.usage),
    ...(input.failure_reason ? { failure_reason: redactSensitiveText(input.failure_reason).slice(0, 240) } : {}),
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
  if (!record(value.plan)) throw new Error("async-report accounting plan is invalid");
  exactKeys(value.plan, ["id", "version", "hash"], "plan");
  if (typeof value.plan.id !== "string" || !value.plan.id || typeof value.plan.version !== "string" || !value.plan.version || typeof value.plan.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.plan.hash)) throw new Error("async-report accounting plan is invalid");
  if (!record(value.evidence)) throw new Error("async-report accounting evidence is invalid");
  exactKeys(value.evidence, ["schema_version", "hash"], "evidence");
  if (value.evidence.schema_version !== "replan-evidence/v1" || typeof value.evidence.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.evidence.hash)) throw new Error("async-report accounting evidence is invalid");
  if (!record(value.rubric)) throw new Error("async-report accounting rubric is invalid");
  exactKeys(value.rubric, ["id", "version", "hash"], "rubric");
  if (typeof value.rubric.id !== "string" || !value.rubric.id || typeof value.rubric.version !== "string" || !value.rubric.version || typeof value.rubric.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.rubric.hash)) throw new Error("async-report accounting rubric is invalid");
  if (!record(value.provider)) throw new Error("async-report accounting provider is invalid");
  exactKeys(value.provider, ["id", "version", "model"], "provider");
  if (typeof value.provider.id !== "string" || !value.provider.id || typeof value.provider.version !== "string" || !value.provider.version || (value.provider.model !== null && typeof value.provider.model !== "string")) throw new Error("async-report accounting provider is invalid");
  if (!record(value.calibration)) throw new Error("async-report accounting calibration is invalid");
  exactKeys(value.calibration, ["id", "version", "hash", "status", "duration_ms", "usage"], "calibration");
  if (typeof value.calibration.id !== "string" || !value.calibration.id || typeof value.calibration.version !== "string" || !value.calibration.version || typeof value.calibration.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.calibration.hash) || !["qualified", "diagnostic", "not-run"].includes(String(value.calibration.status))) throw new Error("async-report accounting calibration is invalid");
  if (!Number.isInteger(value.calibration.duration_ms) || value.calibration.duration_ms < 0 || !record(value.calibration.usage)) throw new Error("async-report accounting calibration duration or usage is invalid");
  exactKeys(value.calibration.usage, ["input_tokens", "output_tokens", "total_tokens", "cost_usd"], "calibration.usage");
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "cost_usd"] as const) {
    const item = value.calibration.usage[key];
    if (item !== "unavailable" && (typeof item !== "number" || !Number.isFinite(item) || item < 0 || (key !== "cost_usd" && !Number.isInteger(item)))) throw new Error(`async-report accounting calibration.usage.${key} is invalid`);
  }
  if (!record(value.calls)) throw new Error("async-report accounting call counts are invalid");
  exactKeys(value.calls, ["calibration", "scoring"], "calls");
  if (!Number.isInteger(value.calls.calibration) || value.calls.calibration < 0 || value.calls.calibration > 9 || !Number.isInteger(value.calls.scoring) || value.calls.scoring < 0 || value.calls.scoring > 1) throw new Error("async-report accounting call counts are invalid");
  if (!Number.isInteger(value.duration_ms) || value.duration_ms < 0 || !record(value.usage)) throw new Error("async-report accounting duration or usage is invalid");
  exactKeys(value.usage, ["input_tokens", "output_tokens", "total_tokens", "cost_usd"], "usage");
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "cost_usd"] as const) {
    const item = value.usage[key];
    if (item !== "unavailable" && (typeof item !== "number" || !Number.isFinite(item) || item < 0 || (key !== "cost_usd" && !Number.isInteger(item)))) throw new Error(`async-report accounting usage.${key} is invalid`);
  }
  if (value.state !== "observed" && (typeof value.failure_reason !== "string" || !value.failure_reason)) throw new Error("non-observed async-report accounting requires a failure reason");
  if (value.failure_reason !== undefined && (typeof value.failure_reason !== "string" || !value.failure_reason || redactSensitiveText(value.failure_reason) !== value.failure_reason)) throw new Error("async-report accounting failure reason is unsafe");
}

export function accountingStateFromJudgeState(state: string): AccountingState {
  if (state === "observed" || state === "indeterminate" || state === "judge-unavailable" || state === "not-run") return state;
  return "judge-unavailable";
}

export function evidenceRef(evidence: ReplanEvidence | { evidence_hash: string }): { schema_version: "replan-evidence/v1"; hash: string } {
  return { schema_version: "replan-evidence/v1", hash: evidence.evidence_hash };
}
