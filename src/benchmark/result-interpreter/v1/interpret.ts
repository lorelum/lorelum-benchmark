import { deriveJointPass, type ExecutionHealth, type OutcomeEntry, type QualityOutcome, type SemanticOutcome } from "../../outcome/v1/contract";
import type {
  AttemptEntry,
  ConditionOutcomeCounts,
  DecisionRule,
  InterpreterSummary,
  InterpretationInput,
  PlannedAttempt,
  RedactedTrace,
  SampleUnit,
  UnitPlan,
  UnitVerdict,
  Verdict,
} from "./types";

const healthStates: readonly ExecutionHealth[] = ["evaluated", "execution-failed", "invalid-output", "not-executable", "indeterminate"];
const semanticStates: readonly SemanticOutcome[] = ["pass", "fail", "not-run"];
const qualityStates: readonly QualityOutcome[] = ["observed", "not-observed", "indeterminate", "not-run", "judge-unavailable"];

/**
 * Quality states that are not definitive evidence. v1 treats only
 * "indeterminate" as a gap (per the #155 planning confirmation); "not-run" and
 * "judge-unavailable" remain non-observed (joint_pass false) for now and can be
 * promoted to gaps in a later version if #156/#92 require it.
 */
const gapQualityStates = new Set<QualityOutcome>(["indeterminate"]);

const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{7,64}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const traceKeyPattern = /^[a-z][a-z0-9_]*$/;
const traceKeySuffixes = ["_id", "_version", "_sha256", "_hash"];

/** Exact allowed key sets; any other field is treated as potential private content. */
const sampleUnitKeys = ["candidate", "source_commit", "snapshot_id", "input_hash"] as const;
const plannedAttemptKeys = ["condition_id", "repeat"] as const;
const planKeys = ["sample_unit", "planned"] as const;
const outcomeKeys = ["health", "semantic", "quality"] as const;
const entryKeys = ["sample_unit", "condition_id", "repeat", "outcome", "trace"] as const;

function fail(message: string): never {
  throw new Error(`Invalid result-interpreter/v1 input: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.length === 0) fail(`${field} must be a non-empty string`);
  return candidate;
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

function plannedKey(conditionId: string, repeat: number): string {
  return `${conditionId}\0${repeat}`;
}

function sampleUnitKey(unit: SampleUnit): string {
  return [unit.candidate, unit.source_commit, unit.snapshot_id, unit.input_hash].join("\0");
}

function sampleUnitEqual(left: SampleUnit, right: SampleUnit): boolean {
  return sampleUnitKey(left) === sampleUnitKey(right);
}

function validateSampleUnit(value: unknown): SampleUnit {
  if (!isRecord(value)) fail("sample_unit must be an object");
  const candidate = requiredString(value, "candidate");
  const sourceCommit = requiredString(value, "source_commit");
  const snapshotId = requiredString(value, "snapshot_id");
  const inputHash = requiredString(value, "input_hash");
  if (!identifierPattern.test(candidate)) fail("sample_unit.candidate is not a valid identifier");
  if (!commitPattern.test(sourceCommit)) fail("sample_unit.source_commit is not a valid commit");
  if (!hashPattern.test(snapshotId)) fail("sample_unit.snapshot_id is not a valid hash");
  if (!hashPattern.test(inputHash)) fail("sample_unit.input_hash is not a valid hash");
  return { candidate, source_commit: sourceCommit, snapshot_id: snapshotId, input_hash: inputHash };
}

function validatePlannedAttempt(value: unknown): PlannedAttempt {
  if (!isRecord(value)) fail("planned attempt must be an object");
  const conditionId = requiredString(value, "condition_id");
  const repeat = value.repeat;
  if (!identifierPattern.test(conditionId)) fail("planned condition_id is not a valid identifier");
  if (!Number.isInteger(repeat) || (repeat as number) < 1) fail("planned repeat must be a positive integer");
  return { condition_id: conditionId, repeat: repeat as number };
}

function validatePlan(value: unknown): UnitPlan {
  if (!isRecord(value)) fail("plan must be an object");
  const sampleUnit = validateSampleUnit(value.sample_unit);
  if (!Array.isArray(value.planned) || value.planned.length === 0) fail("plan.planned must be a non-empty array");
  const planned: PlannedAttempt[] = [];
  const seen = new Set<string>();
  for (const raw of value.planned) {
    const attempt = validatePlannedAttempt(raw);
    const key = plannedKey(attempt.condition_id, attempt.repeat);
    if (seen.has(key)) fail(`plan.planned contains duplicate ${attempt.condition_id}#${attempt.repeat}`);
    seen.add(key);
    planned.push(attempt);
  }
  return { sample_unit: sampleUnit, planned };
}

