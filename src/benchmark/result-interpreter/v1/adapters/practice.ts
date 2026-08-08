/**
 * practice-result-adapter/v1 - maps injection-calibration/v1 local diagnostic
 * results (`profile-diagnostic-summary/v3`) into the channel-neutral
 * `result-interpreter/v1` contract.
 *
 * Consumes only the summary `entries` and `plan.schedule` (block = 1-based
 * repeat); it never parses per-attempt workspaces and never copies practice
 * text or private paths. Unknown source fields are rejected fail-closed;
 * deep redaction and identity gating are enforced by the interpreter core.
 */

import { interpret } from "../interpret";
import type { AttemptEntry, DecisionRule, InterpretationInput, RedactedTrace, SampleUnit, UnitPlan } from "../types";

export const practiceDecisionRule: DecisionRule = {
  metric: "joint-pass-count",
  active_condition: "oracle-practice",
  controls: ["baseline", "irrelevant-practice"],
  relation: "strictly-greater-than-each-control",
  otherwise: "diagnostic-only",
};

const healthStates = ["evaluated", "execution-failed", "invalid-output", "not-executable", "indeterminate"] as const;
const semanticStates = ["pass", "fail", "not-run"] as const;
const qualityStates = ["observed", "not-observed", "indeterminate", "not-run", "judge-unavailable"] as const;

const scheduleEntryKeys = ["id", "source_commit", "snapshot_id", "profile_input_hash", "block", "planned_position", "condition"] as const;
const v3EntryKeys = ["candidate", "condition", "repeat", "evaluation_status", "trace", "source_commit", "snapshot_id", "profile_input_hash", "semantic", "practice_observation", "joint_pass", "judge", "block", "planned_position", "actual_execution_position", "error", "observation_reason"] as const;
const traceKeySuffixes = ["_id", "_version", "_sha256", "_hash"] as const;

