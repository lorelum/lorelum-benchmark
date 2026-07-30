import { cp, mkdir } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { joinPath, relativePath, workspaceRoot } from "../../../fs";
import { resolveInjectionCalibration, resolvePracticePayload, redactedInjectionTrace, type PracticePayload, type ResolvedInjectionCalibration } from "../../../kernel/profiles/injection-calibration/v1/runtime";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";
import { fail, piCommand, preflightPiAndModel, run, type CommandResult } from "./preflight";
import { buildSchedule, diagnosticConditions, readDiagnosticPlan, summarizePlan, type DiagnosticPlan, type ScheduledAttempt } from "./profile-diagnostic-plan";

const scratchRoot = resolve(workspaceRoot, "scratch");

export type SharedExecution = {
  pi_version: string;
  model: { id: string };
  budget: { max_duration_minutes: number };
  repetitions: number;
};
type Condition = { id: string; status: string; practice: unknown };
export type Conditions = { shared_execution: SharedExecution; conditions: Condition[] };
export type CandidateManifest = {
  id: string;
  kernel: { core: string; profile: string; materializer_kind: string };
  source: { source_commit: string };
};
type Snapshot = { snapshot_id: string; resolved?: { profile_input_hash?: string } };
const semanticResults = new Set(["pass", "fail", "not-run"]);
const practiceObservations = new Set(["observed", "not-observed", "indeterminate", "not-run"]);
export type PracticeObservation = "observed" | "not-observed" | "indeterminate" | "not-run";
export type ProfileDiagnosticEvaluatorResult = {
  semantic: "pass" | "fail" | "not-run";
  practice_observation: PracticeObservation;
  observation_reason?: string;
};

export type DiagnosticEntry = {
  candidate: string;
  condition: string;
  repeat: number;
  evaluation_status: "evaluated" | "execution-failed" | "invalid-output" | "not-executable";
  trace: ReturnType<typeof redactedInjectionTrace>;
  source_commit: string;
  snapshot_id: string;
  profile_input_hash: string;
  semantic?: string;
  practice_observation?: PracticeObservation;
  observation_reason?: string;
  joint_pass?: boolean;
  block?: number;
  planned_position?: number;
  actual_execution_position?: number;
  error?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireScratchPath(path: string): string {
  const resolved = resolve(workspaceRoot, path);
  const fromScratch = relative(scratchRoot, resolved);
  if (fromScratch === "" || fromScratch.startsWith("..") || isAbsolute(fromScratch)) {
    fail("Local diagnostic output must stay inside ignored scratch/");
  }
  return resolved;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[:.]/g, "-");
}

export async function readYaml<T>(path: string, label: string): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`${label} is missing: ${relativePath(path)}`);
  try {
    return Bun.YAML.parse(await file.text()) as T;
  } catch (error) {
    fail(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function verifyCandidateDeclaration(candidatePath: string): Promise<CandidateManifest> {
  const manifest = await readYaml<CandidateManifest>(resolve(candidatePath, "private/candidate.yaml"), "private/candidate.yaml");
  if (!isRecord(manifest) || !isRecord(manifest.kernel)) fail(`candidate.yaml must declare kernel: ${relativePath(candidatePath)}`);
  const { core, profile, materializer_kind } = manifest.kernel;
  if (core !== "v1" || profile !== "injection-calibration/v1" || materializer_kind !== "react-vite") {
    fail(`Candidate does not declare core/v1 + injection-calibration/v1 + react-vite: ${relativePath(candidatePath)}`);
  }
  if (!isRecord(manifest.source) || typeof manifest.source.source_commit !== "string") {
    fail(`candidate.yaml must declare source.source_commit: ${relativePath(candidatePath)}`);
  }
  return manifest;
}

export async function verifySnapshotIdentity(candidatePath: string, manifest: CandidateManifest): Promise<{ snapshotId: string; profileInputHash: string }> {
  const snapshot = await Bun.file(resolve(candidatePath, "private/snapshot.json")).json() as Snapshot;
  if (!isRecord(snapshot) || typeof snapshot.snapshot_id !== "string") {
    fail(`snapshot.json is invalid: ${relativePath(candidatePath)}`);
  }
  const resolvedHash = snapshot.resolved?.profile_input_hash;
  if (typeof resolvedHash !== "string") {
    fail(`snapshot.json must declare resolved.profile_input_hash: ${relativePath(candidatePath)}`);
  }
  const profile = await resolveInjectionCalibration(candidatePath);
  if (profile.profile_input_hash !== resolvedHash) {
    fail(`profile_input_hash mismatch: resolver returned ${profile.profile_input_hash}, snapshot declares ${resolvedHash}`);
  }
  return { snapshotId: snapshot.snapshot_id, profileInputHash: resolvedHash };
}

export async function copyPublicWorkspace(candidatePath: string, workspace: string): Promise<void> {
  await mkdir(workspace, { recursive: true });
  await Bun.write(resolve(workspace, "task.md"), await Bun.file(resolve(candidatePath, "public/task.md")).text());
  const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report"]);
  await cp(resolve(candidatePath, "public/starter/app"), resolve(workspace, "app"), {
    recursive: true,
    errorOnExist: true,
    filter: (source) => !generatedDirectories.has(basename(source))
  });
}

export async function workspaceFiles(workspace: string): Promise<string[]> {
  const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: workspace, onlyFiles: true }));
  return entries.map((entry) => entry.split(sep).join("/")).sort();
}

