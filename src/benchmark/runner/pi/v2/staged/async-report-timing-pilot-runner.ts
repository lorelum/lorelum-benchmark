import { mkdir, readFile, writeFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020";
import { dirname, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { sha256Text, workspaceRoot } from "../../../../fs";
import { run as runCommand } from "../preflight";
import { localPiApiKey, localPiModelArgument, localPiModelBaseUrl, localPiShellPath, configureLocalPiModelCatalog } from "../local-pi-model-catalog";
import {
  validateTimingPilotRunnerIdentity,
  dryRunTimingPilot,
  inspectTimingPilotPiCommand,
  resolveTimingPilotScratchOutput,
  type TimingPilotPlan,
  type TimingPilotPreflightSummary,
  verifyDiagnosticCalibration,
  type TimingPilotSlot,
} from "./async-report-timing-pilot";
import {
  hashStagedPracticeDeliveryPlan,
  runStagedPracticeDeliveryAttempt,
  type StagedPracticeAttemptReport,
  type StagedPracticeDeliveryPlan,
} from "./staged-practice-delivery";
import { productionStagedPracticePiAdapter } from "./staged-practice-delivery-pi-adapter";
import { evaluateApp, type EvaluatorResult } from "../../../../../../incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/evaluate";
import { CHECK_IDS, indeterminateResult } from "../../../../../../incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/result";
import { runAsyncReportReplanAttempt } from "../../../../judge/async-report-replan/v1/run";
import { classifyJudgeFailure, runAsyncReportReplanAttemptWithDiagnostics, type JudgeAttemptDiagnostics, type JudgeCalibrationDiagnostics } from "./timing-pilot-judge-diagnostics";
import { calibrationAttestationKey, calibrationScope, resolveCalibrationStatus } from "../../../../judge/async-report-replan/v1/calibration";
import { redactSensitiveText } from "../../../../judge/async-report-replan/v1/canonical";
import type { AsyncReportAccounting, CalibrationReport, RawReplanAttempt } from "../../../../judge/async-report-replan/v1/types";
import type { JudgeResultV1 } from "../../../../outcome/v1/contract";

export const timingPilotRunSchemaVersion = "async-report-timing-pilot-run/v1" as const;
export const timingPilotAttemptSchemaVersion = "async-report-timing-pilot-attempt/v1" as const;

export type PilotUsage = Readonly<{
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
}>;

export type TimingPilotAttemptResult = Readonly<{
  schema_version: typeof timingPilotAttemptSchemaVersion;
  attempt_id: string;
  master_plan_hash: string;
  delivery_plan_hash: string;
  slot: TimingPilotSlot;
  execution_mode: "judge-scored" | "diagnostic-only";
  status: "completed" | "failed" | "indeterminate" | "blocked" | "not-run";
  execution: Readonly<{ duration_ms: number; turns: number; usage: PilotUsage; termination_reason?: string }>;
  delivery: Readonly<{ status: string; session_binding: string; comparable: boolean }>;
  evaluator: Readonly<{ id: string; version: string; status: string; duration_ms: number; check_ids: readonly string[] }>;
  judge: Readonly<{
    score_usable: boolean;
    state: string;
    score: number | null;
    confidence: number | null;
    provider_id: string;
    provider_version: string;
    model: string | null;
    plan_hash: string;
    rubric_hash: string;
    prompt_hash: string;
    input_hash: string;
    evidence_hash: string | null;
    duration_ms: number;
    usage: PilotUsage;
    calls: Readonly<{ calibration: number; scoring: number }>;
    failure_reason?: string;
  }>;
  cost: Readonly<{ agent_cost_usd: number | null; judge_cost_usd: number | null; total_cost_usd: number | null }>;
  artifacts: Readonly<{ attempt_root: string; delivery_summary: string; public_trace: string }>;
}>;

export type TimingPilotRunResult = Readonly<{
  schema_version: typeof timingPilotRunSchemaVersion;
  run_id: string;
  status: "ready" | "preflight-blocked" | "invalid-plan" | "completed" | "incomplete";
  master_plan_hash: string;
  execution_mode: "judge-scored" | "diagnostic-only";
  judge_score_usable: boolean;
  planned_slots: number;
  attempted_slots: number;
  attempts: readonly TimingPilotAttemptResult[];
  cost_ledger: Readonly<{ agent: PilotUsage; judge: PilotUsage; calibration: Readonly<{ status: CalibrationReport["status"]; calls: number; duration_ms: number; usage: PilotUsage }>; agent_cost_usd: number | null; judge_cost_usd: number | null; total_cost_usd: number | null }>;
  output_root: string;
  formal_record_created: false;
}>;

export type TimingPilotRunnerDependencies = Readonly<{
  run_attempt?: typeof runStagedPracticeDeliveryAttempt;
  evaluate?: (appPath: string) => Promise<EvaluatorResult>;
  score?: (raw: RawReplanAttempt, calibration: CalibrationReport, env: Record<string, string | undefined>) => Promise<{ result: JudgeResultV1; accounting: AsyncReportAccounting; evidence?: unknown; diagnostics?: JudgeAttemptDiagnostics }>;
  verify_identity?: (root: string, plan: TimingPilotPlan, expectedCommandSha256: string) => Promise<string>;
  configure_catalog?: typeof configureLocalPiModelCatalog;
  validate_calibration?: (report: CalibrationReport, plan: TimingPilotPlan, env: Record<string, string | undefined>) => Promise<boolean>;
  now?: () => number;
}>;

function fail(message: string): never { throw new Error(`Invalid timing pilot execution: ${message}`); }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function finiteUsage(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }

function normalizeUsage(input: unknown): PilotUsage {
  if (!isRecord(input)) return { input_tokens: null, output_tokens: null, total_tokens: null, cost_usd: null };
  const inputTokens = finiteUsage(input.input_tokens ?? input.input);
  const outputTokens = finiteUsage(input.output_tokens ?? input.output);
  const totalTokens = finiteUsage(input.total_tokens ?? input.total) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  const cost = isRecord(input.cost) ? input.cost.total : input.cost;
  return { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens, cost_usd: finiteUsage(input.cost_usd ?? cost) };
}

function addUsage(left: PilotUsage, right: PilotUsage): PilotUsage {
  const sum = (a: number | null, b: number | null) => a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return { input_tokens: sum(left.input_tokens, right.input_tokens), output_tokens: sum(left.output_tokens, right.output_tokens), total_tokens: sum(left.total_tokens, right.total_tokens), cost_usd: sum(left.cost_usd, right.cost_usd) };
}

const emptyUsage = (): PilotUsage => ({ input_tokens: null, output_tokens: null, total_tokens: null, cost_usd: null });

function usageTotal(items: PilotUsage[]): PilotUsage { return items.reduce(addUsage, emptyUsage()); }

function redactedReason(value: unknown): string {
  return redactSensitiveText(value instanceof Error ? value.message : String(value)).replace(/[\r\n]+/g, " ").slice(0, 240);
}

function scratchRelative(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

export async function buildTimingPilotDeliveryPlan(plan: TimingPilotPlan, slot: TimingPilotSlot): Promise<StagedPracticeDeliveryPlan> {
  const unhashed: Omit<StagedPracticeDeliveryPlan, "plan_hash"> = {
    schema_version: "staged-practice-delivery/v1",
    id: `async-report-timing-pilot-${slot.attempt_id}`,
    candidate: plan.candidate,
    treatment: { root: plan.treatment.root, id: plan.treatment.id, version: plan.treatment.version },
    delivery: { condition_id: slot.condition_id, delivery_node: slot.delivery_node },
    prompts: {
      task_path: plan.prompts.task_path,
      followup_path: plan.prompts.followup_path,
      task_sha256: plan.prompts.task_sha256,
      followup_sha256: plan.prompts.followup_sha256,
      checkpoint_marker: plan.prompts.checkpoint_marker,
      checkpoint_resume_message: plan.prompts.checkpoint_resume_message,
    },
    execution: {
      model: plan.execution.model.id,
      model_version: plan.execution.model.version,
      system_prompt_hash: plan.prompts.system_prompt_sha256,
      tool_policy_hash: plan.execution.tool_policy_hash,
      environment: { id: plan.execution.environment.id, version: plan.execution.environment.version },
      budget: plan.execution.budget,
    },
  };
  return { ...unhashed, plan_hash: await hashStagedPracticeDeliveryPlan({ ...unhashed, plan_hash: "" }) };
}

export async function buildTimingPilotRawJudgeInput(options: {
  root: string;
  plan: TimingPilotPlan;
  slot: TimingPilotSlot;
  report: StagedPracticeAttemptReport;
  artifacts: string;
  workspace: string;
  blind_case_id: string;
}): Promise<RawReplanAttempt> {
  if (!/^case-[a-f0-9]{12}$/.test(options.blind_case_id)) fail("blind case id is not opaque");
  const candidateRoot = resolve(options.root, options.plan.candidate.path);
  const initialPrompt = await readFile(join(candidateRoot, options.plan.prompts.task_path), "utf8");
  const followupPrompt = await readFile(join(candidateRoot, options.plan.prompts.followup_path), "utf8");
  const stageNames = [
    ["task_start", "initial"],
    ["constraint_followup", "post-constraint"],
    ["checkpoint_resume", "post-constraint"],
  ] as const;
  const events: unknown[] = [];
  for (const [fileStage, evidenceStage] of stageNames) {
    const path = join(options.artifacts, `${fileStage}.stdout.jsonl`);
    let text: string;
    try { text = await readFile(path, "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let value: unknown;
      try { value = JSON.parse(line); } catch { continue; }
      if (!isRecord(value)) continue;
      const event: Record<string, unknown> = { ...value, stage: evidenceStage };
      if (isRecord(value.message)) event.message = { ...value.message, stage: evidenceStage };
      events.push(event);
    }
  }
  const baseRelative = relative(options.root, join(candidateRoot, "public/starter/app"));
  const finalRelative = relative(options.root, join(options.workspace, "app"));
  if (!finalRelative || finalRelative.startsWith("..")) fail("attempt workspace is not contained by the repository");
  const diff = await runCommand(["git", "diff", "--no-index", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "--", baseRelative, finalRelative], options.root, 30_000);
  if (diff.code !== 0 && diff.code !== 1) fail("final public workspace diff could not be generated");
  return {
    blind_case_id: options.blind_case_id,
    execution_health: options.report.status === "completed" && options.report.session_binding === "same-session" ? "healthy" : "unhealthy",
    public_user_turns: [{ stage: "initial", text: initialPrompt }, { stage: "post-constraint", text: followupPrompt }],
    events,
    final_candidate_diff: diff.stdout,
  };
}

function readStageUsage(artifacts: string): Promise<{ usage: PilotUsage; turns: number }> {
  return (async () => {
    let usage = emptyUsage();
    let turns = 0;
    for (const stage of ["task_start", "constraint_followup", "checkpoint_resume"]) {
      let content: string;
      try { content = await readFile(join(artifacts, `${stage}.stdout.jsonl`), "utf8"); } catch { continue; }
      for (const line of content.split(/\r?\n/)) {
        try {
          const event = JSON.parse(line) as unknown;
          if (!isRecord(event)) continue;
          if (event.type !== "message_end" || !isRecord(event.message) || event.message.role !== "assistant") continue;
          turns += 1;
          const messageUsage = isRecord(event.message.usage) ? event.message.usage : isRecord(event.usage) ? event.usage : undefined;
          usage = addUsage(usage, normalizeUsage(messageUsage));
        } catch { /* non-JSON diagnostic lines are excluded from usage accounting */ }
      }
    }
    const state = await Bun.file(join(artifacts, "private-runtime", "turn-budget.json")).json().catch(() => undefined) as { turns?: unknown } | undefined;
    return { usage, turns: Number.isInteger(state?.turns) ? state!.turns as number : turns };
  })();
}

async function defaultVerifyIdentity(root: string, plan: TimingPilotPlan, expectedCommandSha256: string): Promise<string> {
  await dryRunTimingPilot({ root, plan });
  await validateTimingPilotRunnerIdentity(root, plan);
  const observed = await inspectTimingPilotPiCommand(root);
  if (observed.sha256 !== expectedCommandSha256 || observed.version !== plan.execution.agent.version) throw new Error("Pi executable identity drifted after preflight");
  return observed.command;
}

async function validateTimingPilotRunResult(root: string, plan: TimingPilotPlan, result: TimingPilotRunResult): Promise<void> {
  const expectedIds = plan.schedule.slots.map((slot) => slot.attempt_id);
  const actualIds = result.attempts.map((attempt) => attempt.attempt_id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error("pilot result slots do not match the immutable master plan order");
  if (result.attempts.some((attempt) => attempt.master_plan_hash !== plan.plan_hash || !plan.schedule.slots.some((slot) => JSON.stringify(slot) === JSON.stringify(attempt.slot)))) throw new Error("pilot result contains master-plan or slot identity drift");
  const schema = await Bun.file(join(root, "schemas/async-report-timing-pilot-run-v1.schema.json")).json();
  const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);
  if (!validate(result)) throw new Error(`pilot result schema validation failed: ${(validate.errors ?? []).map((entry) => `${entry.instancePath || "/"} ${entry.message ?? entry.keyword}`).join("; ")}`);
}

async function privateWrite(directory: string, name: string, value: unknown): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function judgeSummary(result: JudgeResultV1, accounting: AsyncReportAccounting, evidenceHash?: string | null): TimingPilotAttemptResult["judge"] {
  return {
    score_usable: result.state === "observed",
    state: result.state,
    score: result.state === "observed" ? result.score : null,
    confidence: result.state === "observed" ? result.confidence : null,
    provider_id: accounting.provider.id,
    provider_version: accounting.provider.version,
    model: accounting.provider.model,
    plan_hash: accounting.plan.hash,
    rubric_hash: accounting.rubric.hash,
    prompt_hash: accounting.prompt_hash,
    input_hash: accounting.input_hash,
    evidence_hash: evidenceHash !== undefined ? evidenceHash : accounting.evidence.hash,
    duration_ms: accounting.duration_ms,
    usage: normalizeUsage(accounting.usage),
    calls: { calibration: 0, scoring: accounting.calls.scoring },
    ...(accounting.failure_reason ? { failure_reason: redactedReason(accounting.failure_reason) } : {}),
  };
}

async function emptyAttempt(options: {
  root: string;
  plan: TimingPilotPlan;
  slot: TimingPilotSlot;
  runRoot: string;
  status: "blocked" | "not-run";
  execution_mode: "judge-scored" | "diagnostic-only";
  reason: string;
}): Promise<TimingPilotAttemptResult> {
  const deliveryPlan = await buildTimingPilotDeliveryPlan(options.plan, options.slot);
  return {
    schema_version: timingPilotAttemptSchemaVersion,
    attempt_id: options.slot.attempt_id,
    master_plan_hash: options.plan.plan_hash,
    delivery_plan_hash: deliveryPlan.plan_hash,
    slot: options.slot,
    execution_mode: options.execution_mode,
    status: options.status,
    execution: { duration_ms: 0, turns: 0, usage: emptyUsage(), termination_reason: redactedReason(options.reason) },
    delivery: { status: options.status, session_binding: "not-started", comparable: false },
    evaluator: { id: options.plan.evaluator.id, version: options.plan.evaluator.version, status: "indeterminate", duration_ms: 0, check_ids: CHECK_IDS },
    judge: {
      score_usable: false, state: "not-run", score: null, confidence: null, provider_id: options.plan.judge.provider_id, provider_version: options.plan.judge.provider_version,
      model: options.plan.judge.model, plan_hash: options.plan.judge.evaluation_plan_hash, rubric_hash: options.plan.judge.rubric_hash,
      prompt_hash: "0".repeat(64), input_hash: "0".repeat(64), evidence_hash: null, duration_ms: 0, usage: emptyUsage(), calls: { calibration: 0, scoring: 0 }, failure_reason: redactedReason(options.reason),
    },
    cost: { agent_cost_usd: null, judge_cost_usd: null, total_cost_usd: null },
    artifacts: { attempt_root: scratchRelative(options.root, options.runRoot), delivery_summary: "", public_trace: "" },
  };
}

export async function runTimingPilotAttempts(options: {
  root?: string;
  plan: TimingPilotPlan;
  run_id: string;
  output_root: string;
  preflight: TimingPilotPreflightSummary;
  calibration: CalibrationReport;
  calibration_diagnostics?: JudgeCalibrationDiagnostics;
  env?: Record<string, string | undefined>;
  dependencies?: TimingPilotRunnerDependencies;
}): Promise<TimingPilotRunResult> {
  const root = resolve(options.root ?? workspaceRoot);
  const plan = options.plan;
  const env = options.env ?? Bun.env;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(options.run_id)) fail("run id is invalid");
  const executionMode = options.preflight.execution_mode;
  if (executionMode !== "judge-scored" && executionMode !== "diagnostic-only") fail("preflight execution mode is invalid");
  if (options.preflight.allowed_to_start !== true || options.preflight.plan_hash !== plan.plan_hash || options.preflight.status !== "ready") fail("successful matching preflight is required before any Agent attempt");
  if (options.preflight.judge.calibration_hash !== options.calibration.hash) fail("preflight calibration identity does not match the supplied report");
  const preflightTime = Date.parse(options.preflight.created_at);
  if (!Number.isFinite(preflightTime) || Date.now() - preflightTime < 0 || Date.now() - preflightTime > 15 * 60_000) fail("preflight summary is older than 15 minutes or has an invalid timestamp");
  if (env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Agent pilot requires explicit LORELUM_LOCAL_EXPERIMENT=1 opt-in");
  let calibrationIsQualified = false;
  if (executionMode === "judge-scored") {
    if (env.LORELUM_JUDGE_REAL !== "1") fail("Judge-scored pilot requires explicit LORELUM_JUDGE_REAL=1 opt-in");
    if (options.preflight.judge_score_usable !== true) fail("judge-scored preflight must declare Judge scores usable");
    calibrationIsQualified = options.dependencies?.validate_calibration
      ? await options.dependencies.validate_calibration(options.calibration, plan, env)
      : (await resolveCalibrationStatus(options.calibration, calibrationScope(plan.judge.model), calibrationAttestationKey("real", env))).status === "qualified";
    if (!calibrationIsQualified) fail("a currently attested qualified Judge calibration is required before any Agent attempt");
  } else {
    if (options.preflight.judge_score_usable !== false) fail("diagnostic-only preflight must mark Judge scores unusable");
    if (!options.calibration_diagnostics) fail("diagnostic-only mode requires the complete private calibration sidecar");
    try { await verifyDiagnosticCalibration(options.calibration, options.calibration_diagnostics, plan.judge.model, env, root); }
    catch { fail("diagnostic-only mode requires a complete attested diagnostic report and matching private sidecar"); }
  }
  await dryRunTimingPilot({ root, plan });
  const runRoot = await resolveTimingPilotScratchOutput(root, options.output_root);
  const attemptRunner = options.dependencies?.run_attempt ?? runStagedPracticeDeliveryAttempt;
  const evaluator = options.dependencies?.evaluate ?? ((appPath) => evaluateApp(appPath));
  const scorer = options.dependencies?.score ?? (async (raw, calibration, env) => {
    const result = await runAsyncReportReplanAttemptWithDiagnostics(raw, { calibration, env, mode: "real" });
    return { result: result.result, accounting: result.accounting, evidence: result.evidence, diagnostics: result.diagnostics };
  });
  const verifyIdentity = options.dependencies?.verify_identity ?? defaultVerifyIdentity;
  const attempts: TimingPilotAttemptResult[] = [];
  let command: string | undefined;
  let globalBlock: string | undefined;
  let localCatalog: Awaited<ReturnType<typeof configureLocalPiModelCatalog>>;
  if (!localPiModelBaseUrl(env) || !localPiApiKey(env)) globalBlock = "Pi gateway endpoint or credential is unavailable";
  try {
    if (!globalBlock) {
      const shellPath = await localPiShellPath(env);
      localCatalog = await (options.dependencies?.configure_catalog ?? configureLocalPiModelCatalog)(env, plan.execution.model.id, shellPath);
    }
    for (const [index, slot] of plan.schedule.slots.entries()) {
      const attemptRoot = join(runRoot, "attempts", slot.attempt_id);
      if (globalBlock) {
        attempts.push(await emptyAttempt({ root, plan, slot, runRoot: attemptRoot, status: index === 0 ? "blocked" : "not-run", execution_mode: executionMode, reason: globalBlock }));
        continue;
      }
      try { command = await verifyIdentity(root, plan, options.preflight.agent.command_sha256 ?? ""); }
      catch (error) { globalBlock = redactedReason(error); attempts.push(await emptyAttempt({ root, plan, slot, runRoot: attemptRoot, status: "blocked", execution_mode: executionMode, reason: globalBlock })); continue; }
      const slotPlan = await buildTimingPilotDeliveryPlan(plan, slot);
      const executionRoot = attemptRoot;
      const runWorkspace = join(executionRoot, ".run-workspaces", "workspace");
      const artifacts = join(executionRoot, ".run-workspaces", "artifacts");
      const privateDirectory = join(artifacts, "private-runtime");
      await mkdir(privateDirectory, { recursive: true });
      const turnStatePath = join(privateDirectory, "turn-budget.json");
      await writeFile(turnStatePath, `${JSON.stringify({ turns: 0 })}\n`, "utf8");
      await privateWrite(attemptRoot, "attempt-manifest.json", { master_plan_hash: plan.plan_hash, delivery_plan_hash: slotPlan.plan_hash, slot, runner: plan.runner, environment: plan.execution.environment });
      const attemptStarted = (options.dependencies?.now ?? Date.now)();
      let report: StagedPracticeAttemptReport | undefined;
      let judgeResult: JudgeResultV1 | undefined;
      let judgeAccounting: AsyncReportAccounting | undefined;
      let evidenceHash: string | null = null;
      let evaluatorResult: EvaluatorResult | undefined;
      let evaluatorDurationMs = 0;
      let agentDurationMs = 0;
      let attemptFailure: string | undefined;
      let judgeFailure: string | undefined;
      let judgeCallStarted = false;
      let judgeDurationMs = 0;
      try {
        const deadlineAt = Date.now() + plan.execution.budget.max_duration_ms;
        const agentEnv: Record<string, string> = {};
        if (localCatalog) { agentEnv.PI_CODING_AGENT_DIR = localCatalog.directory; agentEnv.PI_OFFLINE = "1"; }
        const key = localPiApiKey(env);
        if (key) agentEnv.DEEPSEEK_API_KEY = key;
        const pi = productionStagedPracticePiAdapter({
          command,
          model: localPiModelArgument(plan.execution.model.id),
          tools: plan.execution.tools.join(","),
          stage_budget_ms: plan.execution.budget.max_duration_ms,
          log_directory: artifacts,
          base_system_prompt_path: resolve(root, plan.prompts.system_prompt_path),
          turn_budget: { state_path: turnStatePath, max_turns: plan.execution.budget.max_turns },
          deadline_at: deadlineAt,
          child_environment: agentEnv,
        });
        report = await attemptRunner({ root, execution_root: executionRoot, plan: slotPlan, attempt_id: slot.attempt_id, workspace: runWorkspace, artifacts, pi });
      } catch (error) { attemptFailure = redactedReason(error); }
      agentDurationMs = Math.max(0, (options.dependencies?.now ?? Date.now)() - attemptStarted);
      const runWorkspaceApp = join(runWorkspace, "app");
      const evaluatorStarted = (options.dependencies?.now ?? Date.now)();
      try { evaluatorResult = await evaluator(runWorkspaceApp); }
      catch { evaluatorResult = indeterminateResult("adapter-failed"); }
      evaluatorDurationMs = Math.max(0, (options.dependencies?.now ?? Date.now)() - evaluatorStarted);
      const execution = await readStageUsage(artifacts);
      let judgeState: TimingPilotAttemptResult["judge"];
      let judgeDiagnostics: JudgeAttemptDiagnostics | undefined;
      let judgeEvidence: unknown;
      if (executionMode === "diagnostic-only") {
        judgeState = {
          score_usable: false, state: "not-run", score: null, confidence: null,
          provider_id: plan.judge.provider_id, provider_version: plan.judge.provider_version, model: plan.judge.model,
          plan_hash: plan.judge.evaluation_plan_hash, rubric_hash: plan.judge.rubric_hash,
          prompt_hash: "0".repeat(64), input_hash: "0".repeat(64), evidence_hash: null,
          duration_ms: 0, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 },
          calls: { calibration: 0, scoring: 0 }, failure_reason: "calibration-unqualified-diagnostic-only",
        };
        await privateWrite(artifacts, "judge-private-result.json", { state: "not-run", reason: "calibration-unqualified-diagnostic-only", score_usable: false, calls: { calibration: 0, scoring: 0 } });
      } else {
        if (report) {
          const judgeStarted = Date.now();
          try {
            const raw = await buildTimingPilotRawJudgeInput({ root, plan, slot, report, artifacts, workspace: runWorkspace, blind_case_id: `case-${randomBytes(6).toString("hex")}` });
            judgeCallStarted = true;
            const scored = await scorer(raw, options.calibration, env);
            judgeResult = scored.result;
            judgeAccounting = scored.accounting;
            judgeDiagnostics = scored.diagnostics;
            judgeEvidence = scored.evidence;
            evidenceHash = isRecord(scored.evidence) && typeof scored.evidence.evidence_hash === "string" ? scored.evidence.evidence_hash : scored.accounting.evidence.hash;
          } catch (error) {
            const failure = classifyJudgeFailure(error, "runner");
            judgeDiagnostics = { call_attempted: judgeCallStarted, duration_ms: Math.max(0, Date.now() - judgeStarted), failure };
            judgeFailure = failure.http_status === undefined ? `${failure.stage}/${failure.code}` : `${failure.stage}/${failure.code} (HTTP ${failure.http_status})`;
          } finally {
            judgeDurationMs = Math.max(0, Date.now() - judgeStarted);
          }
        }
        if (!judgeResult || !judgeAccounting) {
          const unavailable = await runAsyncReportReplanAttempt({
            blind_case_id: `case-${randomBytes(6).toString("hex")}`,
            execution_health: "unhealthy",
            public_user_turns: [{ stage: "initial", text: "attempt evidence unavailable" }, { stage: "post-constraint", text: "attempt evidence unavailable" }],
            events: [],
            final_candidate_diff: "",
          }, { env, mode: "mock", calibration: undefined });
          const unavailableState = judgeCallStarted ? "judge-unavailable" : "indeterminate";
          const unavailableReason = judgeFailure ?? "Judge evidence was unavailable";
          judgeResult = { ...unavailable.result, state: unavailableState, reason: unavailableReason };
          judgeAccounting = {
            ...unavailable.accounting,
            state: unavailableState,
            calls: { calibration: 0, scoring: judgeCallStarted ? 1 : 0 },
            duration_ms: judgeDurationMs,
            ...(judgeFailure ? { failure_reason: judgeFailure } : { failure_reason: unavailableReason }),
          };
          evidenceHash = null;
        }
        await privateWrite(artifacts, "judge-private-result.json", { result: judgeResult, accounting: judgeAccounting, evidence: judgeEvidence, diagnostics: judgeDiagnostics ?? { call_attempted: judgeCallStarted, duration_ms: judgeDurationMs } });
        judgeState = judgeSummary(judgeResult, judgeAccounting, evidenceHash);
      }
      if (report) {
        await privateWrite(artifacts, "evaluator-private-result.json", evaluatorResult);
        await privateWrite(attemptRoot, "attempt-result-private.json", { report, evaluator: evaluatorResult, judge: judgeAccounting ?? judgeState });
      }
      const agentCost = execution.usage.cost_usd;
      const judgeCost = typeof judgeState.usage.cost_usd === "number" ? judgeState.usage.cost_usd : null;
      const totalCost = agentCost !== null && judgeCost !== null ? agentCost + judgeCost : null;
      const status = attemptFailure
        ? "indeterminate"
        : report?.status === "completed"
          ? evaluatorResult.status === "indeterminate" || (executionMode === "judge-scored" && judgeState.state !== "observed") ? "indeterminate" : "completed"
          : report?.status === "unsupported"
            ? "failed"
            : report?.status === "indeterminate" || report?.status === "invalid-plan" || !report
              ? "indeterminate"
              : "failed";
      const result: TimingPilotAttemptResult = {
        schema_version: timingPilotAttemptSchemaVersion,
        attempt_id: slot.attempt_id,
        master_plan_hash: plan.plan_hash,
        delivery_plan_hash: slotPlan.plan_hash,
        slot,
        execution_mode: executionMode,
        status,
        execution: { duration_ms: agentDurationMs, turns: execution.turns, usage: execution.usage, ...(attemptFailure ? { termination_reason: attemptFailure } : {}) },
        delivery: { status: report?.delivery_status ?? "not-started", session_binding: report?.session_binding ?? "not-started", comparable: report?.comparable ?? false },
        evaluator: { id: plan.evaluator.id, version: plan.evaluator.version, status: evaluatorResult.status, duration_ms: evaluatorDurationMs, check_ids: CHECK_IDS },
        judge: judgeState,
        cost: { agent_cost_usd: agentCost, judge_cost_usd: judgeCost, total_cost_usd: totalCost },
        artifacts: { attempt_root: scratchRelative(root, attemptRoot), delivery_summary: report ? scratchRelative(root, report.summary_path) : "", public_trace: report ? scratchRelative(root, report.public_trace_path) : "" },
      };
      attempts.push(result);
      await privateWrite(attemptRoot, "attempt-result.json", result);
      // A condition-specific delivery/evaluator/Judge outcome never replaces a failed slot.
      // The next iteration revalidates the pinned execution identity before starting.
    }
  } finally {
    localCatalog?.cleanup();
  }
  if (globalBlock) {
    const accounted = new Set(attempts.map((attempt) => attempt.attempt_id));
    for (const slot of plan.schedule.slots) if (!accounted.has(slot.attempt_id)) attempts.push(await emptyAttempt({ plan, slot, runRoot: join(runRoot, "attempts", slot.attempt_id), status: "not-run", execution_mode: executionMode, reason: globalBlock }));
    attempts.sort((a, b) => plan.schedule.slots.findIndex((slot) => slot.attempt_id === a.attempt_id) - plan.schedule.slots.findIndex((slot) => slot.attempt_id === b.attempt_id));
  }
  const attempted = attempts.filter((attempt) => attempt.status !== "not-run" && attempt.status !== "blocked").length;
  const agentUsage = usageTotal(attempts.map((attempt) => attempt.execution.usage));
  const judgeUsage = usageTotal(attempts.map((attempt) => attempt.judge.usage));
  const calibrationUsage = normalizeUsage(options.calibration.usage);
  const calibrationLedger = { status: options.calibration.status, calls: options.calibration.calls, duration_ms: options.calibration.duration_ms, usage: calibrationUsage };
  const agentCost = agentUsage.cost_usd;
  const judgeCost = judgeUsage.cost_usd !== null && calibrationUsage.cost_usd !== null ? judgeUsage.cost_usd + calibrationUsage.cost_usd : null;
  const totalCost = agentCost !== null && judgeCost !== null ? agentCost + judgeCost : null;
  const status = globalBlock ? "incomplete" : attempts.every((attempt) => attempt.status === "completed") ? "completed" : "incomplete";
  const result: TimingPilotRunResult = {
    schema_version: timingPilotRunSchemaVersion,
    run_id: options.run_id,
    status,
    master_plan_hash: plan.plan_hash,
    execution_mode: executionMode,
    judge_score_usable: executionMode === "judge-scored" && calibrationIsQualified && attempts.every((attempt) => attempt.judge.score_usable),
    planned_slots: plan.schedule.slots.length,
    attempted_slots: attempted,
    attempts,
    cost_ledger: { agent: agentUsage, judge: judgeUsage, calibration: calibrationLedger, agent_cost_usd: agentCost, judge_cost_usd: judgeCost, total_cost_usd: totalCost },
    output_root: scratchRelative(root, runRoot),
    formal_record_created: false,
  };
  await validateTimingPilotRunResult(root, plan, result);
  await privateWrite(runRoot, "pilot-result-index.json", result);
  return result;
}
