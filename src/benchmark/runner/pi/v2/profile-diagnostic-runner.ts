import { cp, lstat, mkdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { joinPath, relativePath, sha256Directory, workspaceRoot } from "../../../fs";
import { resolveInjectionCalibration, resolvePracticePayload, redactedInjectionTrace, type PracticePayload, type ResolvedInjectionCalibration } from "../../../kernel/profiles/injection-calibration/v1/runtime";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";
import { fail, piCommand, preflightPiAndModel, run, type CommandResult } from "./preflight";

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
  error?: string;
};

type ReplayReason =
  | "candidate-validation-failed"
  | "invalid-history-summary"
  | "missing-history-summary"
  | "missing-workspace"
  | "ambiguous-workspace"
  | "workspace-outside-history-root"
  | "workspace-integrity-unavailable"
  | "workspace-modified-during-replay"
  | "evaluator-execution-failed"
  | "evaluator-timed-out"
  | "invalid-evaluator-output";

export type HistoricalReplayEntry = Omit<DiagnosticEntry, "error"> & {
  evaluator_source_commit: string;
  replay_reason?: ReplayReason;
};

type HistoricalSummaryEntry = {
  candidate: string;
  condition: InjectionConditionId;
  repeat: number;
  trace: ReturnType<typeof redactedInjectionTrace>;
  source_commit: string;
  snapshot_id: string;
  profile_input_hash: string;
};

export type ConditionReplayCounts = {
  planned: number;
  evaluated: number;
  semantic: Record<"pass" | "fail" | "not-run", number>;
  practice_observation: Record<PracticeObservation, number>;
  joint_pass: number;
};

