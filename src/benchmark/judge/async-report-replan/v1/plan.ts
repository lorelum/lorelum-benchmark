import { sha256Text } from "../../../fs";
import { canonicalJson } from "./canonical";
import type { EvaluationPlan } from "./types";

export const evaluationPlan: EvaluationPlan = Object.freeze({
  schema_version: "async-report-replan-evaluation-plan/v1",
  id: "async-report-replan-judge",
  version: "v1",
  method: "llm-subjective",
  target: "post-constraint replan quality",
  evidence_schema: "replan-evidence/v1",
  rubric: "async-report-replan-rubric/v1",
  calibration: "async-report-replan-judge-calibration/v1",
  blind_case_policy: "opaque blind_case_id; condition and timing remain outside #200",
  budget: { scoring_calls_per_attempt: 1, scoring_retries: 0, calibration_max_calls: 9, calibration_repetitions: 3 },
  claim_boundary: "diagnostic until calibration qualifies; no semantic, hard-gate, or timing conclusion",
});

export async function evaluationPlanHash(): Promise<string> {
  return sha256Text(canonicalJson(evaluationPlan));
}

export function assertEvaluationPlan(value: unknown): EvaluationPlan {
  if (canonicalJson(value) !== canonicalJson(evaluationPlan)) throw new Error("async-report evaluation plan is not the frozen v1 instance");
  return evaluationPlan;
}
