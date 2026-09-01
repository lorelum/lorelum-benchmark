import type { StructureEvaluationResult } from "./types";

const checkIds = ["stage-1-semantic", "stage-2-semantic", "stage-1-snapshot-integrity", "handler-stability", "transport-isolation", "policy-continuity", "ledger-continuity", "provider-extension-locality", "diff-classifiability"] as const;
const metricKeys = ["changed_production_files", "changed_declarations", "handler_changed_declarations", "policy_changed_declarations", "ledger_changed_declarations", "transport_changed_declarations", "deleted_stage_1_declarations", "replaced_stage_1_declarations", "normalized_changed_ast_nodes", "maximum_single_file_edit_share"] as const;

export function assertStructureResult(value: unknown): StructureEvaluationResult {
  const result = value as StructureEvaluationResult;
  const allowed = new Set(["schema_version", "execution_health", "checks", "metrics", "structure_pass"]);
  if (value && typeof value === "object" && Object.keys(value).some((key) => !allowed.has(key))) throw new Error("structure result must contain raw checks and metrics only, without derived score fields");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("structure result must be an object");
  if (result.schema_version !== "two-stage-structure-result/v1") throw new Error("unsupported structure result schema_version");
  if (result.execution_health !== "evaluated" && result.execution_health !== "execution-unhealthy") throw new Error("invalid execution_health");
  if (!Array.isArray(result.checks) || result.checks.length !== checkIds.length) throw new Error("structure result must contain exactly nine checks");
  const seen = new Set<string>();
  for (const check of result.checks) {
    if (!checkIds.includes(check.id as typeof checkIds[number])) throw new Error(`unknown structure check: ${String((check as { id?: unknown }).id)}`);
    if (seen.has(check.id)) throw new Error(`duplicate structure check: ${check.id}`);
    seen.add(check.id);
    if (check.state !== "pass" && check.state !== "fail" && check.state !== "indeterminate") throw new Error(`invalid state for ${check.id}`);
    if (typeof check.reason !== "string" || check.reason.length === 0) throw new Error(`missing reason for ${check.id}`);
  }
  if (!result.metrics || typeof result.metrics !== "object") throw new Error("structure metrics are required");
  for (const key of metricKeys) {
    const metric = result.metrics[key];
    if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0) throw new Error(`invalid metric: ${key}`);
  }
  if (Object.keys(result.metrics).length !== metricKeys.length) throw new Error("structure metrics must be raw and exhaustive");
  if (typeof result.structure_pass !== "boolean") throw new Error("structure_pass must be boolean");
  return result;
}

export function compareExpectedLabels(result: StructureEvaluationResult, expected: Partial<Record<typeof checkIds[number], string>>): { passed: boolean; mismatches: Array<{ id: string; expected: string; observed: string }> } {
  const labels = Object.fromEntries(result.checks.map((check) => [check.id, check.state]));
  const mismatches = Object.entries(expected).filter(([id, expectedState]) => labels[id] !== expectedState).map(([id, expectedState]) => ({ id, expected: expectedState!, observed: labels[id]! }));
  return { passed: mismatches.length === 0 && result.execution_health === "evaluated", mismatches };
}