export type CandidateExpansionDecision = {
  candidate: string;
  profile_input_hash: string;
  status: "eligible-for-expansion" | "adjust-before-expansion" | "indeterminate";
  conditions: Record<"baseline" | "oracle-practice" | "irrelevant-practice", ConditionReplayCounts>;
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

const replayConditionIds = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{7,64}$/;
const identifierPattern = /^[A-Za-z0-9._-]+$/;
const replayReasons = new Set<ReplayReason>([
  "candidate-validation-failed", "invalid-history-summary", "missing-history-summary", "missing-workspace",
  "ambiguous-workspace",
  "workspace-outside-history-root", "workspace-integrity-unavailable", "workspace-modified-during-replay",
  "evaluator-execution-failed", "evaluator-timed-out", "invalid-evaluator-output",
]);

function isReplayCondition(value: unknown): value is (typeof replayConditionIds)[number] {
  return typeof value === "string" && (replayConditionIds as readonly string[]).includes(value);
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function safeTrace(value: unknown, condition: InjectionConditionId, profileInputHash: string): ReturnType<typeof redactedInjectionTrace> | undefined {
  if (!isRecord(value) || value.condition_id !== condition || typeof value.channel !== "string" || value.profile_input_hash !== profileInputHash) return undefined;
  if (value.channel !== "none" && value.channel !== "condition-scoped-private-runtime") return undefined;
  const trace: ReturnType<typeof redactedInjectionTrace> = {
    condition_id: condition,
    channel: value.channel,
    profile_input_hash: profileInputHash,
  };
  for (const field of ["practice_id", "practice_version", "practice_sha256"] as const) {
    if (value[field] === undefined) continue;
    if (field === "practice_sha256" ? !hashPattern.test(String(value[field])) : !safeIdentifier(value[field])) return undefined;
    Object.assign(trace, { [field]: value[field] });
  }
  return trace;
}

export function parseHistoricalSummary(value: unknown, candidateId: string): HistoricalSummaryEntry[] {
  if (!isRecord(value) || value.schema_version !== "profile-diagnostic-summary/v1" || !Array.isArray(value.entries)) {
    throw new Error("invalid-history-summary");
  }
  const entries: HistoricalSummaryEntry[] = [];
  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (!isRecord(entry) || entry.candidate !== candidateId || !isReplayCondition(entry.condition) || !Number.isInteger(entry.repeat) || (entry.repeat as number) < 1) {
      throw new Error("invalid-history-summary");
    }
    if (!commitPattern.test(String(entry.source_commit)) || !hashPattern.test(String(entry.snapshot_id)) || !hashPattern.test(String(entry.profile_input_hash))) {
      throw new Error("invalid-history-summary");
    }
    const trace = safeTrace(entry.trace, entry.condition, entry.profile_input_hash as string);
    if (!trace) throw new Error("invalid-history-summary");
    const key = `${entry.condition}\0${entry.repeat}`;
    if (keys.has(key)) throw new Error("invalid-history-summary");
    keys.add(key);
    entries.push({
      candidate: candidateId,
      condition: entry.condition,
      repeat: entry.repeat as number,
      trace,
      source_commit: entry.source_commit as string,
      snapshot_id: entry.snapshot_id as string,
      profile_input_hash: entry.profile_input_hash as string,
    });
  }
  return entries;
}

function expectedHistoricalEntries(candidateId: string, repetitions: number): Array<Pick<HistoricalSummaryEntry, "candidate" | "condition" | "repeat">> {
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("candidate-validation-failed");
  return replayConditionIds.flatMap((condition) => Array.from({ length: repetitions }, (_, index) => ({ candidate: candidateId, condition, repeat: index + 1 })));
}

function unknownTrace(condition: InjectionConditionId): ReturnType<typeof redactedInjectionTrace> {
  return { condition_id: condition, channel: "none", profile_input_hash: "unknown" };
}

function fallbackReplayEntries(
  candidateId: string,
  repetitions: number,
  evaluatorSourceCommit: string,
  reason: ReplayReason
): HistoricalReplayEntry[] {
  return expectedHistoricalEntries(candidateId, repetitions).map((entry) => ({
    ...entry,
    trace: unknownTrace(entry.condition),
    source_commit: "unknown",
    snapshot_id: "unknown",
    profile_input_hash: "unknown",
    evaluation_status: "not-executable",
    evaluator_source_commit: evaluatorSourceCommit,
    replay_reason: reason,
  }));
}

function pathInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

async function historicalWorkspace(historyRoot: string, entry: HistoricalSummaryEntry): Promise<string> {
  const root = await realpath(historyRoot);
  const candidateRoot = resolve(root, entry.candidate);
  if (!pathInside(root, candidateRoot)) throw new Error("workspace-outside-history-root");
  // #90 wrote its v1 summary one level above the candidate-specific run root;
  // later invocations may write attempts directly below that summary root.
  const locations = [
    resolve(candidateRoot, entry.condition, `attempt-${entry.repeat}`, "workspace", "app"),
    resolve(candidateRoot, entry.candidate, entry.condition, `attempt-${entry.repeat}`, "workspace", "app"),
  ];
  const resolved = await Promise.all(locations.map((location) => realpath(location).catch(() => undefined)));
  const found = [...new Set(resolved.filter((location): location is string => Boolean(location)))];
  if (found.length === 0) throw new Error("missing-workspace");
  if (found.length > 1) throw new Error("ambiguous-workspace");
  const resolvedApp = found[0];
  if (!pathInside(root, resolvedApp)) throw new Error("workspace-outside-history-root");
  const stat = await lstat(resolvedApp);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("missing-workspace");
  return resolvedApp;
}

function replayEntry(entry: HistoricalSummaryEntry, evaluatorSourceCommit: string, status: HistoricalReplayEntry["evaluation_status"], reason?: ReplayReason): HistoricalReplayEntry {
  return { ...entry, evaluator_source_commit: evaluatorSourceCommit, evaluation_status: status, ...(reason ? { replay_reason: reason } : {}) };
}

export async function replayHistoricalWorkspace(
  historyRoot: string,
  candidatePath: string,
  entry: HistoricalSummaryEntry,
  evaluatorSourceCommit: string,
  evaluatorTimeoutMs: number
): Promise<HistoricalReplayEntry> {
  let app: string;
  let before: string;
  try {
    app = await historicalWorkspace(historyRoot, entry);
    before = await sha256Directory(app);
  } catch (error) {
    const reason = error instanceof Error && replayReasons.has(error.message as ReplayReason)
      ? error.message as ReplayReason
      : "workspace-integrity-unavailable";
    return replayEntry(entry, evaluatorSourceCommit, "not-executable", reason);
  }

  const evaluation = await run(
    [process.execPath, "run", resolve(candidatePath, "private/evaluator/evaluate.ts"), app],
    candidatePath,
    evaluatorTimeoutMs
  );
  let after: string;
  try {
    after = await sha256Directory(app);
  } catch {
    return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "workspace-integrity-unavailable");
  }
  if (before !== after) return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "workspace-modified-during-replay");
  if (evaluation.timedOut) return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "evaluator-timed-out");

  const result = evaluatorResult(evaluation.stdout);
  if (!result) {
    return replayEntry(entry, evaluatorSourceCommit, evaluation.code === 0 ? "invalid-output" : "execution-failed", evaluation.code === 0 ? "invalid-evaluator-output" : "evaluator-execution-failed");
  }
  return {
    ...replayEntry(entry, evaluatorSourceCommit, "evaluated"),
    semantic: result.semantic,
    practice_observation: result.practice_observation,
    ...(result.observation_reason ? { observation_reason: result.observation_reason } : {}),
    joint_pass: result.semantic === "pass" && result.practice_observation === "observed",
  };
}

