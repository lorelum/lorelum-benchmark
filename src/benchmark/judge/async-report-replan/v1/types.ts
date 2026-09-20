export const replanEvidenceSchemaVersion = "replan-evidence/v1" as const;
export const planSchemaVersion = "async-report-replan-evaluation-plan/v1" as const;
export const accountingSchemaVersion = "async-report-replan-judge-accounting/v1" as const;
export const providerId = "judge-agent/async-report-replan/v1" as const;

export type ReplanStage = "initial" | "post-constraint";
export type ExecutionHealth = "healthy" | "unhealthy";
export type AllowedTool = "read" | "ls" | "grep" | "edit" | "bash";
export type ToolStatus = "success" | "failure";
export type VerificationCategory = "test" | "typecheck";

export type PublicUserTurn = { stage: ReplanStage; text: string };

/** Private input accepted by the deterministic projection. Never passed to a Judge. */
export type RawReplanAttempt = {
  blind_case_id: string;
  execution_health: ExecutionHealth;
  public_user_turns: [PublicUserTurn, PublicUserTurn];
  events: unknown[];
  final_candidate_diff: string;
};

export type ReplanAssistantStage = {
  stage: ReplanStage;
  text: string;
  text_sha256: string;
};

export type ReplanToolAction = {
  order: number;
  stage: ReplanStage;
  tool: AllowedTool;
  target: string;
  status: ToolStatus;
  summary?: string;
  summary_sha256?: string;
};

export type VerificationSummary = {
  order: number;
  stage: ReplanStage;
  command_category: VerificationCategory;
  summary: string;
  summary_sha256: string;
};

export type ReplanEvidence = {
  schema_version: typeof replanEvidenceSchemaVersion;
  blind_case_id: string;
  execution_health: ExecutionHealth;
  public_user_turns: Array<PublicUserTurn & { text_sha256: string }>;
  assistant_stages: ReplanAssistantStage[];
  tool_actions: ReplanToolAction[];
  verification_summaries: VerificationSummary[];
  final_candidate_diff: string;
  final_candidate_diff_sha256: string;
  evidence_hash: string;
};

export type ProjectionResult =
  | { ok: true; evidence: ReplanEvidence }
  | { ok: false; state: "indeterminate"; reason: string; evidence_hash: string };

export type RubricDimension = {
  id: string;
  name: string;
  max_points: number;
  description: string;
};

export type ReplanRubric = {
  schema_version: "async-report-replan-rubric/v1";
  id: "async-report-replan-rubric";
  version: "v1";
  dimensions: RubricDimension[];
};

export type EvaluationPlan = {
  schema_version: typeof planSchemaVersion;
  id: "async-report-replan-judge";
  version: "v1";
  method: "llm-subjective";
  target: "post-constraint replan quality";
  evidence_schema: typeof replanEvidenceSchemaVersion;
  rubric: "async-report-replan-rubric/v1";
  calibration: "async-report-replan-judge-calibration/v1";
  blind_case_policy: "opaque blind_case_id; condition and timing remain outside #200";
  budget: {
    scoring_calls_per_attempt: 1;
    scoring_retries: 0;
    calibration_max_calls: 9;
    calibration_repetitions: 3;
  };
  claim_boundary: "diagnostic until calibration qualifies; no semantic, hard-gate, or timing conclusion";
};

export type CalibrationStatus = "qualified" | "diagnostic" | "not-run";
export type CalibrationMedians = Partial<Record<"reference" | "equivalent" | "anti-pattern", number>>;
export type CalibrationReport = {
  id: string;
  version: string;
  hash: string;
  status: CalibrationStatus;
  calls: number;
  medians: CalibrationMedians;
  attestation: string;
  reason?: string;
};
export type AccountingState = "observed" | "indeterminate" | "judge-unavailable" | "not-run";
export type UsageValue = number | "unavailable";

export type JudgeUsage = {
  input_tokens: UsageValue;
  output_tokens: UsageValue;
  total_tokens: UsageValue;
  cost_usd: UsageValue;
};

export type AsyncReportAccounting = {
  schema_version: typeof accountingSchemaVersion;
  accounting_version: 1;
  state: AccountingState;
  blind_case_id: string;
  plan: { id: string; version: string; hash: string };
  evidence: { schema_version: typeof replanEvidenceSchemaVersion; hash: string };
  rubric: { id: string; version: string; hash: string };
  prompt_hash: string;
  input_hash: string;
  provider: { id: string; version: string; model: string | null };
  calibration: { id: string; version: string; hash: string; status: CalibrationStatus };
  calls: { calibration: number; scoring: number };
  duration_ms: number;
  usage: JudgeUsage;
  failure_reason?: string;
};

export type JudgeCompletionWithUsage = (system: string, user: string) => Promise<{
  output: unknown;
  usage?: Partial<JudgeUsage>;
}>;
