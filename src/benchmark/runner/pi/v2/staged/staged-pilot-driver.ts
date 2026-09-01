import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { workspaceRoot } from "../../../../fs";
import { resolveTwoStageInjectionCalibration, resolveTwoStagePracticePayload, redactedTwoStageTrace } from "../../../../kernel/profiles/two-stage-injection-calibration/v1/runtime";
import type { RedactedTwoStageTrace, ResolvedTwoStageProfile } from "../../../../kernel/profiles/two-stage-injection-calibration/v1/types";
import { configureLocalPiModelCatalog, localPiApiKey } from "../local-pi-model-catalog";
import { piCommand, preflightPiAndModel, run } from "../preflight";
import { demonstrateTimeoutTermination, productionStagedPiAdapter, productionStagedSemanticAdapter, type StagedPilotPiConfig } from "./staged-pilot-pi-adapter";
import { buildStagedSchedule, parseStagedDiagnosticPlan, stagedConditions, type ScheduledStagedAttempt } from "./staged-profile-diagnostic-plan";
import { runStagedDiagnosticAttempt, summarizeStagedReports, type StagedAttemptReport } from "./staged-profile-diagnostic-runner";

export const stagedPilotCandidate = "incubator/practice-injection/llm-provider-gateway-v4";
export const stagedPilotScheduleSeed = "llm-provider-gateway-v4-one-block-model-pilot/v1";
const stagedPilotTools = "read,bash,edit,write,grep,find,ls";
const semanticTimeoutMs = 10 * 60_000;
const stageInstruction: Record<1 | 2, string> = {
  1: "Complete the Stage 1 coding task described in @task.md. Work only inside app/.",
  2: "Complete the Stage 2 maintenance change described in @task.md. Work only inside app/ and preserve the public API and accounting semantics.",
};

