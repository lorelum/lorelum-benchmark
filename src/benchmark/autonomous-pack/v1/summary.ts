import Ajv2020 from "ajv/dist/2020";
import { readFileSync } from "node:fs";
import { hashContract, schedulePlan, type AutonomousPlan, type Condition } from "./plan";
import type { TraceAudit } from "./trace";

export type AutonomousObservation = {
  schema_version: "autonomous-pack-observation/v1";
  plan_id: string; plan_sha256: string; pair_id: string; condition: Condition; ordinal: number;
  input_sha256: string | null; common_sha256: string | null; pack_snapshot_sha256: string | null; index_sha256: string | null;
  verification: { input: boolean; isolation: boolean; treatment: boolean; reasons: string[] };
  health: "evaluated" | "execution-failed" | "invalid-output" | "not-executable" | "indeterminate";
  failure_reasons: string[];
  semantic: "pass" | "fail" | "not-run";
  quality: "observed" | "not-observed" | "indeterminate" | "not-run" | "judge-unavailable";
  quality_probes: { id: string; status: AutonomousObservation["quality"]; points: number | null; max_points: number | null }[];
  trace: { complete: boolean; query: TraceAudit["query"]; get_success: number; get_failed: number; get_indeterminate: number };
  duration_ms: number | null; cost_usd: number | null;
  input_tokens: number | null; output_tokens: number | null; total_tokens: number | null;
  artifacts: { kind: string; uri: string; sha256: string }[];
};

const schema = JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-observation-v1.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

/** Retains counts, not raw tool arguments/results, in the shareable observation. */
export function traceObservation(audit: TraceAudit): AutonomousObservation["trace"] {
  const gets = audit.calls.filter(call => call.tool === "lore_get");
  return {
    complete: audit.complete, query: audit.query,
    get_success: gets.filter(call => call.status === "success").length,
    get_failed: gets.filter(call => call.status === "failed").length,
    get_indeterminate: gets.filter(call => call.status === "indeterminate" || call.status === "empty").length
  };
}

export function assertObservation(value: unknown): asserts value is AutonomousObservation {
  if (!validate(value)) throw new Error(`Invalid autonomous Pack observation: ${JSON.stringify(validate.errors)}`);
  const observation = value as AutonomousObservation;
  const v = observation.verification;
  if ((!v.input || !v.isolation || !v.treatment) && !v.reasons.length) throw new Error("Unverified observation requires reasons");
  if (observation.health !== "evaluated" && !observation.failure_reasons.length) throw new Error("Unhealthy observation requires reasons");
  if (new Set(observation.quality_probes.map(probe => probe.id)).size !== observation.quality_probes.length) throw new Error("Duplicate quality probe id");
  for (const probe of observation.quality_probes) {
    if ((probe.points === null) !== (probe.max_points === null) || (probe.points !== null && probe.max_points !== null && probe.points > probe.max_points)) throw new Error("Invalid quality probe points");
    if (observation.health !== "evaluated" && (probe.status === "observed" || probe.status === "not-observed")) throw new Error("Unhealthy observation cannot contain evaluated quality probes");
  }
}

const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

