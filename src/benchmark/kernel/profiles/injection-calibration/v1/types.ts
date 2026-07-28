/**
 * injection-calibration/v1 profile contract - Practice injection track.
 *
 * Defines the contract shape for Practice-injection candidates. This is a
 * pure type contract; the core does not parse or validate these fields.
 */

/** Condition identifiers for the Practice injection control model. */
export type InjectionConditionId =
  | "baseline"
  | "oracle-practice"
  | "irrelevant-practice"
  | "lorelum-retrieval";

/** Channel through which a Practice card is injected into a condition. */
export type InjectionChannel = "condition-scoped-private-runtime" | "none";

export type PracticeReference = {
  path: string;
  injection_channel: "condition-scoped-private-runtime";
  sha256: string;
};

export type DeclaredInjectionCondition = {
  id: "baseline" | "oracle-practice" | "irrelevant-practice";
  status: "declared";
  practice: PracticeReference | "none";
};

export type UnavailableRetrievalCondition = {
  id: "lorelum-retrieval";
  status: "unavailable";
  practice: "unavailable";
};

/** A declared condition in an injection-calibration candidate. */
export type InjectionCondition = DeclaredInjectionCondition | UnavailableRetrievalCondition;

/** Length-metric calibration for the irrelevant-practice control. */
export type IrrelevantPracticeCalibration = {
  length_metric: string;
  oracle_characters: number;
  irrelevant_characters: number;
  maximum_relative_difference: number;
  actual_relative_difference: number;
  independently_reviewed: boolean;
};

/** Declarative decision rule for a future execution stage. */
export type DecisionRule = {
  metric: "joint-pass-count";
  oracle_relation: "strictly-greater-than-each-control";
  controls: ["baseline", "irrelevant-practice"];
  otherwise: "diagnostic-only";
};

export type PracticeCardMetadata = {
  id: string;
  version: string;
  path: string;
  rendered_characters: number;
};

export type PracticeMetadata = {
  delivery_template: "practice-card/v1";
  length_metric: "utf8-rendered-characters";
  cards: PracticeCardMetadata[];
  comparison: {
    maximum_relative_difference: number;
    actual_relative_difference: number;
    independently_reviewed: boolean;
  };
};

/** The full injection-calibration/v1 profile declaration. */
export type InjectionCalibrationProfile = {
  conditions: InjectionCondition[];
  decision_rule: DecisionRule;
};

export type ResolvedPractice = {
  id: string;
  version: string;
  sha256: string;
  text: string;
};

export type PracticePayload = {
  condition_id: InjectionConditionId;
  channel: InjectionChannel;
  practice?: ResolvedPractice;
};

export type ResolvedInjectionCalibration = {
  conditions: Record<InjectionConditionId, PracticePayload>;
  calibration: IrrelevantPracticeCalibration;
  decision_rule: DecisionRule;
  profile_input_hash: string;
};

export type RedactedInjectionTrace = {
  condition_id: InjectionConditionId;
  channel: InjectionChannel;
  profile_input_hash: string;
  practice_id?: string;
  practice_version?: string;
  practice_sha256?: string;
};
