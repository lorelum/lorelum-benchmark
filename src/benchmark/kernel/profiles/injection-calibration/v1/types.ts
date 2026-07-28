/**
 * injection-calibration/v1 profile contract - Practice injection track.
 *
 * Defines the contract shape for Practice-injection candidates. This is a
 * pure type contract; the core does not parse or validate these fields.
 */

/** Condition identifiers for the three-condition control model. */
export type InjectionConditionId =
  | "baseline"
  | "oracle-practice"
  | "irrelevant-practice"
  | "lorelum-retrieval";

/** Channel through which a Practice card is injected into a condition. */
export type InjectionChannel = "condition-scoped-private-runtime" | "none";

/** A declared condition in an injection-calibration candidate. */
export type InjectionCondition = {
  id: InjectionConditionId;
  status: "declared" | "unavailable";
  practice:
    | { path: string; injection_channel: InjectionChannel; sha256: string }
    | "none"
    | "unavailable";
};

/** Length-metric calibration for the irrelevant-practice control. */
export type IrrelevantPracticeCalibration = {
  length_metric: string;
  oracle_characters: number;
  irrelevant_characters: number;
  maximum_relative_difference: number;
  actual_relative_difference: number;
  independently_reviewed: boolean;
};

/** Decision rule for advancing from candidate to recorded signal. */
export type DecisionRule = {
  metric: string;
  advance_only_when: string;
  otherwise: string;
};

/** The full injection-calibration/v1 profile declaration. */
export type InjectionCalibrationProfile = {
  conditions: InjectionCondition[];
  irrelevant_practice_calibration: IrrelevantPracticeCalibration;
  decision_rule: DecisionRule;
};