function emptyConditionCounts(): ConditionReplayCounts {
  return {
    planned: 0,
    evaluated: 0,
    semantic: { pass: 0, fail: 0, "not-run": 0 },
    practice_observation: { observed: 0, "not-observed": 0, indeterminate: 0, "not-run": 0 },
    joint_pass: 0,
  };
}

export function expansionDecisions(entries: HistoricalReplayEntry[]): CandidateExpansionDecision[] {
  const groups = new Map<string, HistoricalReplayEntry[]>();
  for (const entry of entries) {
    const key = `${entry.candidate}\0${entry.profile_input_hash}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].map((group) => {
    const conditions = Object.fromEntries(replayConditionIds.map((condition) => [condition, emptyConditionCounts()])) as CandidateExpansionDecision["conditions"];
    for (const entry of group) {
      if (!isReplayCondition(entry.condition)) continue;
      const counts = conditions[entry.condition];
      counts.planned += 1;
      if (entry.evaluation_status === "evaluated") counts.evaluated += 1;
      if (entry.semantic && entry.semantic in counts.semantic) counts.semantic[entry.semantic as keyof typeof counts.semantic] += 1;
      if (entry.practice_observation && entry.practice_observation in counts.practice_observation) counts.practice_observation[entry.practice_observation] += 1;
      if (entry.joint_pass) counts.joint_pass += 1;
    }
    const unhealthy = group.some((entry) => entry.evaluation_status !== "evaluated");
    const observations = group.map((entry) => entry.practice_observation);
    const indeterminate = observations.includes("indeterminate") || observations.includes("not-run");
    const oracle = conditions["oracle-practice"].joint_pass;
    const strictLead = oracle > conditions.baseline.joint_pass && oracle > conditions["irrelevant-practice"].joint_pass;
    return {
      candidate: group[0].candidate,
      profile_input_hash: group[0].profile_input_hash,
      status: unhealthy ? "indeterminate" : indeterminate || !strictLead ? "adjust-before-expansion" : "eligible-for-expansion",
      conditions,
    };
  }).sort((left, right) => left.candidate.localeCompare(right.candidate) || left.profile_input_hash.localeCompare(right.profile_input_hash));
}

export async function evaluatorSourceCommit(): Promise<string> {
  const result = await run(["git", "rev-parse", "HEAD"], workspaceRoot);
  const commit = result.stdout.trim();
  if (result.code !== 0 || !commitPattern.test(commit)) fail("Unable to determine current evaluator Git commit");
  return commit;
}

export async function writeHistoricalReplaySummary(path: string, entries: HistoricalReplayEntry[], evaluatorCommit: string): Promise<CandidateExpansionDecision[]> {
  const decisions = expansionDecisions(entries);
  const qualifiedCandidates = decisions.filter((decision) => decision.status === "eligible-for-expansion").map((decision) => ({ candidate: decision.candidate, profile_input_hash: decision.profile_input_hash }));
  await Bun.write(joinPath(path, "summary.json"), `${JSON.stringify({
    schema_version: "profile-diagnostic-summary/v2",
    kind: "historical-evaluator-replay",
    generated_at: new Date().toISOString(),
    evaluator_source_commit: evaluatorCommit,
    entries,
    decisions,
    qualified_candidates: qualifiedCandidates,
    next_action: qualifiedCandidates.length > 0 ? "expand-qualified-candidates" : "pause-for-adjustment",
  }, null, 2)}\n`);
  return decisions;
}

function replayReason(error: unknown, fallback: ReplayReason): ReplayReason {
  return error instanceof Error && replayReasons.has(error.message as ReplayReason) ? error.message as ReplayReason : fallback;
}

function repetitionsFromConditions(conditions: Conditions): number {
  const repetitions = conditions.shared_execution?.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error("candidate-validation-failed");
  return repetitions;
}

async function historicalPlan(historyRoot: string, candidateId: string, repetitions: number): Promise<HistoricalSummaryEntry[]> {
  const root = resolve(historyRoot);
  const summaryPath = resolve(root, candidateId, "summary.json");
  if (!pathInside(root, summaryPath)) throw new Error("invalid-history-summary");
  const summaryFile = Bun.file(summaryPath);
  if (!(await summaryFile.exists())) throw new Error("missing-history-summary");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await summaryFile.text());
  } catch {
    throw new Error("invalid-history-summary");
  }
  const entries = parseHistoricalSummary(parsed, candidateId);
  const expected = expectedHistoricalEntries(candidateId, repetitions);
  const actualKeys = new Set(entries.map((entry) => `${entry.condition}\0${entry.repeat}`));
  if (entries.length !== expected.length || expected.some((entry) => !actualKeys.has(`${entry.condition}\0${entry.repeat}`))) {
    throw new Error("invalid-history-summary");
  }
  return entries.sort((left, right) => left.condition.localeCompare(right.condition) || left.repeat - right.repeat);
}

async function replayCandidateHistory(
  historyRoot: string,
  candidatePath: string,
  manifest: CandidateManifest,
  repetitions: number,
  evaluatorCommit: string
): Promise<HistoricalReplayEntry[]> {
  let entries: HistoricalSummaryEntry[];
  try {
    entries = await historicalPlan(historyRoot, manifest.id, repetitions);
  } catch (error) {
    return fallbackReplayEntries(manifest.id, repetitions, evaluatorCommit, replayReason(error, "invalid-history-summary"));
  }
  const timeoutMs = 10 * 60_000;
  const replayed: HistoricalReplayEntry[] = [];
  for (const entry of entries) {
    replayed.push(await replayHistoricalWorkspace(historyRoot, candidatePath, entry, evaluatorCommit, timeoutMs));
  }
  return replayed;
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

  const evaluation = await run(
    [process.execPath, "run", resolve(candidatePath, "private/evaluator/evaluate.ts"), resolve(workspace, "app")],
    candidatePath
  );
  await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluation.stdout);
  await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluation.stderr);

  const result = evaluatorResult(evaluation.stdout);
  if (!result) {
    entry.evaluation_status = "invalid-output";
    entry.error = "Evaluator did not emit a structured result";
    return entry;
  }

  entry.evaluation_status = "evaluated";
  entry.semantic = result.semantic;
  entry.practice_observation = result.practice_observation;
  entry.observation_reason = result.observation_reason;
  entry.joint_pass = result.semantic === "pass" && result.practice_observation === "observed";
  return entry;
}

export async function writeSummary(path: string, entries: DiagnosticEntry[], interrupted: boolean): Promise<void> {
  await Bun.write(joinPath(path, "summary.json"), `${JSON.stringify({
    schema_version: "profile-diagnostic-summary/v2",
    generated_at: new Date().toISOString(),
    entries,
    interrupted,
  }, null, 2)}\n`);
}

type Options = { candidatePaths: string[]; outputPath: string; dryRun: boolean; replayHistory?: string };

function parseOptions(): Options {
  const args = Bun.argv.slice(2);
  const candidatePaths: string[] = [];
  let outputPath = requireScratchPath(`scratch/profile-diagnostics/${timestamp()}`);
  let dryRun = false;
  let replayHistory: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--replay-history") {
      const value = args[++index];
      if (!value) fail("--replay-history requires a profile-diagnostics directory");
      replayHistory = resolve(value);
      continue;
    }
    if (arg === "--output") {
      const value = args[++index];
      if (!value) fail("--output requires a directory");
      outputPath = requireScratchPath(value);
      continue;
    }
    candidatePaths.push(resolve(workspaceRoot, arg));
  }

  if (candidatePaths.length === 0) {
    fail("Usage: bun run src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts <candidate-path>... [--output <dir>] [--dry-run|--replay-history <history-dir>]");
  }
  if (dryRun && replayHistory) fail("--dry-run cannot be combined with --replay-history");
  return { candidatePaths, outputPath, dryRun, replayHistory };
}

if (import.meta.path === process.argv[1]) {
const options = parseOptions();
const declaredConditions: InjectionConditionId[] = ["baseline", "oracle-practice", "irrelevant-practice"];
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });

const entries: DiagnosticEntry[] = [];

if (options.replayHistory) {
  await mkdir(options.outputPath, { recursive: true });
  const commit = await evaluatorSourceCommit();
  const replayEntries: HistoricalReplayEntry[] = [];
  for (const candidatePath of options.candidatePaths) {
    const manifest = await verifyCandidateDeclaration(candidatePath);
    const conditions = await readYaml<Conditions>(resolve(candidatePath, "private/conditions.yaml"), "private/conditions.yaml");
    const repetitions = repetitionsFromConditions(conditions);
    replayEntries.push(...await replayCandidateHistory(options.replayHistory, candidatePath, manifest, repetitions, commit));
    await writeHistoricalReplaySummary(options.outputPath, replayEntries, commit);
  }
  const decisions = await writeHistoricalReplaySummary(options.outputPath, replayEntries, commit);
  console.log(JSON.stringify({ output: relativePath(options.outputPath), entries: replayEntries.length, decisions }, null, 2));
  process.exit(replayEntries.some((entry) => entry.evaluation_status !== "evaluated") ? 1 : 0);
}

if (options.dryRun) {
  const plan = [];
  for (const candidatePath of options.candidatePaths) {
    const manifest = await verifyCandidateDeclaration(candidatePath);
    const conditions = await readYaml<Conditions>(resolve(candidatePath, "private/conditions.yaml"), "private/conditions.yaml");
    for (const conditionId of declaredConditions) {
      for (let repeat = 1; repeat <= conditions.shared_execution.repetitions; repeat += 1) {
        plan.push({ candidate: manifest.id, condition: conditionId, repeat });
      }
    }
  }
  console.log(JSON.stringify({ schema_version: "profile-diagnostic-plan/v1", planned_runs: plan, output: relativePath(options.outputPath) }, null, 2));
  process.exit(0);
}

if (Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Profile diagnostics require LORELUM_LOCAL_EXPERIMENT=1");

await mkdir(options.outputPath, { recursive: true });
const command = await piCommand(workspaceRoot);

for (const candidatePath of options.candidatePaths) {
  if (interrupted) break;
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
    await writeSummary(options.outputPath, entries, interrupted);
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
    await writeSummary(options.outputPath, entries, interrupted);
    continue;
  }

  for (const conditionId of declaredConditions) {
    if (interrupted) break;
    for (let repeat = 1; repeat <= conditions.shared_execution.repetitions; repeat += 1) {
      if (interrupted) break;
      try {
        const entry = await runAttempt(
          options.outputPath, candidatePath, manifest.id, manifest,
          snapshotId, profileInputHash, profile, conditionId, repeat,
          conditions.shared_execution, command
        );
        entries.push(entry);
      } catch (error) {
        entries.push({
          candidate: manifest.id,
          condition: conditionId,
          repeat,
          evaluation_status: "execution-failed",
          trace: { condition_id: conditionId, channel: "none", profile_input_hash: profileInputHash },
          source_commit: manifest.source.source_commit,
          snapshot_id: snapshotId,
          profile_input_hash: profileInputHash,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await writeSummary(options.outputPath, entries, interrupted);
    }
  }
}

await writeSummary(options.outputPath, entries, interrupted);
console.log(JSON.stringify({ output: relativePath(options.outputPath), entries: entries.length, interrupted }, null, 2));
process.exit(interrupted || entries.some((entry) => entry.evaluation_status !== "evaluated") ? 1 : 0);
}