export function evaluatorResult(stdout: string): ProfileDiagnosticEvaluatorResult | undefined {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { semantic?: unknown; practice_observation?: unknown; observation_reason?: unknown };
      if (
        typeof value.semantic === "string" && semanticResults.has(value.semantic) &&
        typeof value.practice_observation === "string" && practiceObservations.has(value.practice_observation) &&
        (value.observation_reason === undefined || typeof value.observation_reason === "string")
      ) {
        return value as ProfileDiagnosticEvaluatorResult;
      }
    } catch {
      // evaluator stdout may contain diagnostic text before the result line
    }
  }
  return undefined;
}

export function classifyEvaluatorResult(evaluation: CommandResult): Pick<DiagnosticEntry, "evaluation_status" | "semantic" | "practice_observation" | "observation_reason" | "joint_pass" | "error"> {
  if (evaluation.timedOut) return { evaluation_status: "execution-failed", error: "evaluator-timed-out" };
  if (evaluation.code !== 0) return { evaluation_status: "execution-failed", error: "evaluator-exit-nonzero" };

  const result = evaluatorResult(evaluation.stdout);
  if (!result) return { evaluation_status: "invalid-output", error: "evaluator-invalid-output" };

  return {
    evaluation_status: "evaluated",
    semantic: result.semantic,
    practice_observation: result.practice_observation,
    observation_reason: result.observation_reason,
    joint_pass: result.semantic === "pass" && result.practice_observation === "observed",
  };
}

export function piArgs(modelId: string, payload: PracticePayload): string[] {
  const args = [
    "--print", "--no-session", "--no-context-files", "--no-extensions",
    "--no-skills", "--no-prompt-templates",
    "--tools", "read,bash,edit,write,grep,find,ls",
    "--model", modelId,
    "@task.md",
    "Complete the coding task. Work only inside app/."
  ];
  if (payload.practice) {
    args.push("--append-system-prompt", `Apply this Practice while completing the task:\n\n${payload.practice.text}`);
  }
  return args;
}

async function runAttempt(
  outputPath: string,
  candidatePath: string,
  candidateId: string,
  manifest: CandidateManifest,
  snapshotId: string,
  profileInputHash: string,
  profile: ResolvedInjectionCalibration,
  conditionId: InjectionConditionId,
  repeat: number,
  shared: SharedExecution,
  command: string
): Promise<DiagnosticEntry> {
  const attemptPath = resolve(outputPath, candidateId, conditionId, `attempt-${repeat}`);
  const workspace = resolve(attemptPath, "workspace");
  await mkdir(attemptPath, { recursive: true });

  await copyPublicWorkspace(candidatePath, workspace);
  const initialFiles = await workspaceFiles(workspace);
  if (initialFiles.some((file) => file.includes("private/") || file.includes("practices/"))) {
    fail(`Private material was copied into an agent workspace: ${relativePath(workspace)}`);
  }

  const payload = await resolvePracticePayload(candidatePath, profile, conditionId);
  const trace = redactedInjectionTrace(profile, payload);

  const pi = await run([command, ...piArgs(shared.model.id, payload)], workspace, shared.budget.max_duration_minutes * 60_000);
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  const entry: DiagnosticEntry = {
    candidate: candidateId,
    condition: conditionId,
    repeat,
    evaluation_status: "execution-failed",
    trace,
    source_commit: manifest.source.source_commit,
    snapshot_id: snapshotId,
    profile_input_hash: profileInputHash,
  };

  if (pi.code !== 0 || pi.timedOut) {
    entry.error = pi.timedOut ? "Pi timed out" : `Pi failed with exit code ${pi.code ?? "unknown"}`;
    return entry;
  }

  let evaluation: CommandResult;
  try {
    evaluation = await run(
      [process.execPath, "run", resolve(candidatePath, "private/evaluator/evaluate.ts"), resolve(workspace, "app")],
      candidatePath,
      shared.budget.max_duration_minutes * 60_000
    );
  } catch {
    entry.error = "evaluator-launch-failed";
    return entry;
  }
  await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluation.stdout);
  await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluation.stderr);
  Object.assign(entry, classifyEvaluatorResult(evaluation));
  return entry;
}

