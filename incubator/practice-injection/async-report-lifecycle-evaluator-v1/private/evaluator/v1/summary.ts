import type { EvaluatorResult } from "./result";

export type JudgeHardGateSummary = {
  evaluator_version: "v1";
  overall_status: "pass" | "fail" | "indeterminate";
  check_ids: string[];
};

export function judgeHardGateSummary(result: EvaluatorResult): JudgeHardGateSummary {
  return {
    evaluator_version: result.evaluator_version,
    overall_status: result.status,
    check_ids: result.checks.map((check) => check.id),
  };
}