function validateOutcome(value: unknown): OutcomeEntry {
  if (!isRecord(value)) fail("outcome must be an object");
  const health = value.health;
  if (typeof health !== "string" || !healthStates.includes(health as ExecutionHealth)) fail("outcome.health is invalid");
  const outcome: OutcomeEntry = { health: health as ExecutionHealth };
  if (value.semantic !== undefined) {
    if (typeof value.semantic !== "string" || !semanticStates.includes(value.semantic as SemanticOutcome)) fail("outcome.semantic is invalid");
    outcome.semantic = value.semantic as SemanticOutcome;
  }
  if (value.quality !== undefined) {
    if (typeof value.quality !== "string" || !qualityStates.includes(value.quality as QualityOutcome)) fail("outcome.quality is invalid");
    outcome.quality = value.quality as QualityOutcome;
  }
  return outcome;
}

function redactedTraceKeyAllowed(key: string): boolean {
  return key === "channel" || (traceKeyPattern.test(key) && traceKeySuffixes.some((suffix) => key.endsWith(suffix)));
}

/**
 * Validates that a trace contains only opaque identifiers/hashes. Returns
 * ok=false (rather than throwing) for private or free-text content so the unit
 * can be reported `uncertain` with a redaction reason, matching the spec.
 */
function validateRedactedTrace(value: unknown): { ok: true; trace: RedactedTrace } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: "trace must be an object" };
  const trace: RedactedTrace = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") return { ok: false, reason: `trace.${key} must be a string` };
    if (!redactedTraceKeyAllowed(key)) return { ok: false, reason: `trace.${key} is not a redacted id/hash field` };
    const field = raw;
    if (field.length === 0 || field.length > 128 || field === "." || field === "..") return { ok: false, reason: `trace.${key} is not a valid identifier/hash` };
    if (field.includes("/") || field.includes("\\") || field.includes(":")) return { ok: false, reason: `trace.${key} must not contain a path` };
    if (!identifierPattern.test(field)) return { ok: false, reason: `trace.${key} is not a valid identifier/hash` };
    trace[key] = field;
  }
  if (trace.channel === undefined || trace.channel.length === 0) return { ok: false, reason: "trace.channel is required" };
  return { ok: true, trace };
}

function validateDecisionRule(value: unknown): DecisionRule {
  if (!isRecord(value)) fail("decision_rule must be an object");
  if (value.metric !== "joint-pass-count") fail("decision_rule.metric must be joint-pass-count");
  if (value.relation !== "strictly-greater-than-each-control") fail("decision_rule.relation must be strictly-greater-than-each-control");
  if (value.otherwise !== "diagnostic-only") fail("decision_rule.otherwise must be diagnostic-only");
  const activeCondition = value.active_condition;
  const controls = value.controls;
  if (typeof activeCondition !== "string" || !identifierPattern.test(activeCondition)) fail("decision_rule.active_condition is invalid");
  if (!Array.isArray(controls) || controls.length === 0) fail("decision_rule.controls must be a non-empty array");
  const controlIds: string[] = [];
  for (const control of controls) {
    if (typeof control !== "string" || !identifierPattern.test(control)) fail("decision_rule.controls must contain only identifiers");
    controlIds.push(control);
  }
  if (new Set(controlIds).size !== controlIds.length) fail("decision_rule.controls must not contain duplicates");
  if (controlIds.includes(activeCondition)) fail("decision_rule.active_condition must not appear in controls");
  return {
    metric: "joint-pass-count",
    active_condition: activeCondition,
    controls: controlIds,
    relation: "strictly-greater-than-each-control",
    otherwise: "diagnostic-only",
  };
}

