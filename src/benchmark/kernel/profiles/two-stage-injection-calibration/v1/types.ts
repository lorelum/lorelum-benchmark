/**
 * two-stage-injection-calibration/v1 profile contract.
 *
 * The profile reuses the Practice three-condition model but stages agent
 * execution.  It intentionally does not extend injection-calibration/v2 in
 * place: stage prompts, immutable snapshots, and resumable sessions are new
 * identity-affecting inputs.
 */

export type TwoStageConditionId = "baseline" | "oracle-practice" | "irrelevant-practice";
export type DeliveryTemplate = "project-convention/v1";

export type PracticeReference = {
  path: string;
  injection_channel: "condition-scoped-private-runtime";
  sha256: string;
};

export type DeclaredCondition = {
  id: TwoStageConditionId;
  status: "declared";
  practice: PracticeReference | "none";
};

export type PracticeCardMetadata = {
  id: string;
  version: string;
  path: string;
  rendered_characters: number;
  target_path?: string;
};

export type PracticeMetadata = {
  delivery_template: DeliveryTemplate;
  length_metric: string;
  cards: PracticeCardMetadata[];
  comparison: {
    maximum_relative_difference: number;
    actual_relative_difference: number;
    independently_reviewed: boolean;
  };
};

export type StageBudget = {
  prompt_path: string;
  max_duration_minutes: number;
};

export type TwoStageExecution = {
  schema_version: "two-stage-execution/v1";
  session: {
    mode: "same-workspace-same-pi-session";
    transcript_materialization: "forbidden";
    resume_failure: "execution-unhealthy";
  };
  stage_1: StageBudget;
  stage_2: StageBudget;
  snapshot: {
    root: "app";
    exclude: string[];
    hash_algorithm: "sha256";
  };
  dependencies: {
    immutable_inputs: ["package.json", "bun.lock"];
  };
  saturation: {
    high_pass_rate: number;
    conclusion: "saturated/no-discriminability";
  };
};

export type TwoStageDecisionRule = {
  metric: "structure-pass-count";
  oracle_relation: "strictly-greater-than-each-control";
  controls: ["baseline", "irrelevant-practice"];
  directional_stability: "majority-of-paired-blocks";
  otherwise: "diagnostic-only";
};

export type TwoStageConditions = {
  schema_version: "two-stage-conditions/v1";
  shared_execution: {
    agent: { id: string; version: string };
    pi_version: string;
    model: { id: string };
    additional_shared_system_prompt: "none";
    additional_shared_system_prompt_sha256: string;
    tool_policy: string;
    tool_policy_sha256: string;
    workspace: "clean-copy-per-attempt";
    repetitions: number;
    budgets: {
      stage_1_max_duration_minutes: number;
      stage_2_max_duration_minutes: number;
      evaluator_time_counted: false;
    };
    judge: "none";
  };
  conditions: DeclaredCondition[];
  decision_rule: TwoStageDecisionRule;
};

export type ResolvedPractice = {
  id: string;
  version: string;
  sha256: string;
  delivery_template: DeliveryTemplate;
  target_path: string;
  rendered_characters: number;
};

export type ResolvedCondition = {
  condition_id: TwoStageConditionId;
  channel: "none" | "condition-scoped-private-runtime";
  practice?: ResolvedPractice;
};

export type PracticePayload = ResolvedCondition & {
  practice?: ResolvedPractice & { text: string };
};

export type RedactedTwoStageTrace = {
  condition_id: TwoStageConditionId;
  channel: "none" | "condition-scoped-private-runtime";
  profile_input_hash: string;
  practice_id?: string;
  practice_version?: string;
  practice_sha256?: string;
  delivery_template?: DeliveryTemplate;
  target_path?: string;
};

export type ResolvedTwoStageProfile = {
  conditions: Record<TwoStageConditionId, ResolvedCondition>;
  practice_metadata: PracticeMetadata;
  decision_rule: TwoStageDecisionRule;
  execution: TwoStageExecution;
  profile_input_hash: string;
};
