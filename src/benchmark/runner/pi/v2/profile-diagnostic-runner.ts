import { cp, lstat, mkdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { joinPath, relativePath, sha256Directory, sha256File, workspaceRoot } from "../../../fs";
import * as v1Runtime from "../../../kernel/profiles/injection-calibration/v1/runtime";
import * as v2Runtime from "../../../kernel/profiles/injection-calibration/v2/runtime";
import { resolveRuntimeClosureIfDeclared } from "../../../evaluator/runtime-closure";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";

export type RunnerPracticePayload = {
  condition_id: InjectionConditionId;
  channel: string;
  practice?: { id: string; version: string; sha256: string; text: string; delivery_template?: string; target_path?: string };
};
export type ResolvedProfile = { profile_input_hash: string };
type RuntimeModule = {
  resolveInjectionCalibration: (candidatePath: string) => Promise<ResolvedProfile>;
  resolvePracticePayload: (candidatePath: string, profile: ResolvedProfile, conditionId: InjectionConditionId) => Promise<RunnerPracticePayload>;
  redactedInjectionTrace: (profile: ResolvedProfile, payload: RunnerPracticePayload) => ReturnType<typeof v1Runtime.redactedInjectionTrace>;
};
export const injectionProfiles = ["injection-calibration/v1", "injection-calibration/v2"] as const;
export function runtimeFor(profile: string): RuntimeModule {
  return (profile === "injection-calibration/v2" ? v2Runtime : v1Runtime) as unknown as RuntimeModule;
}
import { fail, piCommand, preflightPiAndModel, run, type CommandResult } from "./preflight";
import { allocateFreePort, realWebServerStarter, type WebServerStarter } from "./webserver-supervisor";
import { buildSchedule, diagnosticConditions, readDiagnosticPlan, summarizePlan, type DiagnosticPlan, type ScheduledAttempt } from "./profile-diagnostic-plan";

const scratchRoot = resolve(workspaceRoot, "scratch");
const publicDependencyProvisioningTimeoutMs = 120_000;

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
  | "invalid-evaluator-output"
  | "evaluator-runtime-closure-unverified";

export type HistoricalReplayEntry = Omit<DiagnosticEntry, "error" | "block" | "planned_position" | "actual_execution_position"> & {
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
  calibration_status: "passed" | "failed" | "not-verified";
  leakage_audit_status: "passed" | "failed" | "not-verified";
  conditions: Record<"baseline" | "oracle-practice" | "irrelevant-practice", ConditionReplayCounts>;
};

type AuditStatus = "passed" | "failed" | "not-verified";
type CandidateReplayAudits = Record<string, { calibration: AuditStatus; leakage: AuditStatus }>;

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
  if (core !== "v1" || !injectionProfiles.includes(profile as (typeof injectionProfiles)[number]) || materializer_kind !== "react-vite") {
    fail(`Candidate does not declare core/v1 + injection-calibration/v1|v2 + react-vite: ${relativePath(candidatePath)}`);
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
  const profile = await runtimeFor(manifest.kernel.profile).resolveInjectionCalibration(candidatePath);
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

const replayConditionIds = ["baseline", "oracle-practice", "irrelevant-practice"] as const;
const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{7,64}$/;
const identifierPattern = /^[A-Za-z0-9._-]+$/;
const replayReasons = new Set<ReplayReason>([
  "candidate-validation-failed", "invalid-history-summary", "missing-history-summary", "missing-workspace",
  "ambiguous-workspace", "workspace-outside-history-root", "workspace-integrity-unavailable",
  "workspace-modified-during-replay", "evaluator-execution-failed", "evaluator-timed-out", "invalid-evaluator-output",
]);

function isReplayCondition(value: unknown): value is (typeof replayConditionIds)[number] {
  return typeof value === "string" && (replayConditionIds as readonly string[]).includes(value);
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function safeTrace(value: unknown, condition: InjectionConditionId, profileInputHash: string): ReturnType<typeof redactedInjectionTrace> | undefined {
  if (!isRecord(value) || value.condition_id !== condition || value.profile_input_hash !== profileInputHash || typeof value.channel !== "string") return undefined;
  if (value.channel !== "none" && value.channel !== "condition-scoped-private-runtime") return undefined;
  const trace: ReturnType<typeof redactedInjectionTrace> = { condition_id: condition, channel: value.channel, profile_input_hash: profileInputHash };
  for (const field of ["practice_id", "practice_version", "practice_sha256"] as const) {
    if (value[field] === undefined) continue;
    if (field === "practice_sha256" ? !hashPattern.test(String(value[field])) : !safeIdentifier(value[field])) return undefined;
    Object.assign(trace, { [field]: value[field] });
  }
  return trace;
}

export function parseHistoricalSummary(value: unknown, candidateId: string): HistoricalSummaryEntry[] {
  if (!isRecord(value) || value.schema_version !== "profile-diagnostic-summary/v1" || !Array.isArray(value.entries)) throw new Error("invalid-history-summary");
  const entries: HistoricalSummaryEntry[] = [];
  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (!isRecord(entry) || entry.candidate !== candidateId || !isReplayCondition(entry.condition) || !Number.isInteger(entry.repeat) || (entry.repeat as number) < 1) throw new Error("invalid-history-summary");
    if (!commitPattern.test(String(entry.source_commit)) || !hashPattern.test(String(entry.snapshot_id)) || !hashPattern.test(String(entry.profile_input_hash))) throw new Error("invalid-history-summary");
    const trace = safeTrace(entry.trace, entry.condition, entry.profile_input_hash as string);
    const key = `${entry.condition}\0${entry.repeat}`;
    if (!trace || keys.has(key)) throw new Error("invalid-history-summary");
    keys.add(key);
    entries.push({ candidate: candidateId, condition: entry.condition, repeat: entry.repeat as number, trace, source_commit: entry.source_commit as string, snapshot_id: entry.snapshot_id as string, profile_input_hash: entry.profile_input_hash as string });
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

function fallbackReplayEntries(candidateId: string, repetitions: number, evaluatorSourceCommit: string, reason: ReplayReason): HistoricalReplayEntry[] {
  return expectedHistoricalEntries(candidateId, repetitions).map((entry) => ({ ...entry, trace: unknownTrace(entry.condition), source_commit: "unknown", snapshot_id: "unknown", profile_input_hash: "unknown", evaluation_status: "not-executable", evaluator_source_commit: evaluatorSourceCommit, replay_reason: reason }));
}

function pathInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

async function historicalWorkspace(historyRoot: string, entry: HistoricalSummaryEntry): Promise<{ app: string; workspace: string }> {
  const root = await realpath(historyRoot);
  const candidateRoot = resolve(root, entry.candidate);
  if (!pathInside(root, candidateRoot)) throw new Error("workspace-outside-history-root");
  const locations = [
    resolve(candidateRoot, entry.condition, `attempt-${entry.repeat}`, "workspace", "app"),
    resolve(candidateRoot, entry.candidate, entry.condition, `attempt-${entry.repeat}`, "workspace", "app"),
  ];
  const found = [...new Set((await Promise.all(locations.map((location) => realpath(location).catch(() => undefined)))).filter((location): location is string => Boolean(location)))];
  if (found.length === 0) throw new Error("missing-workspace");
  if (found.length > 1) throw new Error("ambiguous-workspace");
  const app = found[0];
  const workspace = await realpath(dirname(app));
  if (!pathInside(root, app) || !pathInside(root, workspace)) throw new Error("workspace-outside-history-root");
  const [appStat, workspaceStat] = await Promise.all([lstat(app), lstat(workspace)]);
  if (!appStat.isDirectory() || appStat.isSymbolicLink() || !workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) throw new Error("missing-workspace");
  return { app, workspace };
}

function replayEntry(entry: HistoricalSummaryEntry, evaluatorSourceCommit: string, status: HistoricalReplayEntry["evaluation_status"], reason?: ReplayReason): HistoricalReplayEntry {
  return { ...entry, evaluator_source_commit: evaluatorSourceCommit, evaluation_status: status, ...(reason ? { replay_reason: reason } : {}) };
}

export async function replayHistoricalWorkspace(historyRoot: string, candidatePath: string, entry: HistoricalSummaryEntry, evaluatorSourceCommit: string, evaluatorTimeoutMs: number): Promise<HistoricalReplayEntry> {
  let app: string;
  let workspace: string;
  let before: string;
  try {
    ({ app, workspace } = await historicalWorkspace(historyRoot, entry));
    before = await sha256Directory(workspace);
  } catch (error) {
    const reason = error instanceof Error && replayReasons.has(error.message as ReplayReason) ? error.message as ReplayReason : "workspace-integrity-unavailable";
    return replayEntry(entry, evaluatorSourceCommit, "not-executable", reason);
  }
  const closureEnv = await evaluatorClosureEnv(candidatePath, entry.candidate);
  if (closureEnv.error) return replayEntry(entry, evaluatorSourceCommit, "execution-failed", closureEnv.error);
  let evaluation: CommandResult;
  try {
    evaluation = await run([process.execPath, "run", resolve(candidatePath, "private/evaluator/evaluate.ts"), app], candidatePath, evaluatorTimeoutMs, closureEnv.env);
  } catch {
    return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "evaluator-execution-failed");
  }
  try {
    if (before !== await sha256Directory(workspace)) return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "workspace-modified-during-replay");
  } catch {
    return replayEntry(entry, evaluatorSourceCommit, "execution-failed", "workspace-integrity-unavailable");
  }
  const classified = classifyEvaluatorResult(evaluation);
  if (classified.evaluation_status !== "evaluated") {
    const reason: ReplayReason = classified.error === "evaluator-timed-out" ? "evaluator-timed-out" : classified.error === "evaluator-invalid-output" ? "invalid-evaluator-output" : "evaluator-execution-failed";
    return replayEntry(entry, evaluatorSourceCommit, classified.evaluation_status, reason);
  }
  return { ...replayEntry(entry, evaluatorSourceCommit, "evaluated"), semantic: classified.semantic, practice_observation: classified.practice_observation, ...(classified.observation_reason ? { observation_reason: classified.observation_reason } : {}), joint_pass: classified.joint_pass };
}

function emptyConditionCounts(): ConditionReplayCounts {
  return { planned: 0, evaluated: 0, semantic: { pass: 0, fail: 0, "not-run": 0 }, practice_observation: { observed: 0, "not-observed": 0, indeterminate: 0, "not-run": 0 }, joint_pass: 0 };
}

export function expansionDecisions(entries: HistoricalReplayEntry[], audits: CandidateReplayAudits = {}): CandidateExpansionDecision[] {
  const groups = new Map<string, HistoricalReplayEntry[]>();
  const plannedKeysByCandidate = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = `${entry.candidate}\0${entry.profile_input_hash}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
    const plannedKey = `${entry.condition}\0${entry.repeat}`;
    plannedKeysByCandidate.set(entry.candidate, new Set([...(plannedKeysByCandidate.get(entry.candidate) ?? []), plannedKey]));
  }
  return [...groups.values()].map((group) => {
    const conditions = Object.fromEntries(replayConditionIds.map((condition) => [condition, emptyConditionCounts()])) as CandidateExpansionDecision["conditions"];
    for (const entry of group) {
      if (!isReplayCondition(entry.condition)) continue;
      const counts = conditions[entry.condition];
      counts.planned += 1;
      if (entry.evaluation_status === "evaluated") counts.evaluated += 1;
      if (entry.semantic && entry.semantic in counts.semantic) counts.semantic[entry.semantic as keyof typeof counts.semantic] += 1;
      if (entry.practice_observation) counts.practice_observation[entry.practice_observation] += 1;
      if (entry.joint_pass) counts.joint_pass += 1;
    }
    const audit = audits[group[0].candidate] ?? { calibration: "not-verified" as const, leakage: "not-verified" as const };
    const plannedKeys = plannedKeysByCandidate.get(group[0].candidate)!;
    const groupKeys = new Set(group.map((entry) => `${entry.condition}\0${entry.repeat}`));
    const completeDenominator = group.length === plannedKeys.size && groupKeys.size === plannedKeys.size && [...plannedKeys].every((key) => groupKeys.has(key));
    const unhealthy = group.some((entry) => entry.evaluation_status !== "evaluated");
    const indeterminate = group.some((entry) => entry.practice_observation === "indeterminate" || entry.practice_observation === "not-run");
    const strictLead = conditions["oracle-practice"].joint_pass > conditions.baseline.joint_pass && conditions["oracle-practice"].joint_pass > conditions["irrelevant-practice"].joint_pass;
    return { candidate: group[0].candidate, profile_input_hash: group[0].profile_input_hash, status: !completeDenominator || unhealthy || audit.calibration !== "passed" || audit.leakage !== "passed" ? "indeterminate" : indeterminate || !strictLead ? "adjust-before-expansion" : "eligible-for-expansion", calibration_status: audit.calibration, leakage_audit_status: audit.leakage, conditions };
  }).sort((left, right) => left.candidate.localeCompare(right.candidate) || left.profile_input_hash.localeCompare(right.profile_input_hash));
}

export async function evaluatorSourceCommit(): Promise<string> {
  const result = await run(["git", "rev-parse", "HEAD"], workspaceRoot);
  const commit = result.stdout.trim();
  if (result.code !== 0 || !commitPattern.test(commit)) fail("Unable to determine current evaluator Git commit");
  return commit;
}

export async function writeHistoricalReplaySummary(path: string, entries: HistoricalReplayEntry[], evaluatorCommit: string, audits: CandidateReplayAudits = {}): Promise<CandidateExpansionDecision[]> {
  const decisions = expansionDecisions(entries, audits);
  const qualifiedCandidates = decisions.filter((decision) => decision.status === "eligible-for-expansion").map(({ candidate, profile_input_hash }) => ({ candidate, profile_input_hash }));
  await Bun.write(joinPath(path, "summary.json"), `${JSON.stringify({ schema_version: "profile-diagnostic-summary/v2", kind: "historical-evaluator-replay", generated_at: new Date().toISOString(), evaluator_source_commit: evaluatorCommit, entries, decisions, qualified_candidates: qualifiedCandidates, next_action: qualifiedCandidates.length > 0 ? "expand-qualified-candidates" : "pause-for-adjustment" }, null, 2)}\n`);
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

async function replayCandidateHistory(historyRoot: string, candidatePath: string, manifest: CandidateManifest, repetitions: number, evaluatorCommit: string): Promise<HistoricalReplayEntry[]> {
  try {
    const root = resolve(historyRoot);
    const summaryPath = resolve(root, manifest.id, "summary.json");
    if (!pathInside(root, summaryPath)) throw new Error("invalid-history-summary");
    const summary = Bun.file(summaryPath);
    if (!(await summary.exists())) throw new Error("missing-history-summary");
    const entries = parseHistoricalSummary(JSON.parse(await summary.text()), manifest.id);
    const expected = expectedHistoricalEntries(manifest.id, repetitions);
    const actual = new Set(entries.map((entry) => `${entry.condition}\0${entry.repeat}`));
    if (entries.length !== expected.length || expected.some((entry) => !actual.has(`${entry.condition}\0${entry.repeat}`))) throw new Error("invalid-history-summary");
    return await Promise.all(entries.sort((left, right) => left.condition.localeCompare(right.condition) || left.repeat - right.repeat).map((entry) => replayHistoricalWorkspace(historyRoot, candidatePath, entry, evaluatorCommit, 10 * 60_000)));
  } catch (error) {
    return fallbackReplayEntries(manifest.id, repetitions, evaluatorCommit, replayReason(error, "invalid-history-summary"));
  }
}

export function piArgs(modelId: string, payload: RunnerPracticePayload): string[] {
  const args = [
    "--print", "--no-session", "--no-context-files", "--no-extensions",
    "--no-skills", "--no-prompt-templates",
    "--tools", "read,bash,edit,write,grep,find,ls",
    "--model", modelId,
    "@task.md",
    "Complete the coding task. Work only inside app/."
  ];
  if (payload.practice && payload.practice.delivery_template !== "project-convention/v1") {
    args.push("--append-system-prompt", `Apply this Practice while completing the task:\n\n${payload.practice.text}`);
  }
  return args;
}

/** Writes a project-convention Practice into the agent workspace as a doc file (oracle/irrelevant only). */
export async function materializeConventionDoc(workspace: string, payload: RunnerPracticePayload): Promise<void> {
  const practice = payload.practice;
  if (!practice || practice.delivery_template !== "project-convention/v1" || !practice.target_path) return;
  const appRoot = resolve(workspace, "app");
  const target = resolve(appRoot, practice.target_path);
  const fromApp = relative(appRoot, target);
  if (fromApp === "" || fromApp.startsWith("..") || isAbsolute(fromApp)) fail(`Convention target escapes the app workspace: ${practice.target_path}`);
  await mkdir(dirname(target), { recursive: true });
  await Bun.write(target, practice.text);
}


async function evaluatorClosureEnv(candidatePath: string, manifestId: string): Promise<{ env: Record<string, string>; error: null } | { env: null; error: "evaluator-runtime-closure-unverified" }> {
  try {
    const closure = await resolveRuntimeClosureIfDeclared(candidatePath, manifestId);
    return { env: closure ? { LORELUM_EVALUATOR_RUNTIME_CLOSURE_ROOT: closure.resolution_root } : {}, error: null };
  } catch {
    return { env: null, error: "evaluator-runtime-closure-unverified" };
  }
}

type AttemptCommandRunner = (command: string[], cwd: string, timeoutMs?: number, env?: Record<string, string>) => Promise<CommandResult>;

type PublicDependencyInputs = {
  appWorkspace: string;
  packageJsonPath: string;
  bunLockPath: string;
  packageJsonHash: string;
  bunLockHash: string;
  stagingWorkspace: string;
};

async function regularFileHash(path: string): Promise<string> {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("public-dependency-input-is-not-a-regular-file");
  return sha256File(path);
}

export async function capturePublicDependencyInputs(appWorkspace: string, stagingWorkspace: string): Promise<PublicDependencyInputs> {
  const packageJsonPath = resolve(appWorkspace, "package.json");
  const bunLockPath = resolve(appWorkspace, "bun.lock");
  const [packageJsonHash, bunLockHash] = await Promise.all([regularFileHash(packageJsonPath), regularFileHash(bunLockPath)]);
  await mkdir(stagingWorkspace, { recursive: true });
  await Promise.all([
    cp(packageJsonPath, resolve(stagingWorkspace, "package.json")),
    cp(bunLockPath, resolve(stagingWorkspace, "bun.lock")),
  ]);
  return { appWorkspace, packageJsonPath, bunLockPath, packageJsonHash, bunLockHash, stagingWorkspace };
}

export async function provisionPublicWorkspaceDependencies(
  inputs: PublicDependencyInputs,
  commandRunner: AttemptCommandRunner = run
): Promise<"provisioned" | "public-dependency-inputs-modified" | "public-dependency-provisioning-failed" | "public-dependency-provisioning-timed-out"> {
  try {
    const [packageJsonHash, bunLockHash] = await Promise.all([regularFileHash(inputs.packageJsonPath), regularFileHash(inputs.bunLockPath)]);
    if (packageJsonHash !== inputs.packageJsonHash || bunLockHash !== inputs.bunLockHash) return "public-dependency-inputs-modified";
    const provisioning = await commandRunner(
      [process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"],
      inputs.stagingWorkspace,
      publicDependencyProvisioningTimeoutMs
    );
    if (provisioning.timedOut) return "public-dependency-provisioning-timed-out";
    if (provisioning.code !== 0) return "public-dependency-provisioning-failed";
    const stagedNodeModules = resolve(inputs.stagingWorkspace, "node_modules");
    await rm(resolve(inputs.appWorkspace, "node_modules"), { force: true, recursive: true });
    await cp(stagedNodeModules, resolve(inputs.appWorkspace, "node_modules"), { recursive: true });
    return "provisioned";
  } catch {
    return "public-dependency-provisioning-failed";
  }
}

export async function runAttempt(
  outputPath: string,
  candidatePath: string,
  candidateId: string,
  manifest: CandidateManifest,
  snapshotId: string,
  profileInputHash: string,
  profile: ResolvedProfile,
  conditionId: InjectionConditionId,
  repeat: number,
  shared: SharedExecution,
  command: string,
  commandRunner: AttemptCommandRunner = run,
  serverStarter: WebServerStarter = realWebServerStarter
): Promise<DiagnosticEntry> {
  const attemptPath = resolve(outputPath, candidateId, conditionId, `attempt-${repeat}`);
  const workspace = resolve(attemptPath, "workspace");
  await mkdir(attemptPath, { recursive: true });

  await copyPublicWorkspace(candidatePath, workspace);
  const initialFiles = await workspaceFiles(workspace);
  if (initialFiles.some((file) => file.includes("private/") || file.includes("practices/"))) {
    fail(`Private material was copied into an agent workspace: ${relativePath(workspace)}`);
  }

  const runtime = runtimeFor(manifest.kernel.profile);
  const payload = await runtime.resolvePracticePayload(candidatePath, profile, conditionId);
  const trace = runtime.redactedInjectionTrace(profile, payload);
  await materializeConventionDoc(workspace, payload);

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

  let dependencyInputs: PublicDependencyInputs;
  try {
    dependencyInputs = await capturePublicDependencyInputs(resolve(workspace, "app"), resolve(attemptPath, "provisioning-inputs"));
  } catch {
    entry.error = "public-dependency-inputs-unavailable";
    return entry;
  }

  const pi = await commandRunner([command, ...piArgs(shared.model.id, payload)], workspace, shared.budget.max_duration_minutes * 60_000);
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  if (pi.code !== 0 || pi.timedOut) {
    entry.error = pi.timedOut ? "Pi timed out" : `Pi failed with exit code ${pi.code ?? "unknown"}`;
    return entry;
  }

  const provisioning = await provisionPublicWorkspaceDependencies(dependencyInputs, commandRunner);
  if (provisioning !== "provisioned") {
    entry.error = provisioning;
    return entry;
  }

  const closureEnv = await evaluatorClosureEnv(candidatePath, candidateId);
  if (closureEnv.error) {
    entry.error = closureEnv.error;
    return entry;
  }
  let port: number;
  try {
    port = await allocateFreePort();
  } catch {
    entry.error = "evaluator-server-port-unavailable";
    return entry;
  }
  // TOCTOU mitigation: the free port can be taken between allocation and
  // bind, so retry once with a fresh port before failing closed.
  let server = await serverStarter(resolve(workspace, "app"), port);
  if (!server.ok) {
    try {
      port = await allocateFreePort();
    } catch {
      entry.error = "evaluator-server-port-unavailable";
      return entry;
    }
    server = await serverStarter(resolve(workspace, "app"), port);
    if (!server.ok) {
      entry.error = server.category;
      return entry;
    }
  }
  let evaluation: CommandResult;
  let cleanupConfirmed = false;
  try {
    evaluation = await commandRunner(
      [process.execPath, "run", resolve(candidatePath, "private/evaluator/evaluate.ts"), resolve(workspace, "app")],
      candidatePath,
      shared.budget.max_duration_minutes * 60_000,
      { ...closureEnv.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${server.handle.port}` }
    );
  } catch {
    cleanupConfirmed = await server.handle.stop();
    entry.error = cleanupConfirmed ? "evaluator-launch-failed" : "evaluator-launch-failed; evaluator-cleanup-unverified";
    return entry;
  } finally {
    if (!cleanupConfirmed) cleanupConfirmed = await server.handle.stop();
  }
  await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluation.stdout);
  await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluation.stderr);
  if (!cleanupConfirmed) {
    entry.error = "evaluator-cleanup-unverified";
    return entry;
  }
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
    plan: { id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions, ...(plan.execution_gate ? { execution_gate: plan.execution_gate } : {}), schedule: redactedSchedule(schedule) },
    entries,
    report: summarizePlan(plan, schedule, entries),
    interrupted,
  }, null, 2)}\n`);
}

type Options = {
  planPath?: string;
  candidatePaths: string[];
  outputPath: string;
  dryRun: boolean;
  replayHistory?: string;
  calibrationAudits: Record<string, AuditStatus>;
  leakageAudits: Record<string, AuditStatus>;
};

function parseAuditOption(value: string | undefined, label: string, audits: Record<string, AuditStatus>): void {
  const [candidate, status, extra] = value?.split("=") ?? [];
  if (!candidate || !safeIdentifier(candidate) || !status || extra || !(["passed", "failed"] as string[]).includes(status)) fail(`${label} requires <candidate>=passed|failed`);
  if (audits[candidate] !== undefined) fail(`${label} may be specified once per candidate`);
  audits[candidate] = status as AuditStatus;
}

function parseOptions(): Options {
  const args = Bun.argv.slice(2);
  let planPath: string | undefined;
  const candidatePaths: string[] = [];
  let outputPath = requireScratchPath(`scratch/profile-diagnostics/${timestamp()}`);
  let dryRun = false;
  let replayHistory: string | undefined;
  const calibrationAudits: Record<string, AuditStatus> = {};
  const leakageAudits: Record<string, AuditStatus> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--replay-history") {
      const value = args[++index];
      if (!value) fail("--replay-history requires a profile-diagnostics directory");
      replayHistory = resolve(value);
      continue;
    }
    if (arg === "--calibration-audit") {
      parseAuditOption(args[++index], "--calibration-audit", calibrationAudits);
      continue;
    }
    if (arg === "--leakage-audit") {
      parseAuditOption(args[++index], "--leakage-audit", leakageAudits);
      continue;
    }
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
    if (arg.startsWith("--")) fail(`Unknown profile diagnostic option: ${arg}`);
    candidatePaths.push(resolve(workspaceRoot, arg));
  }

  if (planPath && replayHistory) fail("--plan cannot be combined with --replay-history");
  if (dryRun && replayHistory) fail("--dry-run cannot be combined with --replay-history");
  if (replayHistory && candidatePaths.length === 0) fail("Historical replay requires at least one candidate path");
  if (!replayHistory && (!planPath || candidatePaths.length > 0)) fail("Usage: bun run src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts --plan <plan.yaml> [--output <dir>] [--dry-run]");
  return { planPath, candidatePaths, outputPath, dryRun, replayHistory, calibrationAudits, leakageAudits };
}

if (import.meta.path === process.argv[1]) {
const options = parseOptions();
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });

const entries: DiagnosticEntry[] = [];
if (options.replayHistory) {
  await mkdir(options.outputPath, { recursive: true });
  const commit = await evaluatorSourceCommit();
  const replayEntries: HistoricalReplayEntry[] = [];
  const audits: CandidateReplayAudits = {};
  for (const candidatePath of options.candidatePaths) {
    const manifest = await verifyCandidateDeclaration(candidatePath);
    const conditions = await readYaml<Conditions>(resolve(candidatePath, "private/conditions.yaml"), "private/conditions.yaml");
    audits[manifest.id] = {
      calibration: options.calibrationAudits[manifest.id] ?? "not-verified",
      leakage: options.leakageAudits[manifest.id] ?? "not-verified",
    };
    replayEntries.push(...await replayCandidateHistory(options.replayHistory, candidatePath, manifest, repetitionsFromConditions(conditions), commit));
    await writeHistoricalReplaySummary(options.outputPath, replayEntries, commit, audits);
  }
  const decisions = await writeHistoricalReplaySummary(options.outputPath, replayEntries, commit, audits);
  console.log(JSON.stringify({ output: diagnosticOutputPath(options.outputPath), entries: replayEntries.length, decisions }, null, 2));
  process.exit(replayEntries.some((entry) => entry.evaluation_status !== "evaluated") ? 1 : 0);
}

if (!options.planPath) fail("A diagnostic plan is required outside historical replay mode");
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
  console.log(JSON.stringify({ schema_version: "profile-diagnostic-plan/v2", plan: { id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions, ...(plan.execution_gate ? { execution_gate: plan.execution_gate } : {}) }, planned_runs: redactedSchedule(schedule), output: diagnosticOutputPath(options.outputPath) }, null, 2));
  process.exit(0);
}

if (Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Profile diagnostics require LORELUM_LOCAL_EXPERIMENT=1");

const command = await piCommand(workspaceRoot);

await mkdir(options.outputPath, { recursive: true });
await Bun.write(joinPath(options.outputPath, "plan.json"), `${JSON.stringify({ schema_version: "profile-diagnostic-plan/v2", id: plan.id, schedule_seed: plan.schedule_seed, schedule_algorithm: plan.schedule_algorithm, repetitions: plan.repetitions, ...(plan.execution_gate ? { execution_gate: plan.execution_gate } : {}), schedule: redactedSchedule(schedule) }, null, 2)}\n`);

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
    profile = await runtimeFor(manifest.kernel.profile).resolveInjectionCalibration(candidatePath);
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
    await preflightPiAndModel(command, conditions.shared_execution.model.id);
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
