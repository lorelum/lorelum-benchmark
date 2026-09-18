export const EVALUATOR_SCHEMA_VERSION = "async-report-deterministic-evaluator/v1" as const;
export const EVALUATOR_VERSION = "v1" as const;
export const CANDIDATE_ID = "async-report-lifecycle-v1" as const;
export const CANDIDATE_SOURCE_COMMIT = "74962ee0c98f7775b0eb626f7b49b878035d8778" as const;
export const CANDIDATE_SNAPSHOT_ID = "ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2" as const;

export const CHECK_IDS = [
  "lifecycle-queued-processing-completed",
  "lifecycle-failure-and-retry",
  "progress-persistence",
  "pause-at-checkpoint",
  "resume-preserves-progress",
  "v1-v2-overlap-preserves-safe-state",
  "rollback-preserves-extension-fields",
  "unsafe-state-preserved-and-rejected",
  "concurrent-workers-serialize-progress",
] as const;

export type CheckId = typeof CHECK_IDS[number];
export type CheckStatus = "pass" | "fail" | "indeterminate";

export type EvaluatorCheckResult = {
  id: CheckId;
  status: CheckStatus;
  reason?: string;
};

export type EvaluatorResult = {
  schema_version: typeof EVALUATOR_SCHEMA_VERSION;
  evaluator_version: typeof EVALUATOR_VERSION;
  candidate_snapshot_id: typeof CANDIDATE_SNAPSHOT_ID;
  status: CheckStatus;
  checks: EvaluatorCheckResult[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reasonIsValid(reason: unknown): reason is string {
  return typeof reason === "string" && /^[a-z0-9][a-z0-9-]*$/.test(reason);
}

export function overallStatus(checks: EvaluatorCheckResult[]): CheckStatus {
  if (checks.some((check) => check.status === "indeterminate")) return "indeterminate";
  if (checks.some((check) => check.status === "fail")) return "fail";
  return "pass";
}

export function buildEvaluatorResult(checks: EvaluatorCheckResult[]): EvaluatorResult {
  const byId = new Map<CheckId, EvaluatorCheckResult>();
  for (const check of checks) {
    if (byId.has(check.id)) throw new Error(`duplicate evaluator check: ${check.id}`);
    byId.set(check.id, check);
  }
  const ordered = CHECK_IDS.map((id) => byId.get(id) ?? { id, status: "indeterminate" as const, reason: "check-missing" });
  const result: EvaluatorResult = {
    schema_version: EVALUATOR_SCHEMA_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    candidate_snapshot_id: CANDIDATE_SNAPSHOT_ID,
    status: overallStatus(ordered),
    checks: ordered,
  };
  assertEvaluatorResult(result);
  return result;
}

export function indeterminateResult(reason: string): EvaluatorResult {
  return buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "indeterminate", reason })));
}

export function assertEvaluatorResult(value: unknown): EvaluatorResult {
  if (!isRecord(value)) throw new Error("evaluator result must be an object");
  const keys = Object.keys(value).sort();
  const expected = ["candidate_snapshot_id", "checks", "evaluator_version", "schema_version", "status"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error("evaluator result has unexpected fields");
  if (value.schema_version !== EVALUATOR_SCHEMA_VERSION || value.evaluator_version !== EVALUATOR_VERSION || value.candidate_snapshot_id !== CANDIDATE_SNAPSHOT_ID) {
    throw new Error("evaluator result identity is invalid");
  }
  if (value.status !== "pass" && value.status !== "fail" && value.status !== "indeterminate") throw new Error("evaluator result status is invalid");
  if (!Array.isArray(value.checks) || value.checks.length !== CHECK_IDS.length) throw new Error("evaluator result checks are incomplete");
  const checks: EvaluatorCheckResult[] = value.checks.map((check, index) => {
    if (!isRecord(check)) throw new Error("evaluator check must be an object");
    const checkKeys = Object.keys(check).sort();
    if (!checkKeys.includes("id") || !checkKeys.includes("status") || checkKeys.some((key) => !["id", "status", "reason"].includes(key))) {
      throw new Error("evaluator check has unexpected fields");
    }
    const id = CHECK_IDS[index];
    if (check.id !== id) throw new Error("evaluator check order is invalid");
    if (check.status !== "pass" && check.status !== "fail" && check.status !== "indeterminate") throw new Error("evaluator check status is invalid");
    if (check.reason !== undefined && !reasonIsValid(check.reason)) throw new Error("evaluator check reason is invalid");
    if (check.status === "pass" && check.reason !== undefined) throw new Error("passing evaluator check must not contain a reason");
    if (check.status !== "pass" && check.reason === undefined) throw new Error("failed evaluator check must contain a reason");
    return { id, status: check.status, ...(check.reason === undefined ? {} : { reason: check.reason }) };
  });
  if (value.status !== overallStatus(checks)) throw new Error("evaluator overall status is inconsistent");
  return {
    schema_version: EVALUATOR_SCHEMA_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    candidate_snapshot_id: CANDIDATE_SNAPSHOT_ID,
    status: value.status,
    checks,
  };
}

export function exitCodeForStatus(status: CheckStatus): 0 | 1 | 2 {
  return status === "pass" ? 0 : status === "fail" ? 1 : 2;
}
