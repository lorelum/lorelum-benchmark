/**
 * injection-calibration/v2 profile contract - Practice injection track with
 * condition-scoped project-convention delivery.
 *
 * v2 extends v1 by allowing the practice text to be delivered as a
 * project-internal convention document (for example `docs/frontend-guide.md`)
 * written into the agent workspace, in addition to the practice-card delivery.
 * v1 is frozen; this profile is a separate version.
 */

/** Condition identifiers for the Practice injection control model. */
export type InjectionConditionId =
  | "baseline"
  | "oracle-practice"
  | "irrelevant-practice"
  | "lorelum-retrieval";

/** Channel through which a Practice is injected into a condition. */
export type InjectionChannel = "condition-scoped-private-runtime" | "none";

/** Delivery template for a Practice payload. */
export type DeliveryTemplate = "practice-card/v1" | "project-convention/v1";

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
  /** Required when delivery_template is project-convention/v1: workspace-relative target path. */
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

/** The full injection-calibration/v2 profile declaration. */
export type InjectionCalibrationProfile = {
  conditions: InjectionCondition[];
  decision_rule: DecisionRule;
};

export type ResolvedPractice = {
  id: string;
  version: string;
  sha256: string;
};

export type ResolvedCondition = {
  condition_id: InjectionConditionId;
  channel: InjectionChannel;
  practice?: ResolvedPractice;
};

export type PracticePayload = {
  condition_id: InjectionConditionId;
  channel: InjectionChannel;
  practice?: ResolvedPractice & { text: string; delivery_template: DeliveryTemplate; target_path?: string };
};

export type ResolvedInjectionCalibration = {
  conditions: Record<InjectionConditionId, ResolvedCondition>;
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