export function redactedSchedule(schedule: ScheduledAttempt[]) {
  return schedule.map(({ path: _path, candidate_path: _candidatePath, ...attempt }) => attempt);
}

export function diagnosticOutputPath(path: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}

export async function writeSummary(path: string, plan: DiagnosticPlan, schedule: ScheduledAttempt[], entries: DiagnosticEntry[], interrupted: boolean): Promise<void> {
  await Bun.write(joinPath(path, "summary.json"), `${JSON.stringify({
    schema_version: "profile-diagnostic-summary/v3",
    generated_at: new Date().toISOString(),
    plan: { id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions, schedule: redactedSchedule(schedule) },
    entries,
    report: summarizePlan(plan, schedule, entries),
    interrupted,
  }, null, 2)}\n`);
}

type Options = { planPath: string; outputPath: string; dryRun: boolean };

function parseOptions(): Options {
  const args = Bun.argv.slice(2);
  let planPath: string | undefined;
  let outputPath = requireScratchPath(`scratch/profile-diagnostics/${timestamp()}`);
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--plan") {
      const value = args[++index];
      if (!value) fail("--plan requires a path");
      planPath = resolve(workspaceRoot, value);
      continue;
    }
    if (arg === "--output") {
      const value = args[++index];
      if (!value) fail("--output requires a directory");
      outputPath = requireScratchPath(value);
      continue;
    }
    fail(`Unknown profile diagnostic option: ${arg}`);
  }

  if (!planPath) {
    fail("Usage: bun run src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts --plan <plan.yaml> [--output <dir>] [--dry-run]");
  }
  return { planPath, outputPath, dryRun };
}

if (import.meta.path === process.argv[1]) {
const options = parseOptions();
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });

const entries: DiagnosticEntry[] = [];
const plan = await readDiagnosticPlan(options.planPath);
const schedule = buildSchedule(plan);

if (options.dryRun) {
  for (const candidate of plan.candidates) {
    const candidatePath = resolve(workspaceRoot, candidate.path);
    const manifest = await verifyCandidateDeclaration(candidatePath);
    const identity = await verifySnapshotIdentity(candidatePath, manifest);
    if (manifest.id !== candidate.id || manifest.source.source_commit !== candidate.source_commit || identity.snapshotId !== candidate.snapshot_id || identity.profileInputHash !== candidate.profile_input_hash) {
      fail(`Diagnostic plan identity mismatch for ${candidate.id}`);
    }
    const conditions = await readYaml<Conditions>(resolve(candidatePath, "private/conditions.yaml"), "private/conditions.yaml");
    for (const conditionId of diagnosticConditions) {
      if (!conditions.conditions.some((condition) => condition.id === conditionId && condition.status === "declared")) fail(`Diagnostic plan condition is not declared: ${candidate.id}/${conditionId}`);
    }
  }
  console.log(JSON.stringify({ schema_version: "profile-diagnostic-plan/v2", plan: { id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions }, planned_runs: redactedSchedule(schedule), output: diagnosticOutputPath(options.outputPath) }, null, 2));
  process.exit(0);
}