function emptyCounts(): ConditionOutcomeCounts {
  return {
    planned: 0,
    evaluated: 0,
    health: Object.fromEntries(healthStates.map((state) => [state, 0])) as ConditionOutcomeCounts["health"],
    semantic: Object.fromEntries(semanticStates.map((state) => [state, 0])) as ConditionOutcomeCounts["semantic"],
    quality: Object.fromEntries(qualityStates.map((state) => [state, 0])) as ConditionOutcomeCounts["quality"],
    joint_pass: 0,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function interpretUnit(plan: UnitPlan, entries: AttemptEntry[], rule: DecisionRule): { verdict: Verdict; reasons: string[]; conditions: Record<string, ConditionOutcomeCounts> } {
  const reasons: string[] = [];
  const plannedKeys = new Set(plan.planned.map((attempt) => plannedKey(attempt.condition_id, attempt.repeat)));
  const plannedConditionIds = new Set(plan.planned.map((attempt) => attempt.condition_id));
  const conditions: Record<string, ConditionOutcomeCounts> = {};
  for (const conditionId of plannedConditionIds) conditions[conditionId] = emptyCounts();
  for (const attempt of plan.planned) conditions[attempt.condition_id].planned += 1;

  const presentKeys = new Set<string>();
  for (const entry of entries) {
    if (!sampleUnitEqual(entry.sample_unit, plan.sample_unit)) {
      reasons.push("identity-drift");
      continue;
    }
    if (!plannedConditionIds.has(entry.condition_id)) {
      reasons.push(`unplanned-condition:${entry.condition_id}`);
      continue;
    }
    const key = plannedKey(entry.condition_id, entry.repeat);
    if (presentKeys.has(key)) {
      reasons.push(`duplicate-attempt:${entry.condition_id}#${entry.repeat}`);
      continue;
    }
    presentKeys.add(key);
    const counts = conditions[entry.condition_id];
    counts.health[entry.outcome.health] += 1;
    if (entry.outcome.health === "evaluated") {
      counts.evaluated += 1;
      if (entry.outcome.semantic) counts.semantic[entry.outcome.semantic] += 1;
      if (entry.outcome.quality) counts.quality[entry.outcome.quality] += 1;
      if (deriveJointPass(entry.outcome.semantic, entry.outcome.quality)) counts.joint_pass += 1;
    }
  }

  for (const key of plannedKeys) {
    if (!presentKeys.has(key)) {
      const [conditionId, repeat] = key.split("\0");
      reasons.push(`denominator-gap:${conditionId}#${repeat}`);
    }
  }

  if (reasons.length === 0) {
    const unhealthy = entries.some((entry) => entry.outcome.health !== "evaluated");
    const indeterminateQuality = entries.some((entry) => entry.outcome.health === "evaluated" && entry.outcome.quality !== undefined && gapQualityStates.has(entry.outcome.quality));
    if (unhealthy) reasons.push("unhealthy-attempt");
    if (indeterminateQuality) reasons.push("indeterminate-quality");
  }

  if (reasons.length > 0) return { verdict: "uncertain", reasons: dedupe(reasons), conditions };

  const activeCounts = conditions[rule.active_condition];
  const missingRuleConditions = rule.controls.filter((control) => !conditions[control]);
  if (!activeCounts) missingRuleConditions.push(rule.active_condition);
  if (missingRuleConditions.length > 0) {
    return { verdict: "uncertain", reasons: missingRuleConditions.map((conditionId) => `missing-rule-condition:${conditionId}`), conditions };
  }
  const strictLead = rule.controls.every((control) => activeCounts.joint_pass > conditions[control].joint_pass);
  return { verdict: strictLead ? "signal" : "diagnostic-only", reasons: [], conditions };
}

/**
 * Interprets normalized attempt entries into an audited summary. Fails closed
 * on malformed contracts; per-unit gates (identity, denominator, redaction,
 * health, quality) turn into `uncertain` verdicts with reasons instead.
 * Unknown/private fields anywhere in a unit (entry, sample_unit, outcome, plan,
 * trace) are treated as a redaction failure rather than silently accepted.
 */
export function interpret(input: InterpretationInput): InterpreterSummary {
  if (!Array.isArray(input.units) || input.units.length === 0) fail("units must be a non-empty array");
  const unitKeys = new Set<string>();
  const units: UnitVerdict[] = [];
  const verdictDistribution: Record<Verdict, number> = { signal: 0, "diagnostic-only": 0, uncertain: 0 };
  const executionGaps: string[] = [];

  for (const unit of input.units) {
    if (!isRecord(unit)) fail("unit must be an object");
    let planRedactionFailed = false;
    if (isRecord(unit.plan)) {
      const planUnknown = unknownKeys(unit.plan, planKeys);
      const sampleUnknown = isRecord(unit.plan.sample_unit) ? unknownKeys(unit.plan.sample_unit, sampleUnitKeys) : [];
      const plannedUnknown = Array.isArray(unit.plan.planned)
        ? unit.plan.planned.flatMap((raw) => (isRecord(raw) ? unknownKeys(raw, plannedAttemptKeys) : []))
        : [];
      planRedactionFailed = planUnknown.length + sampleUnknown.length + plannedUnknown.length > 0;
    }
    const plan = validatePlan(unit.plan);
    const rule = validateDecisionRule(unit.decision_rule);
    const entries = unit.entries;
    if (!Array.isArray(entries)) fail("unit.entries must be an array");
    const key = sampleUnitKey(plan.sample_unit);
    if (unitKeys.has(key)) fail(`duplicate unit: ${key}`);
    unitKeys.add(key);

    const validatedEntries: AttemptEntry[] = [];
    let redactionFailed = planRedactionFailed;
    for (const raw of entries) {
      if (!isRecord(raw)) fail("entry must be an object");
      const sampleUnitRecord = isRecord(raw.sample_unit) ? raw.sample_unit : undefined;
      const outcomeRecord = isRecord(raw.outcome) ? raw.outcome : undefined;
      const unknown = [
        ...unknownKeys(raw, entryKeys),
        ...(sampleUnitRecord ? unknownKeys(sampleUnitRecord, sampleUnitKeys) : []),
        ...(outcomeRecord ? unknownKeys(outcomeRecord, outcomeKeys) : []),
      ];
      if (unknown.length > 0) {
        redactionFailed = true;
        continue;
      }
      const sampleUnit = validateSampleUnit(raw.sample_unit);
      const conditionId = requiredString(raw, "condition_id");
      const repeat = raw.repeat;
      if (!identifierPattern.test(conditionId)) fail("entry.condition_id is not a valid identifier");
      if (!Number.isInteger(repeat) || (repeat as number) < 1) fail("entry.repeat must be a positive integer");
      const outcome = validateOutcome(raw.outcome);
      const traceResult = validateRedactedTrace(raw.trace);
      if (!traceResult.ok) {
        redactionFailed = true;
        continue;
      }
      validatedEntries.push({
        sample_unit: sampleUnit,
        condition_id: conditionId,
        repeat: repeat as number,
        outcome,
        trace: traceResult.trace,
      });
    }

    const interpreted = interpretUnit(plan, validatedEntries, rule);
    const reasons = redactionFailed ? dedupe(["redaction-failed", ...interpreted.reasons]) : interpreted.reasons;
    const verdict: Verdict = redactionFailed ? "uncertain" : interpreted.verdict;
    units.push({ sample_unit: plan.sample_unit, verdict, reasons, conditions: interpreted.conditions });
    verdictDistribution[verdict] += 1;
    if (verdict === "uncertain") {
      executionGaps.push(`${plan.sample_unit.candidate}/${plan.sample_unit.input_hash}: ${reasons.join(", ")}`);
    }
  }

  return {
    schema_version: "result-interpreter-summary/v1",
    generated_at: new Date().toISOString(),
    units,
    cross_unit: { verdict_distribution: verdictDistribution, execution_gaps: executionGaps },
    overall: verdictDistribution.uncertain > 0 ? "uncertain" : "diagnostic-only",
  };
}