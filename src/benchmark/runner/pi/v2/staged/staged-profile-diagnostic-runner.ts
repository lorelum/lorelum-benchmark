import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { evaluateTwoStageStructure } from "../../../../evaluator/two-stage-structure/v1/analyze";
import type { SemanticLabel, Stage1Snapshot, StructureEvaluationResult } from "../../../../evaluator/two-stage-structure/v1/types";
import type { RedactedTwoStageTrace, ResolvedTwoStageProfile, TwoStageConditionId } from "../../../../kernel/profiles/two-stage-injection-calibration/v1/types";
import type { ScheduledStagedAttempt } from "./staged-profile-diagnostic-plan";

export type StagedPiInvocation = {
  stage: 1 | 2;
  workspace: string;
  app: string;
  prompt_path: string;
  session_dir: string;
  session_id?: string;
};

export type StagedPiResult = { session_id: string; transcript_path: string };
export type StagedPiAdapter = {
  start(invocation: StagedPiInvocation & { stage: 1 }): Promise<StagedPiResult>;
  resume(invocation: StagedPiInvocation & { stage: 2 }): Promise<StagedPiResult>;
};
export type StagedSemanticAdapter = {
  evaluate(stage: 1 | 2, app: string): Promise<SemanticLabel>;
};

export type StagedAttemptOptions = {
  candidate_path: string;
  workspace: string;
  artifacts: string;
  profile: ResolvedTwoStageProfile;
  practice_text?: string;
  practice_target_path?: string;
  stage_1_prompt: string;
  stage_2_prompt: string;
  dry_run: boolean;
  pi?: StagedPiAdapter;
  semantics?: StagedSemanticAdapter;
  allowed_private_markers?: string[];
};

export type StagedAttemptReport = {
  schema_version: "staged-runner-attempt/v1";
  execution_health: "evaluated" | "execution-unhealthy" | "dry-run";
  stage_1_semantic: SemanticLabel | "not-run";
  stage_2_semantic: SemanticLabel | "not-run";
  session_binding: "same-session" | "not-started" | "resume-failed";
  session_id?: string;
  stage_1_snapshot?: Stage1Snapshot;
  structure?: StructureEvaluationResult;
  termination?: "stage-1-semantic" | "dependency-mutation" | "stage-1-snapshot-mismatch" | "session-resume";
  planned_denominator: number;
  transcript_in_workspace?: boolean;
};

const generated = new Set(["node_modules", "dist", ".git", "coverage", "test-results"]);
function hash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
async function files(root: string, current = root, relative = ""): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    if (generated.has(entry.name)) continue;
    const path = join(current, entry.name);
    const pathRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...await files(root, path, pathRelative));
    else if (entry.isFile()) output.push(pathRelative);
  }
  return output.sort();
}
async function snapshot(root: string, excludes: string[]): Promise<Stage1Snapshot> {
  const included = (await files(root)).filter((file) => !excludes.some((exclude) => file === exclude || file.startsWith(`${exclude}/`)));
  const manifest = await Promise.all(included.map(async (file) => ({ path: file, sha256: hash(await readFile(join(root, file))) })));
  return { hash_algorithm: "sha256", tree_sha256: hash(manifest.map((file) => `${file.path}:${file.sha256}`).join("\n")), files: manifest };
}
async function verifySnapshot(root: string, manifest: Stage1Snapshot): Promise<boolean> {
  const actual = (await files(root)).sort();
  const expected = manifest.files.map((file) => file.path).sort();
  if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) return false;
  for (const file of manifest.files) {
    try { if (hash(await readFile(join(root, file.path))) !== file.sha256) return false; }
    catch { return false; }
  }
  return manifest.files.length > 0;
}
async function contains(workspace: string, needle: string): Promise<boolean> {
  if (!needle) return false;
  for (const file of await files(workspace)) {
    const buffer = await readFile(join(workspace, file));
    if (buffer.includes(needle)) return true;
  }
  return false;
}

