/**
 * skill-trigger-orchestration/v1 profile contract - Skill trigger track.
 *
 * Verifies whether a coding agent proactively discovers and uses Lorelum:
 * autonomous Skill discovery, active Practice query, constraint-bound
 * implementation. Practice is NOT explicitly injected; the agent triggers a
 * mock query whose three-field result is injected into the prompt layer.
 *
 * This is a pure type contract; the core does not parse or validate these
 * fields.
 */

/** Condition identifiers for the Skill trigger control model. */
export type SkillTriggerConditionId =
  | "baseline"
  | "lorelum-retrieval"
  | "irrelevant-practice";

/** Channel through which a mock-retrieval result reaches the agent. */
export type SkillTriggerChannel = "mock-retrieval-tool-call" | "none";

/** Reference to a Practice card, redacted (no original text). */
export type PracticeReference = {
  path: string;
  sha256: string;
};

/** A declared condition in a skill-trigger-orchestration candidate. */
export type SkillTriggerCondition = {
  id: SkillTriggerConditionId;
  status: "declared";
  channel: SkillTriggerChannel;
  practice: PracticeReference | "none";
};

/** Three-field mock query result. behavior_constraint is a non-directive
 *  must/must-not; matched_practice carries only redacted metadata. */
export type MockRetrievalResult = {
  scope_constraint: string;
  matched_practice: { id: string; version: string; sha256: string };
  behavior_constraint: string;
};

/** Declarative decision rule: lorelum passes AND irrelevant fails. */
export type DecisionRule = {
  metric: "joint-pass-count";
  relation: "lorelum-passes-and-irrelevant-fails";
  controls: ["baseline", "irrelevant-practice"];
  otherwise: "diagnostic-only";
};

/** The full skill-trigger-orchestration/v1 profile declaration. */
export type SkillTriggerProfile = {
  conditions: SkillTriggerCondition[];
  decision_rule: DecisionRule;
};

/** Metadata entry for a single Practice card. */
export type PracticeCardMetadata = {
  id: string;
  version: string;
  path: string;
  rendered_characters: number;
};

/** Private/practices/metadata.yaml: declares card metadata and length comparison. */
export type PracticeMetadata = {
  delivery_template: "practice-card/v1";
  length_metric: "practice-card/v1:utf8-rendered-characters";
  cards: PracticeCardMetadata[];
  comparison: {
    maximum_relative_difference: number;
    actual_relative_difference: number;
    independently_reviewed: true;
  };
};

export type ResolvedPractice = {
  id: string;
  version: string;
  sha256: string;
};

export type ResolvedCondition = {
  condition_id: SkillTriggerConditionId;
  channel: SkillTriggerChannel;
  practice?: ResolvedPractice;
};

/** Three-layer trace events (redacted; no Practice text or private paths). */
export type TraceEvent =
  | { event: "public_input_read"; path: string; sha256: string; anchors: string[] }
  | { event: "docs_discovered"; tool_call_id: string; doc_id: string; doc_version: string }
  | { event: "docs_opened"; tool_call_id: string; doc_id: string; doc_version: string }
  | { event: "policy_query_issued"; query_id: string; query_sha256: string }
  | { event: "policy_query_resolved"; query_id: string; practice_id: string; practice_version: string; practice_sha256: string; behavior_constraint_sha256: string };

export type RedactedSkillTriggerTrace = {
  condition_id: SkillTriggerConditionId;
  channel: SkillTriggerChannel;
  profile_input_hash: string;
  events: TraceEvent[];
  practice_id?: string;
  practice_version?: string;
  practice_sha256?: string;
};

export type ResolvedSkillTrigger = {
  conditions: Record<SkillTriggerConditionId, ResolvedCondition>;
  decision_rule: DecisionRule;
  profile_input_hash: string;
};

export type SkillTriggerPayload = {
  condition_id: SkillTriggerConditionId;
  channel: SkillTriggerChannel;
  mock_result?: MockRetrievalResult;
};