type CandidateFacts = {
  candidate_path: string;
  source_commit: string;
  snapshot_id: string;
  profile: ResolvedTwoStageProfile;
  pi_version: string;
  model: string;
  stage_budget_ms: Record<1 | 2, number>;
  calibration_qualified: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function inspectStagedPilotCandidate(): Promise<CandidateFacts> {
  const candidatePath = resolve(workspaceRoot, stagedPilotCandidate);
  const manifest = Bun.YAML.parse(await Bun.file(join(candidatePath, "private/candidate.yaml")).text()) as unknown;
  const snapshot = JSON.parse(await Bun.file(join(candidatePath, "private/snapshot.json")).text()) as unknown;
  const conditions = Bun.YAML.parse(await Bun.file(join(candidatePath, "private/conditions.yaml")).text()) as unknown;
  const calibration = JSON.parse(await Bun.file(join(candidatePath, "private/calibration/results.json")).text()) as unknown;
  if (!isRecord(manifest) || !isRecord(snapshot) || !isRecord(conditions) || !isRecord(calibration)) fail("v4 candidate manifests must be objects");
  const source = isRecord(manifest.source) && typeof manifest.source.source_commit === "string" ? manifest.source.source_commit : fail("candidate.yaml must declare source.source_commit");
  if (manifest.source_commit !== source) fail("candidate.yaml source_commit declarations disagree");
  if (typeof snapshot.snapshot_id !== "string" || !/^[0-9a-f]{64}$/.test(snapshot.snapshot_id)) fail("snapshot.json must declare a sha256 snapshot_id");
  if (calibration.qualified !== true || calibration.candidate_model_calls !== 0 || calibration.judge_model_calls !== 0) fail("offline calibration must be qualified with zero recorded model calls");
  const shared = isRecord(conditions.shared_execution) ? conditions.shared_execution : fail("conditions.yaml must declare shared_execution");
  const budgets = isRecord(shared.budgets) ? shared.budgets : fail("shared_execution must declare budgets");
  const model = isRecord(shared.model) && typeof shared.model.id === "string" ? shared.model.id : fail("shared_execution must declare a model id");
  const stage1Minutes = Number(budgets.stage_1_max_duration_minutes);
  const stage2Minutes = Number(budgets.stage_2_max_duration_minutes);
  if (stage1Minutes !== 15 || stage2Minutes !== 15 || budgets.evaluator_time_counted !== false) fail("shared budgets must be 15+15 minutes with evaluator time excluded");
  if (shared.judge !== "none") fail("pilot requires a judge-free condition contract");
  const profile = await resolveTwoStageInjectionCalibration(candidatePath);
  return {
    candidate_path: candidatePath,
    source_commit: source,
    snapshot_id: snapshot.snapshot_id,
    profile,
    pi_version: String(shared.pi_version ?? ""),
    model,
    stage_budget_ms: { 1: stage1Minutes * 60_000, 2: stage2Minutes * 60_000 },
    calibration_qualified: true,
  };
}

export function stagedPilotPlan(facts: CandidateFacts, blocks = 1): ScheduledStagedAttempt[] {
  if (!Number.isInteger(blocks) || blocks < 1) fail("blocks must be a positive integer");
  const schedule = buildStagedSchedule(parseStagedDiagnosticPlan({
    schema_version: "staged-profile-diagnostic-plan/v1",
    id: "llm-provider-gateway-v4-one-block-model-pilot",
    schedule_seed: stagedPilotScheduleSeed,
    schedule_algorithm: "cyclic-latin-square/v1",
    dry_run: false,
    repetitions: 3 * blocks,
    conditions: [...stagedConditions],
    candidates: [{ id: "llm-provider-gateway-v4", path: stagedPilotCandidate, source_commit: facts.source_commit, snapshot_id: facts.snapshot_id, profile_input_hash: facts.profile.profile_input_hash }],
  }));
  if (schedule.length !== 3 * blocks || new Set(schedule.map((attempt) => attempt.condition)).size !== 3) fail("schedule must cover the three conditions");
  for (const condition of stagedConditions) {
    if (schedule.filter((attempt) => attempt.condition === condition).length !== blocks) fail(`schedule must repeat each condition exactly ${blocks} times`);
  }
  return schedule;
}

export type StagedPilotPreflight = {
  schema_version: "staged-pilot-preflight/v1";
  passed: boolean;
  checks: Array<{ id: string; passed: boolean; detail: string }>;
  probe_model_calls: number;
};

export type StagedPilotContext = {
  facts: CandidateFacts;
  attempts: ScheduledStagedAttempt[];
  piConfig: (logDirectory: string) => StagedPilotPiConfig;
  command: string;
};

async function attemptDirectories(outputRoot: string, attempt: ScheduledStagedAttempt, index: number): Promise<{ workspace: string; artifacts: string }> {
  // Workspaces and attempt artifacts live in separate sibling roots so the
  // agent's own `..` does not directly expose transcripts or stage logs. Local
  // Pi has no path sandbox; this keeps private material out of accidental
  // reach without claiming containment.
  const name = `${String(index + 1).padStart(2, "0")}-${attempt.condition}`;
  const workspace = join(outputRoot, "attempt-workspaces", name);
  const artifacts = join(outputRoot, "attempt-artifacts", name);
  await rm(workspace, { recursive: true, force: true });
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(join(artifacts, "sessions"), { recursive: true });
  return { workspace, artifacts };
}

async function runScheduledAttempt(context: StagedPilotContext, attempt: ScheduledStagedAttempt, index: number, outputRoot: string, dryRun: boolean): Promise<StagedAttemptReport> {
  const { workspace, artifacts } = await attemptDirectories(outputRoot, attempt, index);
  const payload = await resolveTwoStagePracticePayload(context.facts.candidate_path, context.facts.profile, attempt.condition);
  const trace: RedactedTwoStageTrace = redactedTwoStageTrace(context.facts.profile, payload);
  const stage1Prompt = await Bun.file(join(context.facts.candidate_path, "public/task.md")).text();
  const stage2Prompt = await Bun.file(join(context.facts.candidate_path, "public/stage-2/task.md")).text();
  try {
    return await runStagedDiagnosticAttempt({
      candidate_path: context.facts.candidate_path,
      workspace,
      artifacts,
      profile: context.facts.profile,
      condition_id: attempt.condition,
      practice_text: payload.practice?.text,
      practice_target_path: payload.practice?.target_path,
      stage_1_prompt: stage1Prompt,
      stage_2_prompt: stage2Prompt,
      dry_run: dryRun,
      pi: productionStagedPiAdapter(context.piConfig(artifacts)),
      semantics: productionStagedSemanticAdapter({ candidate_path: context.facts.candidate_path, evaluator_path: "private/evaluator/evaluate.ts", timeout_ms: semanticTimeoutMs }),
      redacted_trace: trace,
    });
  } catch (error) {
    // Adapter failures (timeout, non-zero exit, missing session header) are execution
    // health failures: the attempt stays in the denominator and is never retried.
    return {
      schema_version: "staged-runner-attempt/v1",
      condition_id: attempt.condition,
      execution_health: "execution-unhealthy",
      stage_1_semantic: "not-run",
      stage_2_semantic: "not-run",
      session_binding: "not-started",
      termination: "pi-execution",
      planned_denominator: 1,
      transcript_in_workspace: false,
      redacted_trace: trace,
      ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
    } as StagedAttemptReport;
  }
}

export async function runStagedPilotPreflight(context: StagedPilotContext, outputRoot: string): Promise<StagedPilotPreflight> {
  const checks: StagedPilotPreflight["checks"] = [];
  const record = async (id: string, probe: () => Promise<string>) => {
    try { checks.push({ id, passed: true, detail: await probe() }); }
    catch (error) { checks.push({ id, passed: false, detail: error instanceof Error ? error.message : String(error) }); }
  };
  await record("candidate-identity", async () => {
    if (!context.facts.calibration_qualified) fail("offline calibration is not qualified");
    return `snapshot ${context.facts.snapshot_id.slice(0, 12)}… profile ${context.facts.profile.profile_input_hash.slice(0, 12)}… commit ${context.facts.source_commit.slice(0, 12)}…`;
  });
  await record("pi-version", async () => {
    const version = await run([context.command, "--version"], workspaceRoot, 90_000);
    if (version.code !== 0 || version.timedOut) fail(`pi --version failed: ${version.stderr.trim()}`);
    if (!version.stdout.includes(context.facts.pi_version)) fail(`pi version ${version.stdout.trim()} does not match declared ${context.facts.pi_version}`);
    return version.stdout.trim();
  });
  await record("credential-present", async () => {
    const present = [Bun.env.LORELUM_PI_API_KEY, Bun.env.LORELUM_JUDGE_API_KEY, Bun.env.DEEPSEEK_API_KEY].some((value) => typeof value === "string" && value.trim().length > 0);
    if (!present) fail("no API credential found in LORELUM_PI_API_KEY / LORELUM_JUDGE_API_KEY / DEEPSEEK_API_KEY");
    return "credential present (value not recorded)";
  });
  await record("endpoint-probe", async () => {
    await preflightPiAndModel(context.command, context.facts.model);
    return "model probe replied";
  });
  await record("timeout-termination", async () => {
    await demonstrateTimeoutTermination();
    return "hung child process terminated within budget";
  });
  await record("dry-run-three-conditions", async () => {
    const reports: StagedAttemptReport[] = [];
    for (const [index, attempt] of context.attempts.entries()) reports.push(await runScheduledAttempt(context, attempt, index, outputRoot, true));
    const unhealthy = reports.filter((report) => report.execution_health !== "dry-run");
    if (unhealthy.length > 0) fail(`dry-run leakage audit failed for ${unhealthy.map((report) => `${report.condition_id}:${report.termination ?? report.execution_health}`).join(", ")}`);
    if (new Set(context.attempts.map((attempt) => attempt.condition)).size !== stagedConditions.length || !stagedConditions.every((id) => context.attempts.some((attempt) => attempt.condition === id))) fail("dry-run schedule does not cover the three conditions exactly once");
    return "three-condition plan materialized with zero model calls";
  });
  return {
    schema_version: "staged-pilot-preflight/v1",
    passed: checks.every((check) => check.passed),
    checks,
    probe_model_calls: 1,
  };
}

export type StagedPilotRun = {
  schema_version: "staged-pilot-run/v1";
  run_id: string;
  schedule_seed: string;
  blocks: number;
  dry_run: boolean;
  preflight: StagedPilotPreflight | null;
  attempts: Array<StagedAttemptReport & { attempt_id: string; error?: string }>;
  summary: ReturnType<typeof summarizeStagedReports>;
  disclaimer: string;
};

export async function executeStagedPilot(options: { mode: "preflight" | "dry-run" | "run"; run_id: string; outputRoot: string; blocks?: number }): Promise<StagedPilotRun> {
  const blocks = options.blocks ?? 1;
  const facts = await inspectStagedPilotCandidate();
  const command = await piCommand(workspaceRoot);
  const context: StagedPilotContext = {
    facts,
    attempts: stagedPilotPlan(facts, blocks),
    command,
    piConfig: (logDirectory) => ({
      command,
      model: facts.model,
      tools: stagedPilotTools,
      stage_budget_ms: facts.stage_budget_ms,
      stage_instruction: stageInstruction,
      log_directory: logDirectory,
    }),
  };
  if (options.mode === "preflight") {
    const preflight = await runStagedPilotPreflight(context, options.outputRoot);
    if (!preflight.passed) fail(`preflight failed: ${preflight.checks.filter((check) => !check.passed).map((check) => `${check.id} (${check.detail})`).join("; ")}`);
    return { schema_version: "staged-pilot-run/v1", run_id: options.run_id, schedule_seed: stagedPilotScheduleSeed, blocks, dry_run: false, preflight, attempts: [], summary: summarizeStagedReports([]), disclaimer: pilotDisclaimer };
  }
  const preflight = options.mode === "run" ? await runStagedPilotPreflight(context, options.outputRoot) : null;
  if (preflight && !preflight.passed) fail(`preflight failed; no model attempts started: ${preflight.checks.filter((check) => !check.passed).map((check) => `${check.id} (${check.detail})`).join("; ")}`);
  const reports: StagedPilotRun["attempts"] = [];
  for (const [index, attempt] of context.attempts.entries()) {
    const report = await runScheduledAttempt(context, attempt, index, options.outputRoot, options.mode === "dry-run");
    reports.push({ ...report, attempt_id: `${options.run_id}-${String(index + 1).padStart(2, "0")}-${attempt.condition}` });
  }
  return {
    schema_version: "staged-pilot-run/v1",
    run_id: options.run_id,
    schedule_seed: stagedPilotScheduleSeed,
    blocks,
    dry_run: options.mode === "dry-run",
    preflight,
    attempts: reports,
    summary: summarizeStagedReports(reports),
    disclaimer: pilotDisclaimer,
  };
}

export const pilotDisclaimer = "one-block diagnostic smoke: 不构成 directional-screen 结论、Practice effect 或正式 benchmark 结论；不创建 formal record，不升级 suite revision。";

if (import.meta.main) {
  const mode = Bun.argv[2] as "preflight" | "dry-run" | "run" | undefined;
  const runIdArgument = Bun.argv.indexOf("--run-id");
  const runId = runIdArgument !== -1 && Bun.argv[runIdArgument + 1] ? Bun.argv[runIdArgument + 1] : `v4-one-block-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const blocksArgument = Bun.argv.indexOf("--blocks");
  const blocks = blocksArgument !== -1 && Number.isInteger(Number(Bun.argv[blocksArgument + 1])) ? Number(Bun.argv[blocksArgument + 1]) : 1;
  const outputArgument = Bun.argv.indexOf("--output");
  const outputRoot = resolve(outputArgument !== -1 && Bun.argv[outputArgument + 1] ? Bun.argv[outputArgument + 1] : join(workspaceRoot, "scratch", "llm-provider-gateway-v4-model-pilot", runId));
  if (mode !== "preflight" && mode !== "dry-run" && mode !== "run") {
    console.error("Usage: bun run staged-pilot-driver.ts <preflight|dry-run|run> [--run-id id] [--output dir] [--blocks n]");
    process.exit(1);
  }
  if (mode !== "dry-run" && Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("real-model pilot modes require LORELUM_LOCAL_EXPERIMENT=1");
  if (mode !== "dry-run") {
    const localPiCatalog = await configureLocalPiModelCatalog();
    if (localPiCatalog) {
      Bun.env.PI_CODING_AGENT_DIR = localPiCatalog.directory;
      Bun.env.PI_OFFLINE = "1";
      process.on("exit", localPiCatalog.cleanup);
    }
    const localPiKey = localPiApiKey();
    if (localPiKey) Bun.env.DEEPSEEK_API_KEY = localPiKey;
  }
  try {
    await mkdir(outputRoot, { recursive: true });
    const result = await executeStagedPilot({ mode, run_id: runId, outputRoot, blocks });
    await Bun.write(join(outputRoot, "redacted-summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(result.preflight?.passed === false ? 1 : 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
