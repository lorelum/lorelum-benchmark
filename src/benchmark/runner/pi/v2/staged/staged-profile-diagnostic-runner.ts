import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { evaluateTwoStageStructure } from "../../../../evaluator/two-stage-structure/v1/analyze";
import { sha256File, sha256Text } from "../../../../fs";
import { isGeneratedWorkspacePath } from "../../../../kernel/profiles/shared/workspace-generated/v1";
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
  condition_id: TwoStageConditionId;
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
  condition_id: TwoStageConditionId;
  execution_health: "evaluated" | "execution-unhealthy" | "dry-run";
  stage_1_semantic: SemanticLabel | "not-run";
  stage_2_semantic: SemanticLabel | "not-run";
  session_binding: "same-session" | "not-started" | "resume-failed";
  session_id?: string;
  stage_1_snapshot?: Stage1Snapshot;
  structure?: StructureEvaluationResult;
  termination?: "condition-binding" | "prompt-binding" | "stage-1-semantic" | "dependency-mutation" | "stage-1-snapshot-mismatch" | "session-resume" | "pi-execution";
  planned_denominator: number;
  transcript_in_workspace?: boolean;
  redacted_trace?: RedactedTwoStageTrace;
};

async function files(root: string, current = root, relative = ""): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    if (isGeneratedWorkspacePath(entry.name)) continue;
    const path = join(current, entry.name);
    const pathRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...await files(root, path, pathRelative));
    else if (entry.isFile()) output.push(pathRelative);
  }
  return output.sort();
}
async function snapshot(root: string, excludes: string[]): Promise<Stage1Snapshot> {
  const included = (await files(root)).filter((file) => !excludes.some((exclude) => file === exclude || file.startsWith(`${exclude}/`)));
  const manifest = await Promise.all(included.map(async (file) => ({ path: file, sha256: await sha256File(join(root, file)) })));
  return { hash_algorithm: "sha256", tree_sha256: await sha256Text(manifest.map((file) => `${file.path}:${file.sha256}`).join("\n")), files: manifest };
}
async function verifySnapshot(root: string, manifest: Stage1Snapshot): Promise<boolean> {
  const actual = (await files(root)).sort();
  const expected = manifest.files.map((file) => file.path).sort();
  if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) return false;
  for (const file of manifest.files) {
    try { if (await sha256File(join(root, file.path)) !== file.sha256) return false; }
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

function normalizePromptText(value: string): string { return value.replaceAll("\r\n", "\n"); }

export async function runStagedDiagnosticAttempt(options: StagedAttemptOptions): Promise<StagedAttemptReport> {
  const stage1PromptPath = basename(options.profile.execution.stage_1.prompt_path);
  const stage2PromptPath = basename(options.profile.execution.stage_2.prompt_path);
  type ReportPatch = Partial<Omit<StagedAttemptReport, "schema_version" | "condition_id" | "planned_denominator" | "redacted_trace">>;
  const report = (patch: ReportPatch = {}): StagedAttemptReport => ({
    schema_version: "staged-runner-attempt/v1",
    condition_id: options.condition_id,
    execution_health: "execution-unhealthy",
    stage_1_semantic: "not-run",
    stage_2_semantic: "not-run",
    session_binding: "not-started",
    planned_denominator: 1,
    transcript_in_workspace: false,
    redacted_trace: options.redacted_trace,
    ...patch,
  });
  if (options.redacted_trace && options.redacted_trace.condition_id !== options.condition_id) return report({ termination: "condition-binding" });
  const declaredPrompts = await Promise.all([
    readFile(join(options.candidate_path, options.profile.execution.stage_1.prompt_path), "utf8").catch(() => null),
    readFile(join(options.candidate_path, options.profile.execution.stage_2.prompt_path), "utf8").catch(() => null),
  ]);
  const promptBindingValid = declaredPrompts[0] != null && declaredPrompts[1] != null
    && normalizePromptText(options.stage_1_prompt) === normalizePromptText(declaredPrompts[0])
    && normalizePromptText(options.stage_2_prompt) === normalizePromptText(declaredPrompts[1]);
  if (!promptBindingValid) return report({ termination: "prompt-binding" });
  const app = join(options.workspace, "app");
  await rm(options.workspace, { recursive: true, force: true });
  await mkdir(app, { recursive: true });
  await cp(join(options.candidate_path, "public/starter/app"), app, { recursive: true });
  await Bun.write(join(options.workspace, stage1PromptPath), options.stage_1_prompt);
  if (options.practice_text && options.practice_target_path) {
    const target = resolve(app, options.practice_target_path);
    if (!target.startsWith(resolve(app))) throw new Error("practice target escapes workspace");
    await Bun.write(target, options.practice_text);
  }
  const privateMarkers = [...options.allowed_private_markers ?? [], "private/evaluator", "private/oracle", "scoring_configuration:", "credential:"];
  for (const marker of privateMarkers) {
    if (await contains(options.workspace, marker)) return report({ termination: "stage-1-semantic" });
  }
  if (await contains(options.workspace, options.stage_2_prompt)) return report({ termination: "stage-1-semantic" });
  if (options.dry_run) return report({ execution_health: "dry-run" });
  const pi = options.pi;
  const semantics = options.semantics;
  if (!pi || !semantics) throw new Error("non-dry-run staged attempts require controlled Pi and semantic adapters");
  const immutable = ["package.json", "bun.lock"];
  const before = await Promise.all(immutable.map(async (file) => await sha256File(join(app, file)).catch(() => "")));
  const sessionDir = join(options.artifacts, "sessions");
  const stage1 = await pi.start({ stage: 1, workspace: options.workspace, app, prompt_path: stage1PromptPath, session_dir: sessionDir });
  const manifest = await snapshot(app, options.profile.execution.snapshot.exclude);
  const stage1Root = join(options.artifacts, "stage-1");
  await rm(stage1Root, { recursive: true, force: true });
  await cp(app, stage1Root, { recursive: true });
  const stage1Semantic = await semantics.evaluate(1, app);
  if (stage1Semantic !== "pass") {
    return report({ execution_health: "evaluated", stage_1_semantic: stage1Semantic, session_binding: "same-session", session_id: stage1.session_id, termination: "stage-1-semantic" });
  }
  await Bun.write(join(options.workspace, stage2PromptPath), options.stage_2_prompt);
  const after = await Promise.all(immutable.map(async (file) => await sha256File(join(app, file)).catch(() => "")));
  const dependencyLabel = before.every((value, index) => value === after[index]) ? "pass" : "fail";
  const beforeResumeValid = await verifySnapshot(app, manifest);
  if (dependencyLabel === "fail" || !beforeResumeValid) {
    return report({ stage_1_semantic: stage1Semantic, session_binding: "same-session", session_id: stage1.session_id, stage_1_snapshot: manifest, termination: dependencyLabel === "fail" ? "dependency-mutation" : "stage-1-snapshot-mismatch" });
  }
  let stage2;
  try {
    stage2 = await pi.resume({ stage: 2, workspace: options.workspace, app, prompt_path: stage2PromptPath, session_dir: sessionDir, session_id: stage1.session_id });
  } catch {
    return report({ stage_1_semantic: stage1Semantic, session_binding: "resume-failed", session_id: stage1.session_id, stage_1_snapshot: manifest, termination: "session-resume" });
  }
  if (stage2.session_id !== stage1.session_id) {
    return report({ stage_1_semantic: stage1Semantic, session_binding: "resume-failed", session_id: stage1.session_id, stage_1_snapshot: manifest, termination: "session-resume" });
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
  return report({
    execution_health: afterStage2Valid ? "evaluated" : "execution-unhealthy",
    stage_1_semantic: stage1Semantic,
    stage_2_semantic: stage2Semantic,
    session_binding: "same-session",
    session_id: stage1.session_id,
    stage_1_snapshot: manifest,
    structure,
    transcript_in_workspace: await contains(app, "session-header"),
  });
}
export type StagedAttemptTermination = NonNullable<StagedAttemptReport["termination"]>;

/** Single owner of the failure-report shape for staged attempts, so callers recording execution failures (for example a pilot driver whose Pi adapter throws) cannot drift from the runner's own report factory. */
export function stagedAttemptFailureReport(
  condition_id: TwoStageConditionId,
  termination: StagedAttemptTermination,
  redacted_trace?: RedactedTwoStageTrace,
): StagedAttemptReport {
  return {
    schema_version: "staged-runner-attempt/v1",
    condition_id,
    execution_health: "execution-unhealthy",
    stage_1_semantic: "not-run",
    stage_2_semantic: "not-run",
    session_binding: "not-started",
    termination,
    planned_denominator: 1,
    transcript_in_workspace: false,
    ...(redacted_trace ? { redacted_trace } : {}),
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
    const entries = reports.filter((report) => report.condition_id === condition);
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