export async function runStagedDiagnosticAttempt(options: StagedAttemptOptions): Promise<StagedAttemptReport> {
  const app = join(options.workspace, "app");
  await rm(options.workspace, { recursive: true, force: true });
  await mkdir(app, { recursive: true });
  await cp(join(options.candidate_path, "public/starter/app"), app, { recursive: true });
  await Bun.write(join(options.workspace, "task.md"), options.stage_1_prompt);
  if (options.practice_text && options.practice_target_path) {
    const target = resolve(app, options.practice_target_path);
    if (!target.startsWith(resolve(app))) throw new Error("practice target escapes workspace");
    await Bun.write(target, options.practice_text);
  }
  const privateMarkers = [...options.allowed_private_markers ?? [], "private/evaluator", "private/oracle", "scoring_configuration:", "credential:"];
  for (const marker of privateMarkers) {
    if (await contains(options.workspace, marker)) return { schema_version: "staged-runner-attempt/v1", execution_health: "execution-unhealthy", stage_1_semantic: "not-run", stage_2_semantic: "not-run", session_binding: "not-started", planned_denominator: 1, termination: "stage-1-semantic", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  if (await contains(options.workspace, options.stage_2_prompt)) {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "execution-unhealthy", stage_1_semantic: "not-run", stage_2_semantic: "not-run", session_binding: "not-started", planned_denominator: 1, termination: "stage-1-semantic", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  if (options.dry_run) {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "dry-run", stage_1_semantic: "not-run", stage_2_semantic: "not-run", session_binding: "not-started", planned_denominator: 1, transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  const pi = options.pi;
  const semantics = options.semantics;
  if (!pi || !semantics) throw new Error("non-dry-run staged attempts require controlled Pi and semantic adapters");
  const immutable = ["package.json", "bun.lock"];
  const before = await Promise.all(immutable.map(async (file) => hash(await readFile(join(app, file)).catch(() => ""))));
  const sessionDir = join(options.artifacts, "sessions");
  const stage1 = await pi.start({ stage: 1, workspace: options.workspace, app, prompt_path: "task.md", session_dir: sessionDir });
  const manifest = await snapshot(app, options.profile.execution.snapshot.exclude);
  const stage1Root = join(options.artifacts, "stage-1");
  await rm(stage1Root, { recursive: true, force: true });
  await cp(app, stage1Root, { recursive: true });
  const stage1Semantic = await semantics.evaluate(1, app);
  if (stage1Semantic !== "pass") {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "evaluated", stage_1_semantic: stage1Semantic, stage_2_semantic: "not-run", session_binding: "same-session", session_id: stage1.session_id, planned_denominator: 1, termination: "stage-1-semantic", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  await Bun.write(join(options.workspace, "task.md"), options.stage_2_prompt);
  const after = await Promise.all(immutable.map(async (file) => hash(await readFile(join(app, file)).catch(() => ""))));
  const dependencyLabel = before.every((value, index) => value === after[index]) ? "pass" : "fail";
  const beforeResumeValid = await verifySnapshot(app, manifest);
  if (dependencyLabel === "fail" || !beforeResumeValid) {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "execution-unhealthy", stage_1_semantic: stage1Semantic, stage_2_semantic: "not-run", session_binding: "same-session", session_id: stage1.session_id, stage_1_snapshot: manifest, planned_denominator: 1, termination: dependencyLabel === "fail" ? "dependency-mutation" : "stage-1-snapshot-mismatch", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  let stage2;
  try {
    stage2 = await pi.resume({ stage: 2, workspace: options.workspace, app, prompt_path: "task.md", session_dir: sessionDir, session_id: stage1.session_id });
  } catch {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "execution-unhealthy", stage_1_semantic: stage1Semantic, stage_2_semantic: "not-run", session_binding: "resume-failed", session_id: stage1.session_id, stage_1_snapshot: manifest, planned_denominator: 1, termination: "session-resume", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  if (stage2.session_id !== stage1.session_id) {
    return { schema_version: "staged-runner-attempt/v1", execution_health: "execution-unhealthy", stage_1_semantic: stage1Semantic, stage_2_semantic: "not-run", session_binding: "resume-failed", session_id: stage1.session_id, stage_1_snapshot: manifest, planned_denominator: 1, termination: "session-resume", transcript_in_workspace: false, redacted_trace: options.redacted_trace };
  }
  const stage2Semantic = await semantics.evaluate(2, app);
  const afterStage2Valid = await verifySnapshot(stage1Root, manifest);
  const structure = await evaluateTwoStageStructure({
    stage_1_root: stage1Root,
    stage_2_root: app,
    semantic: { stage_1: stage1Semantic, stage_2: stage2Semantic },
    stage_1_snapshot: manifest,
    dependency_immutability: dependencyLabel,
  });
  return {
    schema_version: "staged-runner-attempt/v1",
    execution_health: afterStage2Valid ? "evaluated" : "execution-unhealthy",
    stage_1_semantic: stage1Semantic,
    stage_2_semantic: stage2Semantic,
    session_binding: "same-session",
    session_id: stage1.session_id,
    stage_1_snapshot: manifest,
    structure,
    planned_denominator: 1,
    transcript_in_workspace: await contains(app, "session-header"),
    redacted_trace: options.redacted_trace,
  };
}
export type StagedConditionSummary = {
  condition: TwoStageConditionId;
  planned: number;
  evaluated: number;
  execution_unhealthy: number;
  dry_run: number;
  structure_pass: number;
};

export type StagedRunSummary = {
  schema_version: "staged-runner-summary/v1";
  planned: number;
  evaluated: number;
  execution_unhealthy: number;
  dry_run: number;
  structure_pass: number;
  conditions: StagedConditionSummary[];
};

export function summarizeStagedReports(reports: StagedAttemptReport[]): StagedRunSummary {
  const conditionIds: TwoStageConditionId[] = ["baseline", "oracle-practice", "irrelevant-practice"];
  const conditions = conditionIds.map((condition) => {
    const entries = reports.filter((report) => report.redacted_trace?.condition_id === condition);
    return {
      condition,
      planned: entries.length,
      evaluated: entries.filter((report) => report.execution_health === "evaluated").length,
      execution_unhealthy: entries.filter((report) => report.execution_health === "execution-unhealthy").length,
      dry_run: entries.filter((report) => report.execution_health === "dry-run").length,
      structure_pass: entries.filter((report) => report.structure?.structure_pass === true).length,
    };
  });
  return {
    schema_version: "staged-runner-summary/v1",
    planned: reports.length,
    evaluated: conditions.reduce((sum, entry) => sum + entry.evaluated, 0),
    execution_unhealthy: conditions.reduce((sum, entry) => sum + entry.execution_unhealthy, 0),
    dry_run: conditions.reduce((sum, entry) => sum + entry.dry_run, 0),
    structure_pass: conditions.reduce((sum, entry) => sum + entry.structure_pass, 0),
    conditions,
  };
}