function fail(message: string): never {
  throw new Error(`Invalid profile-diagnostic-summary/v3 input: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.length === 0) fail(`${field} must be a non-empty string`);
  return candidate;
}

function requiredPositiveInt(value: Record<string, unknown>, field: string): number {
  const candidate = value[field];
  if (!Number.isInteger(candidate) || (candidate as number) < 1) fail(`${field} must be a positive integer`);
  return candidate as number;
}

function oneOf<T extends string>(value: unknown, states: readonly T[], field: string): T {
  if (typeof value !== "string" || !(states as readonly string[]).includes(value)) fail(`${field} is invalid`);
  return value as T;
}

function traceKeyAllowed(key: string): boolean {
  return key === "channel" || traceKeySuffixes.some((suffix) => key.endsWith(suffix));
}

function parseTrace(value: unknown): RedactedTrace {
  if (!isRecord(value)) fail("entry.trace must be an object");
  const trace: RedactedTrace = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") fail(`entry.trace.${key} must be a string`);
    if (!traceKeyAllowed(key)) fail(`entry.trace.${key} is not a redacted id/hash field`);
    trace[key] = raw;
  }
  return trace;
}

type ScheduleEntry = { id: string; source_commit: string; snapshot_id: string; profile_input_hash: string; block: number; condition: string };
type V3Entry = { candidate: string; condition: string; repeat: number; evaluation_status: string; trace: RedactedTrace; source_commit: string; snapshot_id: string; profile_input_hash: string; semantic?: string; practice_observation?: string };

function parseSchedule(value: unknown): ScheduleEntry[] {
  if (!Array.isArray(value)) fail("plan.schedule must be an array");
  return value.map((raw, index) => {
    if (!isRecord(raw)) fail(`plan.schedule[${index}] must be an object`);
    const unknown = unknownKeys(raw, scheduleEntryKeys);
    if (unknown.length > 0) fail(`plan.schedule[${index}] has unknown fields: ${unknown.join(", ")}`);
    return {
      id: requiredString(raw, "id"),
      source_commit: requiredString(raw, "source_commit"),
      snapshot_id: requiredString(raw, "snapshot_id"),
      profile_input_hash: requiredString(raw, "profile_input_hash"),
      block: requiredPositiveInt(raw, "block"),
      condition: requiredString(raw, "condition"),
    };
  });
}

function parseV3Entry(raw: unknown, index: number): V3Entry {
  if (!isRecord(raw)) fail(`entries[${index}] must be an object`);
  const unknown = unknownKeys(raw, v3EntryKeys);
  if (unknown.length > 0) fail(`entries[${index}] has unknown fields: ${unknown.join(", ")}`);
  const entry: V3Entry = {
    candidate: requiredString(raw, "candidate"),
    condition: requiredString(raw, "condition"),
    repeat: requiredPositiveInt(raw, "repeat"),
    evaluation_status: oneOf(raw.evaluation_status, healthStates, "evaluation_status"),
    trace: parseTrace(raw.trace),
    source_commit: requiredString(raw, "source_commit"),
    snapshot_id: requiredString(raw, "snapshot_id"),
    profile_input_hash: requiredString(raw, "profile_input_hash"),
  };
  if (raw.semantic !== undefined) entry.semantic = oneOf(raw.semantic, semanticStates, "semantic");
  if (raw.practice_observation !== undefined) entry.practice_observation = oneOf(raw.practice_observation, qualityStates, "practice_observation");
  return entry;
}

function unitKey(candidate: string, inputHash: string): string {
  return `${candidate}\0${inputHash}`;
}

function sampleUnitFrom(value: { candidate: string; source_commit: string; snapshot_id: string; profile_input_hash: string }): SampleUnit {
  return { candidate: value.candidate, source_commit: value.source_commit, snapshot_id: value.snapshot_id, input_hash: value.profile_input_hash };
}

function planFromSchedule(schedule: ScheduleEntry[]): UnitPlan {
  const first = schedule[0];
  return {
    sample_unit: { candidate: first.id, source_commit: first.source_commit, snapshot_id: first.snapshot_id, input_hash: first.profile_input_hash },
    planned: schedule.map((item) => ({ condition_id: item.condition, repeat: item.block })),
  };
}

function mapEntry(entry: V3Entry): AttemptEntry {
  const outcome: AttemptEntry["outcome"] = { health: entry.evaluation_status as AttemptEntry["outcome"]["health"] };
  if (entry.semantic !== undefined) outcome.semantic = entry.semantic as AttemptEntry["outcome"]["semantic"];
  if (entry.practice_observation !== undefined) outcome.quality = entry.practice_observation as AttemptEntry["outcome"]["quality"];
  return { sample_unit: sampleUnitFrom(entry), condition_id: entry.condition, repeat: entry.repeat, outcome, trace: entry.trace };
}

/**
 * Maps a `profile-diagnostic-summary/v3` document into a
 * `result-interpreter/v1` InterpretationInput. Throws fail-closed on an
 * unsupported schema version, malformed structure, or unknown/private fields.
 */
export function practiceToInterpretationInput(summary: unknown): InterpretationInput {
  if (!isRecord(summary)) fail("summary must be an object");
  if (summary.schema_version !== "profile-diagnostic-summary/v3") fail(`schema_version must be profile-diagnostic-summary/v3, got ${String(summary.schema_version)}`);
  if (!isRecord(summary.plan)) fail("plan must be an object");
  const schedule = parseSchedule(summary.plan.schedule);
  const rawEntries = summary.entries;
  if (!Array.isArray(rawEntries)) fail("entries must be an array");
  const entries = rawEntries.map(parseV3Entry);

  const scheduleByUnit = new Map<string, ScheduleEntry[]>();
  for (const item of schedule) {
    const key = unitKey(item.id, item.profile_input_hash);
    scheduleByUnit.set(key, [...(scheduleByUnit.get(key) ?? []), item]);
  }
  const entriesByUnit = new Map<string, V3Entry[]>();
  for (const item of entries) {
    const key = unitKey(item.candidate, item.profile_input_hash);
    entriesByUnit.set(key, [...(entriesByUnit.get(key) ?? []), item]);
  }

  const keys = new Set([...scheduleByUnit.keys(), ...entriesByUnit.keys()]);
  const units: InterpretationInput["units"] = [];
  for (const key of keys) {
    const scheduleEntries = scheduleByUnit.get(key);
    if (!scheduleEntries || scheduleEntries.length === 0) fail(`no plan.schedule for unit ${key}`);
    const plan = planFromSchedule(scheduleEntries);
    const mappedEntries = (entriesByUnit.get(key) ?? []).map(mapEntry);
    units.push({ plan, entries: mappedEntries, decision_rule: practiceDecisionRule });
  }
  units.sort((left, right) => left.plan.sample_unit.candidate.localeCompare(right.plan.sample_unit.candidate) || left.plan.sample_unit.input_hash.localeCompare(right.plan.sample_unit.input_hash));
  return { units };
}

/** Maps a v3 summary and interprets it with the practice decision rule. */
export function interpretPracticeSummary(summary: unknown): ReturnType<typeof interpret> {
  return interpret(practiceToInterpretationInput(summary));
}