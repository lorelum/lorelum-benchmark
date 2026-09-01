import { createHash } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import { workspaceRoot } from "../../../../fs";

export const stagedConditions = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
export type StagedCondition = typeof stagedConditions[number];

export type StagedPlanCandidate = {
  id: string;
  path: string;
  source_commit: string;
  snapshot_id: string;
  profile_input_hash: string;
};

export type StagedDiagnosticPlan = {
  schema_version: "staged-profile-diagnostic-plan/v1";
  id: string;
  schedule_seed: string;
  schedule_algorithm: "cyclic-latin-square/v1";
  dry_run: boolean;
  repetitions: number;
  conditions: StagedCondition[];
  candidates: StagedPlanCandidate[];
};

export type ScheduledStagedAttempt = Omit<StagedPlanCandidate, "path"> & {
  candidate_path: string;
  block: number;
  planned_position: number;
  condition: StagedCondition;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

export function parseStagedDiagnosticPlan(value: unknown, planPath = "staged plan"): StagedDiagnosticPlan {
  const document = record(value, planPath);
  if (document.schema_version !== "staged-profile-diagnostic-plan/v1") throw new Error("staged plan schema_version must be staged-profile-diagnostic-plan/v1");
  if (document.schedule_algorithm !== "cyclic-latin-square/v1") throw new Error("staged plan schedule_algorithm must be cyclic-latin-square/v1");
  if (document.dry_run !== true && document.dry_run !== false) throw new Error("staged plan dry_run must be boolean");
  const repetitions = Number(document.repetitions);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions % stagedConditions.length !== 0) throw new Error("staged plan repetitions must be a positive multiple of 3");
  if (!Array.isArray(document.conditions) || document.conditions.length !== stagedConditions.length || !stagedConditions.every((id, index) => document.conditions[index] === id)) throw new Error("staged plan must declare baseline, oracle-practice, irrelevant-practice exactly once");
  if (!Array.isArray(document.candidates) || document.candidates.length === 0) throw new Error("staged plan must declare candidates");
  const ids = new Set<string>();
  const candidates = document.candidates.map((entry, index): StagedPlanCandidate => {
    const candidate = record(entry, `candidates[${index}]`);
    const id = text(candidate.id, `candidates[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate staged candidate: ${id}`);
    ids.add(id);
    const path = text(candidate.path, `candidates[${index}].path`);
    const resolved = resolve(workspaceRoot, path);
    if (isAbsolute(path) || !resolved.startsWith(`${workspaceRoot}${sep}`)) throw new Error(`candidate path escapes workspace: ${path}`);
    return {
      id,
      path,
      source_commit: text(candidate.source_commit, `candidates[${index}].source_commit`),
      snapshot_id: text(candidate.snapshot_id, `candidates[${index}].snapshot_id`),
      profile_input_hash: text(candidate.profile_input_hash, `candidates[${index}].profile_input_hash`),
    };
  });
  return {
    schema_version: "staged-profile-diagnostic-plan/v1",
    id: text(document.id, "staged plan id"),
    schedule_seed: text(document.schedule_seed, "staged plan schedule_seed"),
    schedule_algorithm: "cyclic-latin-square/v1",
    dry_run: document.dry_run,
    repetitions,
    conditions: [...stagedConditions],
    candidates,
  };
}

export function buildStagedSchedule(plan: StagedDiagnosticPlan): ScheduledStagedAttempt[] {
  const attempts: ScheduledStagedAttempt[] = [];
  const seedOffset = Number.parseInt(createHash("sha256").update(plan.schedule_seed).digest("hex").slice(0, 8), 16) % stagedConditions.length;
  for (let block = 1; block <= plan.repetitions; block++) {
    plan.candidates.forEach((candidate, candidateIndex) => {
      const position = (block - 1 + candidateIndex + seedOffset) % stagedConditions.length;
      attempts.push({
        id: candidate.id,
        source_commit: candidate.source_commit,
        snapshot_id: candidate.snapshot_id,
        profile_input_hash: candidate.profile_input_hash,
        candidate_path: candidate.path,
        block,
        planned_position: candidateIndex + 1,
        condition: stagedConditions[position],
      });
    });
  }
  return attempts;
}