/** Missing runs remain explicit planned slots. A summary is not a run record. */
export function summarizePlan(plan: AutonomousPlan, observations: readonly unknown[]) {
  const schedule = schedulePlan(plan);
  const planSha = hashContract(plan);
  const slots = new Map(schedule.map(run => [run.ordinal, run]));
  const byOrdinal = new Map<number, AutonomousObservation>();
  for (const value of observations) {
    assertObservation(value);
    const slot = slots.get(value.ordinal);
    if (!slot || value.plan_id !== plan.id || value.plan_sha256 !== planSha || value.pair_id !== slot.pair_id || value.condition !== slot.condition) throw new Error("Observation does not match the registered plan and slot");
    if (byOrdinal.has(value.ordinal)) throw new Error("Duplicate observation for planned slot");
    byOrdinal.set(value.ordinal, value);
  }
  const conditions = Object.fromEntries((["empty-store", "pack-installed"] as Condition[]).map(condition => [condition, {
    planned: 0, observed: 0, missing: 0, eligible: 0,
    health: {} as Record<string, number>, semantic: {} as Record<string, number>, quality: {} as Record<string, number>, eligible_semantic: {} as Record<string, number>, eligible_quality: {} as Record<string, number>, query: {} as Record<string, number>,
    get_success: 0, get_failed: 0, get_indeterminate: 0,
    duration_ms: { available: 0, sum: 0 }, cost_usd: { available: 0, sum: 0 },
    input_tokens: { available: 0, sum: 0 }, output_tokens: { available: 0, sum: 0 }, total_tokens: { available: 0, sum: 0 }
  }])) as Record<Condition, { planned: number; observed: number; missing: number; eligible: number; health: Record<string, number>; semantic: Record<string, number>; quality: Record<string, number>; eligible_semantic: Record<string, number>; eligible_quality: Record<string, number>; query: Record<string, number>; get_success: number; get_failed: number; get_indeterminate: number; duration_ms: { available: number; sum: number }; cost_usd: { available: number; sum: number }; input_tokens: { available: number; sum: number }; output_tokens: { available: number; sum: number }; total_tokens: { available: number; sum: number } }>;
  const runs = schedule.map(slot => {
    const totals = conditions[slot.condition];
    totals.planned++;
    const observation = byOrdinal.get(slot.ordinal);
    if (!observation) { totals.missing++; return { ...slot, status: "missing" as const, reasons: ["No observation supplied"], quality_probes: [] }; }
    totals.observed++;
    increment(totals.health, observation.health);
    increment(totals.semantic, observation.semantic);
    increment(totals.quality, observation.quality);
    increment(totals.query, observation.trace.query);
    totals.get_success += observation.trace.get_success;
    totals.get_failed += observation.trace.get_failed;
    totals.get_indeterminate += observation.trace.get_indeterminate;
    if (observation.duration_ms !== null) { totals.duration_ms.available++; totals.duration_ms.sum += observation.duration_ms; }
    if (observation.cost_usd !== null) { totals.cost_usd.available++; totals.cost_usd.sum += observation.cost_usd; }
    for (const field of ["input_tokens", "output_tokens", "total_tokens"] as const) {
      const value = observation[field];
      if (value !== null) { totals[field].available++; totals[field].sum += value; }
    }
    const reasons = [...observation.verification.reasons, ...observation.failure_reasons];
    if (!observation.verification.input || observation.input_sha256 !== slot.input_sha256 || observation.common_sha256 !== slot.common_sha256) reasons.push("Input identity unverified or mismatched");
    if (!observation.verification.isolation) reasons.push("Isolation unverified");
    if (!observation.verification.treatment || (slot.condition === "pack-installed" ? observation.pack_snapshot_sha256 !== plan.pack.snapshot_sha256 || observation.index_sha256 !== plan.pack.index_sha256 : observation.pack_snapshot_sha256 !== null || observation.index_sha256 !== null)) reasons.push("Treatment identity unverified or mismatched");
    if (observation.health !== "evaluated") reasons.push(`Health: ${observation.health}`);
    const eligible = reasons.length === 0;
    if (eligible) {
      totals.eligible++;
      increment(totals.eligible_semantic, observation.semantic);
      increment(totals.eligible_quality, observation.quality);
    }
    return { ...slot, status: eligible ? "eligible" as const : "ineligible" as const, reasons, quality_probes: observation.quality_probes };
  });
  const pairs = { planned: schedule.length / 2, eligible: 0, semantic_comparable: 0, pack_only_pass: 0, empty_only_pass: 0, both_pass: 0, both_fail: 0 };
  for (let i = 0; i < runs.length; i += 2) {
    const a = runs[i], b = runs[i + 1];
    if (a.status !== "eligible" || b.status !== "eligible") continue;
    pairs.eligible++;
    const first = byOrdinal.get(a.ordinal)!, second = byOrdinal.get(b.ordinal)!;
    const empty = first.condition === "empty-store" ? first : second;
    const pack = first.condition === "pack-installed" ? first : second;
    if (empty.semantic === "not-run" || pack.semantic === "not-run") continue;
    pairs.semantic_comparable++;
    if (pack.semantic === "pass" && empty.semantic === "pass") pairs.both_pass++;
    else if (pack.semantic === "fail" && empty.semantic === "fail") pairs.both_fail++;
    else if (pack.semantic === "pass") pairs.pack_only_pass++;
    else pairs.empty_only_pass++;
  }
  return { schema_version: "autonomous-pack-summary/v1" as const, plan_id: plan.id, plan_sha256: planSha, run_kind: plan.run_kind, planned_runs: schedule.length, conditions, pairs, uncertainty: "not-estimated" as const, runs };
}
