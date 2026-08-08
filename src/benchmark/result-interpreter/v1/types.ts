/**
 * result-interpreter/v1 - channel-neutral result interpretation contract.
 *
 * Consumes normalized attempt entries that reuse the `outcome/v1` vocabulary,
 * isolates them by fixed input identity (sample unit), applies a data-driven
 * decision rule, and emits an audited verdict per unit plus a diagnostic-only
 * cross-unit distribution. The core has no knowledge of practice or skill
 * channels; adapters translate channel-specific results into this contract.
 */

import type { ExecutionHealth, OutcomeEntry, QualityOutcome, SemanticOutcome } from "../../outcome/v1/contract";

export type { ExecutionHealth, OutcomeEntry, QualityOutcome, SemanticOutcome } from "../../outcome/v1/contract";

/** Fixed input identity of one comparison unit (candidate + input hash). */
export type SampleUnit = {
  candidate: string;
  source_commit: string;
  snapshot_id: string;
  input_hash: string;
};

/**
 * One planned attempt slot inside a unit. `repeat` is a 1-based positive
 * integer; each `condition_id × repeat` slot must be unique within a unit
 * (runner-side `block`/`repeat` numbering must be mapped to this by adapters).
 */
export type PlannedAttempt = {
  condition_id: string;
  repeat: number;
};

/** Explicit planned denominator for a unit; missing attempts are detectable. */
export type UnitPlan = {
  sample_unit: SampleUnit;
  planned: PlannedAttempt[];
};

/**
 * Redacted injection trace. Only a channel label plus restricted id/version/hash
 * fields are allowed; free text, paths, and private material are rejected by the
 * interpreter's redaction gate.
 */
export type RedactedTrace = {
  channel: string;
  [key: string]: string;
};

/** A normalized single attempt result, channel-neutral. */
export type AttemptEntry = {
  sample_unit: SampleUnit;
  condition_id: string;
  repeat: number;
  outcome: OutcomeEntry;
  trace: RedactedTrace;
};

/**
 * Data-driven decision rule. v1 supports only the joint-pass-count metric with
 * a strictly-greater-than-each-control relation; extensions require a new
 * version rather than widening this enumeration.
 */
export type DecisionRule = {
  metric: "joint-pass-count";
  active_condition: string;
  controls: string[];
  relation: "strictly-greater-than-each-control";
  otherwise: "diagnostic-only";
};

export type Verdict = "signal" | "diagnostic-only" | "uncertain";

/** Raw per-condition counts preserved for audit. */
export type ConditionOutcomeCounts = {
  planned: number;
  evaluated: number;
  health: Record<ExecutionHealth, number>;
  semantic: Record<SemanticOutcome, number>;
  quality: Record<QualityOutcome, number>;
  joint_pass: number;
};

export type UnitVerdict = {
  sample_unit: SampleUnit;
  verdict: Verdict;
  reasons: string[];
  conditions: Record<string, ConditionOutcomeCounts>;
};

export type CrossUnitSummary = {
  verdict_distribution: Record<Verdict, number>;
  execution_gaps: string[];
};

export type InterpreterSummary = {
  schema_version: "result-interpreter-summary/v1";
  generated_at: string;
  units: UnitVerdict[];
  cross_unit: CrossUnitSummary;
  /**
   * Indicates only whether any unit is `uncertain`; it is never `signal` and is
   * not an aggregate conclusion. Cross-unit output is intentionally
   * diagnostic-only per #155 (no weighted scores, no aggregate signal).
   */
  overall: "diagnostic-only" | "uncertain";
};

/**
 * Each unit declares its own decision rule so the same core can interpret
 * different profiles (for example practice and skill) in a single call.
 */
export type InterpretationInput = {
  units: Array<{
    plan: UnitPlan;
    entries: AttemptEntry[];
    decision_rule: DecisionRule;
  }>;
};