if (Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Profile diagnostics require LORELUM_LOCAL_EXPERIMENT=1");

const command = await piCommand(workspaceRoot);

await mkdir(options.outputPath, { recursive: true });
await Bun.write(joinPath(options.outputPath, "plan.json"), `${JSON.stringify({ schema_version: "profile-diagnostic-plan/v2", id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions, schedule: redactedSchedule(schedule) }, null, 2)}\n`);

let actualExecutionPosition = 0;
for (const plannedCandidate of plan.candidates) {
  if (interrupted) break;
  const candidatePath = resolve(workspaceRoot, plannedCandidate.path);
  let manifest: CandidateManifest;
  let snapshotId: string;
  let profileInputHash: string;
  let profile: ResolvedInjectionCalibration;
  let conditions: Conditions;

  try {
    manifest = await verifyCandidateDeclaration(candidatePath);
    const identity = await verifySnapshotIdentity(candidatePath, manifest);
    snapshotId = identity.snapshotId;
    profileInputHash = identity.profileInputHash;
    profile = await resolveInjectionCalibration(candidatePath);
    conditions = await readYaml<Conditions>(resolve(candidatePath, "private/conditions.yaml"), "private/conditions.yaml");
    if (manifest.id !== plannedCandidate.id || manifest.source.source_commit !== plannedCandidate.source_commit || snapshotId !== plannedCandidate.snapshot_id || profileInputHash !== plannedCandidate.profile_input_hash) fail(`Diagnostic plan identity mismatch for ${plannedCandidate.id}`);
    for (const conditionId of diagnosticConditions) if (!conditions.conditions.some((condition) => condition.id === conditionId && condition.status === "declared")) fail(`Diagnostic plan condition is not declared: ${plannedCandidate.id}/${conditionId}`);
  } catch (error) {
    entries.push({
      candidate: relativePath(candidatePath),
      condition: "none",
      repeat: 0,
      evaluation_status: "not-executable",
      trace: { condition_id: "baseline", channel: "none", profile_input_hash: "unknown" },
      source_commit: "unknown",
      snapshot_id: "unknown",
      profile_input_hash: "unknown",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeSummary(options.outputPath, plan, schedule, entries, interrupted);
    continue;
  }

  try {
    await preflightPiAndModel(command, conditions.shared_execution.model.id, workspaceRoot);
  } catch (error) {
    entries.push({
      candidate: manifest.id,
      condition: "none",
      repeat: 0,
      evaluation_status: "not-executable",
      trace: { condition_id: "baseline", channel: "none", profile_input_hash: profileInputHash },
      source_commit: manifest.source.source_commit,
      snapshot_id: snapshotId,
      profile_input_hash: profileInputHash,
      error: error instanceof Error ? error.message : String(error),
    });
    await writeSummary(options.outputPath, plan, schedule, entries, interrupted);
    continue;
  }

  for (const scheduledAttempt of schedule.filter((attempt) => attempt.id === manifest.id)) {
    if (interrupted) break;
    actualExecutionPosition += 1;
    try {
      const entry = await runAttempt(options.outputPath, candidatePath, manifest.id, manifest, snapshotId, profileInputHash, profile, scheduledAttempt.condition as InjectionConditionId, scheduledAttempt.block, conditions.shared_execution, command);
      entries.push({ ...entry, block: scheduledAttempt.block, planned_position: scheduledAttempt.planned_position, actual_execution_position: actualExecutionPosition });
    } catch (error) {
      entries.push({ candidate: manifest.id, condition: scheduledAttempt.condition, repeat: scheduledAttempt.block, block: scheduledAttempt.block, planned_position: scheduledAttempt.planned_position, actual_execution_position: actualExecutionPosition, evaluation_status: "execution-failed", trace: { condition_id: scheduledAttempt.condition, channel: "none", profile_input_hash: profileInputHash }, source_commit: manifest.source.source_commit, snapshot_id: snapshotId, profile_input_hash: profileInputHash, error: error instanceof Error ? error.message : String(error) });
    }
    await writeSummary(options.outputPath, plan, schedule, entries, interrupted);
  }
}

await writeSummary(options.outputPath, plan, schedule, entries, interrupted);
console.log(JSON.stringify({ output: diagnosticOutputPath(options.outputPath), entries: entries.length, interrupted }, null, 2));
process.exit(interrupted || entries.some((entry) => entry.evaluation_status !== "evaluated") ? 1 : 0);
}
