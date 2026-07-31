import { resolve, sep } from "node:path";
import { workspaceRoot } from "../../../fs";
import type { PracticeObservation } from "./profile-diagnostic-runner";

export const diagnosticConditions = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
export type DiagnosticCondition = typeof diagnosticConditions[number];
export type PlanCandidate = { id: string; path: string; source_commit: string; snapshot_id: string; profile_input_hash: string };
export type OneRepeatReAdmissionGate = {
  kind: "one-repeat-re-admission";
  parent_plan: { id: string; repetitions: number };
  candidate_id: string;
  parent_block: number;
};
export type DiagnosticPlan = {
  schema_version: "profile-diagnostic-plan/v2";
  id: string;
  schedule_seed: string;
  schedule_algorithm: "cyclic-latin-square/v1";
  repetitions: number;
  independent_candidate_threshold: number;
  conditions: DiagnosticCondition[];
  candidates: PlanCandidate[];
  execution_gate?: OneRepeatReAdmissionGate;
};
export type ScheduledAttempt = Omit<PlanCandidate, "path"> & { candidate_path: string; block: number; planned_position: number; condition: DiagnosticCondition };
export type ReportEntry = {
  candidate: string; condition: string; repeat: number; block?: number; planned_position?: number;
  evaluation_status: "evaluated" | "execution-failed" | "invalid-output" | "not-executable";
  source_commit: string; snapshot_id: string; profile_input_hash: string;
  semantic?: string; practice_observation?: PracticeObservation; joint_pass?: boolean;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function positive(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function oneRepeatReAdmissionGate(value: unknown): OneRepeatReAdmissionGate {
  const gate = record(value, "Diagnostic execution_gate");
  if (gate.kind !== "one-repeat-re-admission") throw new Error("Diagnostic execution_gate.kind must be one-repeat-re-admission");
  const parentPlan = record(gate.parent_plan, "Diagnostic execution_gate.parent_plan");
  const repetitions = positive(parentPlan.repetitions, "Diagnostic execution_gate.parent_plan.repetitions");
  if (repetitions % diagnosticConditions.length !== 0) throw new Error("Diagnostic execution_gate parent plan repetitions must be divisible by 3");
  const parentBlock = positive(gate.parent_block, "Diagnostic execution_gate.parent_block");
  if (parentBlock > repetitions) throw new Error("Diagnostic execution_gate.parent_block must exist in the parent plan");
  return {
    kind: "one-repeat-re-admission",
    parent_plan: { id: text(parentPlan.id, "Diagnostic execution_gate.parent_plan.id"), repetitions },
    candidate_id: text(gate.candidate_id, "Diagnostic execution_gate.candidate_id"),
    parent_block: parentBlock,
  };
}

export function parseDiagnosticPlan(value: unknown, planPath: string): DiagnosticPlan {
  const document = record(value, "Diagnostic plan");
  if (document.schema_version !== "profile-diagnostic-plan/v2") throw new Error("Diagnostic plan schema_version must be profile-diagnostic-plan/v2");
  if (document.schedule_algorithm !== "cyclic-latin-square/v1") throw new Error("Diagnostic plan schedule_algorithm must be cyclic-latin-square/v1");
  const repetitions = positive(document.repetitions, "Diagnostic plan repetitions");
  const executionGate = document.execution_gate === undefined ? undefined : oneRepeatReAdmissionGate(document.execution_gate);
  if (repetitions % diagnosticConditions.length !== 0 && (repetitions !== 1 || !executionGate)) throw new Error("Diagnostic plan repetitions must be divisible by 3 unless it declares one-repeat-re-admission");
  const rawCandidates = document.candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) throw new Error("Diagnostic plan must declare candidates");
  const ids = new Set<string>();
  const candidates = rawCandidates.map((entry, index) => {
    const candidate = record(entry, `candidates[${index}]`);
    const id = text(candidate.id, `candidates[${index}].id`);
    if (ids.has(id)) throw new Error(`Diagnostic plan has duplicate candidate: ${id}`);
    ids.add(id);
    const candidatePath = text(candidate.path, `candidates[${index}].path`);
    const resolved = resolve(workspaceRoot, candidatePath);
    if (!resolved.startsWith(`${workspaceRoot}${sep}`)) throw new Error(`Candidate path escapes workspace: ${candidatePath}`);
    return { id, path: candidatePath.replaceAll("\\", "/"), source_commit: text(candidate.source_commit, `${id}.source_commit`), snapshot_id: text(candidate.snapshot_id, `${id}.snapshot_id`), profile_input_hash: text(candidate.profile_input_hash, `${id}.profile_input_hash`) };
  });
  if (executionGate && (repetitions !== 1 || candidates.length !== 1 || candidates[0].id !== executionGate.candidate_id)) {
    throw new Error("one-repeat-re-admission must declare exactly its one candidate with repetitions: 1");
  }
  const threshold = positive(document.independent_candidate_threshold, "Diagnostic plan independent_candidate_threshold");
  if (!Array.isArray(document.conditions) || document.conditions.length !== diagnosticConditions.length || document.conditions.some((condition, index) => condition !== diagnosticConditions[index])) throw new Error("Diagnostic plan conditions must declare baseline, oracle-practice, irrelevant-practice in order");
  return { schema_version: "profile-diagnostic-plan/v2", id: text(document.id, "Diagnostic plan id"), schedule_seed: text(document.schedule_seed, "Diagnostic plan schedule_seed"), schedule_algorithm: "cyclic-latin-square/v1", repetitions, independent_candidate_threshold: threshold, conditions: [...diagnosticConditions], candidates, ...(executionGate ? { execution_gate: executionGate } : {}) };
}

export async function readDiagnosticPlan(path: string): Promise<DiagnosticPlan> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Diagnostic plan is missing: ${path}`);
  return parseDiagnosticPlan(Bun.YAML.parse(await file.text()), path);
}

function seedIndex(seed: string, candidate: PlanCandidate): number {
  const digest = new Bun.CryptoHasher("sha256").update(`${seed}\0${candidate.id}\0${candidate.profile_input_hash}`).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 6;
}
const permutations: DiagnosticCondition[][] = [
  ["baseline", "oracle-practice", "irrelevant-practice"], ["baseline", "irrelevant-practice", "oracle-practice"],
  ["oracle-practice", "baseline", "irrelevant-practice"], ["oracle-practice", "irrelevant-practice", "baseline"],
  ["irrelevant-practice", "baseline", "oracle-practice"], ["irrelevant-practice", "oracle-practice", "baseline"],
];

export function buildSchedule(plan: DiagnosticPlan): ScheduledAttempt[] {
  const attempts: ScheduledAttempt[] = [];
  for (const candidate of plan.candidates) {
    const base = permutations[seedIndex(plan.schedule_seed, candidate)];
    for (let block = 1; block <= plan.repetitions; block += 1) {
      for (let position = 0; position < diagnosticConditions.length; position += 1) {
        attempts.push({ ...candidate, candidate_path: candidate.path, block, planned_position: position + 1, condition: base[(position + block - 1) % diagnosticConditions.length] });
      }
    }
  }
  return attempts;
}

function count(entries: ReportEntry[], predicate: (entry: ReportEntry) => boolean): number { return entries.filter(predicate).length; }
function rng(seed: string): () => number {
  let value = Number.parseInt(new Bun.CryptoHasher("sha256").update(seed).digest("hex").slice(0, 8), 16) >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function interval(deltas: number[], seed: string): [number, number] {
  if (deltas.length === 0) return [0, 0];
  const random = rng(seed); const samples: number[] = [];
  for (let run = 0; run < 10_000; run += 1) { let sum = 0; for (let i = 0; i < deltas.length; i += 1) sum += deltas[Math.floor(random() * deltas.length)]; samples.push(sum / deltas.length); }
  samples.sort((left, right) => left - right);
  return [samples[Math.floor(0.025 * (samples.length - 1))], samples[Math.ceil(0.975 * (samples.length - 1))]];
}

export function summarizePlan(plan: DiagnosticPlan, schedule: ScheduledAttempt[], entries: ReportEntry[]) {
  const isReAdmissionGate = plan.execution_gate?.kind === "one-repeat-re-admission";
  const groups = plan.candidates.map((candidate) => {
    const candidateSchedule = schedule.filter((attempt) => attempt.id === candidate.id);
    const candidateEntries = entries.filter((entry) => entry.candidate === candidate.id && entry.profile_input_hash === candidate.profile_input_hash);
    const byCondition = Object.fromEntries(diagnosticConditions.map((condition) => {
      const planned = candidateSchedule.filter((attempt) => attempt.condition === condition);
      const actual = candidateEntries.filter((entry) => entry.condition === condition);
      return [condition, { planned: planned.length, completed: actual.length, joint_pass: count(actual, (entry) => entry.joint_pass === true), semantic: { pass: count(actual, (entry) => entry.semantic === "pass"), fail: count(actual, (entry) => entry.semantic === "fail"), "not-run": count(actual, (entry) => entry.semantic === "not-run") }, practice_observation: Object.fromEntries(["observed", "not-observed", "indeterminate", "not-run"].map((state) => [state, count(actual, (entry) => entry.practice_observation === state)])), evaluation_health: Object.fromEntries(["evaluated", "execution-failed", "invalid-output", "not-executable"].map((state) => [state, count(actual, (entry) => entry.evaluation_status === state)])) }];
    }));
    const blocked = candidateEntries.length !== candidateSchedule.length || candidateEntries.some((entry) => entry.evaluation_status !== "evaluated" || entry.practice_observation === "indeterminate");
    const rate = (condition: DiagnosticCondition) => (byCondition[condition].joint_pass as number) / (byCondition[condition].planned as number);
    const deltas = (control: DiagnosticCondition) => Array.from({ length: plan.repetitions }, (_, index) => {
      const block = index + 1;
      const oracle = candidateEntries.find((entry) => entry.condition === "oracle-practice" && entry.block === block)?.joint_pass === true ? 1 : 0;
      const controlResult = candidateEntries.find((entry) => entry.condition === control && entry.block === block)?.joint_pass === true ? 1 : 0;
      return oracle - controlResult;
    });
    const qualified = !blocked && rate("oracle-practice") > rate("baseline") && rate("oracle-practice") > rate("irrelevant-practice") && (byCondition["oracle-practice"].semantic.pass as number) >= (byCondition.baseline.semantic.pass as number) && (byCondition["oracle-practice"].semantic.pass as number) >= (byCondition["irrelevant-practice"].semantic.pass as number);
    return { candidate: candidate.id, profile_input_hash: candidate.profile_input_hash, conditions: byCondition, oracle_deltas: { baseline: { raw: rate("oracle-practice") - rate("baseline"), bootstrap_95: interval(deltas("baseline"), `analysis\0${plan.schedule_seed}\0${candidate.id}\0baseline`) }, "irrelevant-practice": { raw: rate("oracle-practice") - rate("irrelevant-practice"), bootstrap_95: interval(deltas("irrelevant-practice"), `analysis\0${plan.schedule_seed}\0${candidate.id}\0irrelevant`) } }, conclusion_grade: isReAdmissionGate ? "diagnostic-only" : blocked ? "diagnostic-or-uncertain" : qualified ? "directional-screen" : "diagnostic" };
  });
  const reproducible = !isReAdmissionGate && groups.length >= plan.independent_candidate_threshold && groups.every((group) => group.conclusion_grade === "directional-screen");
  return { schema_version: "profile-diagnostic-report/v1", groups, overall_conclusion_grade: reproducible ? "reproducible-direction" : "diagnostic-only" };
}
