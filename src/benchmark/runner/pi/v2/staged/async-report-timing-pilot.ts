import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256File, sha256Text, workspaceRoot } from "../../../../fs";
import { asyncReportJudgeEnv } from "../../../../judge/async-report-replan/v1/llm";
import { runRealCalibration } from "../../../../judge/async-report-replan/v1/calibrate";
import type { CalibrationReport } from "../../../../judge/async-report-replan/v1/types";
import { configureLocalPiModelCatalog, localPiApiKey, localPiModelArgument, localPiShellPath } from "../local-pi-model-catalog";
import { piCommand, preflightPiAndModel } from "../preflight";
import { assertSeparateRoots, prepareStagedPracticeDelivery, type StagedPracticeDeliveryPlan } from "./staged-practice-delivery";

export const timingPilotSchemaVersion = "async-report-timing-pilot/v1" as const;
export const timingPilotPreflightSchemaVersion = "async-report-timing-pilot-preflight/v1" as const;
export const timingPilotPlanPath = "incubator/practice-injection-plans/async-report-timing-pilot-v1.yaml" as const;
export const timingPilotEnvironmentPath = "environments/local-pi/v4/environment.yaml" as const;
export const timingPilotSystemPromptPath = "prompts/async-report-timing-pilot/v1/system.md" as const;
export const timingPilotModel = "deepseek/deepseek-v4-flash" as const;
export const timingPilotModelVersion = "operator-local-experiment" as const;
export const timingPilotToolPolicyHash = "095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2" as const;
export const timingPilotMaxTurns = 128 as const;
export const timingPilotMaxDurationMs = 1_500_000 as const;
export const timingPilotJudgeProvider = "judge-agent/async-report-replan/v1" as const;
export const timingPilotJudgeModel = "deepseek-v4-flash" as const;

export const timingPilotNodes = ["task_start", "constraint_followup", "first_implementation_checkpoint"] as const;
export type TimingPilotNode = (typeof timingPilotNodes)[number];
export type TimingPilotGateStatus = "passed" | "failed" | "blocked" | "not-run";
export type TimingPilotStatus = "ready" | "preflight-blocked" | "invalid-plan";

export type TimingPilotSlot = Readonly<{
  attempt_id: string;
  block: 1 | 2 | 3;
  position: 1 | 2 | 3;
  repetition: 1 | 2 | 3;
  condition_id: TimingPilotNode;
  delivery_node: TimingPilotNode;
}>;

export type TimingPilotPlan = Readonly<{
  schema_version: typeof timingPilotSchemaVersion;
  id: "async-report-timing-pilot";
  version: "v1";
  lifecycle_stage: "pilot" | "retired";
  candidate: Readonly<{ path: string; source_commit: string; snapshot_id: string }>;
  treatment: Readonly<{
    root: string;
    id: "agentic-coding-replan-on-material-drift";
    version: "v1";
    pack: Readonly<{ repository: string; ref: string; version: string; commit: string }>;
    practice: Readonly<{ id: "agentic-coding.implementation.replan-on-material-drift"; content_digest: string; source_sha256: string; card_sha256: string }>;
  }>;
  prompts: Readonly<{ task_path: "public/task.md"; followup_path: "public/stage-2/task.md"; task_sha256: string; followup_sha256: string; system_prompt_path: typeof timingPilotSystemPromptPath; system_prompt_sha256: string; checkpoint_marker: "CHECKPOINT: compatibility-slice-ready"; checkpoint_resume_message: "Continue the task after the compatibility checkpoint." }>;
  execution: Readonly<{
    agent: Readonly<{ id: "pi"; version: "0.85.1"; command: "pi" }>;
    model: Readonly<{ id: typeof timingPilotModel; version: typeof timingPilotModelVersion }>;
    environment: Readonly<{ id: "local-pi"; version: "v4" }>;
    tools: readonly ["read", "bash", "edit", "write", "grep", "find", "ls"];
    tool_policy_hash: typeof timingPilotToolPolicyHash;
    budget: Readonly<{ max_turns: 128; max_duration_ms: 1_500_000 }>;
  }>;
  judge: Readonly<{
    provider_id: typeof timingPilotJudgeProvider;
    provider_version: "v1";
    model: typeof timingPilotJudgeModel;
    real_opt_in_env: "LORELUM_JUDGE_REAL=1";
    calibration: Readonly<{ max_calls: 9; repetitions: 3 }>;
    scoring: Readonly<{ calls_per_attempt: 1; retries: 0 }>;
  }>;
  schedule: Readonly<{ algorithm: "cyclic-latin-square/v1"; repetitions: 3; slots: readonly TimingPilotSlot[] }>;
  claim_boundary: "diagnostic-only; no formal record, suite revision, or general/product conclusion";
  plan_hash: string;
}>;

export type TimingPilotGate = Readonly<{ id: string; status: TimingPilotGateStatus; reason?: string }>;
export type TimingPilotCostEstimate = Readonly<{
  agent_attempts: 9;
  judge_calibration_calls: 9;
  judge_scoring_calls: 9;
  agent_max_duration_ms: number;
  total_judge_calls: 18;
  cost_usd: "unavailable";
}>;

export type TimingPilotPreflightSummary = Readonly<{
  schema_version: typeof timingPilotPreflightSchemaVersion;
  status: TimingPilotStatus;
  allowed_to_start: boolean;
  plan_hash: string;
  model: Readonly<{ id: string; version: string }>;
  agent: Readonly<{ id: string; version: string }>;
  environment: Readonly<{ id: string; version: string }>;
  budget: Readonly<{ max_turns: number; max_duration_ms: number }>;
  cost_estimate: TimingPilotCostEstimate;
  judge: Readonly<{ provider_id: string; model: string; real_opt_in: boolean; calibration_status: "qualified" | "diagnostic" | "not-run" | "unavailable"; calibration_calls: number }>;
  gates: readonly TimingPilotGate[];
  failure_reason?: string;
}>;

export type TimingPilotPreflightOptions = Readonly<{
  root?: string;
  plan?: TimingPilotPlan;
  plan_path?: string;
  env?: Record<string, string | undefined>;
  run_model_probe?: boolean;
  run_judge_calibration?: boolean;
  model_probe?: (input: { root: string; model: string }) => Promise<{ version: string }>;
  judge_calibration?: (env: Record<string, string | undefined>) => Promise<CalibrationReport>;
}>;

export type TimingPilotDryRun = Readonly<{
  plan_hash: string;
  slot_count: number;
  slots: readonly TimingPilotSlot[];
  candidate_ready: boolean;
  environment_ready: boolean;
  prompt_ready: boolean;
  isolation_ready: boolean;
}>;

const hashPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const scheduleOrder: readonly TimingPilotNode[][] = [
  ["task_start", "constraint_followup", "first_implementation_checkpoint"],
  ["constraint_followup", "first_implementation_checkpoint", "task_start"],
  ["first_implementation_checkpoint", "task_start", "constraint_followup"],
];
const expectedPlanKeys = ["schema_version", "id", "version", "lifecycle_stage", "candidate", "treatment", "prompts", "execution", "judge", "schedule", "claim_boundary", "plan_hash"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid async-report-timing-pilot/v1: ${message}`);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} contains unsupported or missing fields`);
}

function stringField(value: Record<string, unknown>, field: string, label = field): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) fail(`${label} must be a non-empty string`);
  return result;
}

function hashField(value: Record<string, unknown>, field: string): string {
  const result = stringField(value, field);
  if (!hashPattern.test(result)) fail(`${field} must be a lowercase SHA-256 hash`);
  return result;
}

function commitField(value: Record<string, unknown>, field: string): string {
  const result = stringField(value, field);
  if (!commitPattern.test(result)) fail(`${field} must be a lowercase commit SHA`);
  return result;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function withoutPlanHash(plan: TimingPilotPlan): Omit<TimingPilotPlan, "plan_hash"> {
  const { plan_hash: _ignored, ...rest } = plan;
  return rest;
}

export async function hashTimingPilotPlan(plan: TimingPilotPlan): Promise<string> {
  return sha256Text(JSON.stringify(sortKeys(withoutPlanHash(plan))));
}

export function buildTimingPilotSchedule(): readonly TimingPilotSlot[] {
  return scheduleOrder.flatMap((nodes, blockIndex) => nodes.map((node, positionIndex) => {
    const block = (blockIndex + 1) as 1 | 2 | 3;
    const position = (positionIndex + 1) as 1 | 2 | 3;
    return {
      attempt_id: `block-${block}-position-${position}-${node.replaceAll("_", "-")}`,
      block,
      position,
      repetition: block,
      condition_id: node,
      delivery_node: node,
    } satisfies TimingPilotSlot;
  }));
}

function parseSlot(value: unknown, index: number): TimingPilotSlot {
  if (!isRecord(value)) fail(`schedule.slots[${index}] must be an object`);
  exactKeys(value, ["attempt_id", "block", "position", "repetition", "condition_id", "delivery_node"], `schedule.slots[${index}]`);
  const block = value.block;
  const position = value.position;
  const repetition = value.repetition;
  const condition = stringField(value, "condition_id") as TimingPilotNode;
  const node = stringField(value, "delivery_node") as TimingPilotNode;
  if (!timingPilotNodes.includes(condition) || !timingPilotNodes.includes(node) || condition !== node) fail(`schedule.slots[${index}] condition/node is invalid`);
  if (![1, 2, 3].includes(block as number) || ![1, 2, 3].includes(position as number) || ![1, 2, 3].includes(repetition as number)) fail(`schedule.slots[${index}] block/position/repetition is invalid`);
  const attemptId = stringField(value, "attempt_id");
  if (!/^block-[1-3]-position-[1-3]-[a-z0-9-]+$/.test(attemptId)) fail(`schedule.slots[${index}] attempt_id is invalid`);
  return { attempt_id: attemptId, block: block as 1 | 2 | 3, position: position as 1 | 2 | 3, repetition: repetition as 1 | 2 | 3, condition_id: condition, delivery_node: node };
}

export async function parseTimingPilotPlan(value: unknown): Promise<TimingPilotPlan> {
  if (!isRecord(value)) fail("plan must be an object");
  exactKeys(value, expectedPlanKeys, "plan");
  if (value.schema_version !== timingPilotSchemaVersion || value.id !== "async-report-timing-pilot" || value.version !== "v1") fail("plan identity is invalid");
  if (value.lifecycle_stage !== "pilot" && value.lifecycle_stage !== "retired") fail("lifecycle_stage is invalid");
  if (!isRecord(value.candidate) || !isRecord(value.treatment) || !isRecord(value.prompts) || !isRecord(value.execution) || !isRecord(value.judge) || !isRecord(value.schedule)) fail("plan sections are invalid");
  const candidate = value.candidate;
  exactKeys(candidate, ["path", "source_commit", "snapshot_id"], "candidate");
  if (candidate.path !== "incubator/practice-injection/async-report-lifecycle-v1") fail("candidate path is not the frozen #196 candidate");
  const parsedCandidate = { path: stringField(candidate, "path"), source_commit: commitField(candidate, "source_commit"), snapshot_id: hashField(candidate, "snapshot_id") };
  const treatment = value.treatment;
  exactKeys(treatment, ["root", "id", "version", "pack", "practice"], "treatment");
  if (!isRecord(treatment.pack) || !isRecord(treatment.practice)) fail("treatment pack/practice is invalid");
  exactKeys(treatment.pack, ["repository", "ref", "version", "commit"], "treatment.pack");
  exactKeys(treatment.practice, ["id", "content_digest", "source_sha256", "card_sha256"], "treatment.practice");
  if (treatment.root !== "treatments/agentic-coding-replan-on-material-drift/v1" || treatment.id !== "agentic-coding-replan-on-material-drift" || treatment.version !== "v1") fail("treatment identity is not the frozen #199 treatment");
  if (treatment.practice.id !== "agentic-coding.implementation.replan-on-material-drift") fail("practice identity is invalid");
  const parsedTreatment = {
    root: stringField(treatment, "root"), id: "agentic-coding-replan-on-material-drift" as const, version: "v1" as const,
    pack: { repository: stringField(treatment.pack, "repository"), ref: stringField(treatment.pack, "ref"), version: stringField(treatment.pack, "version"), commit: commitField(treatment.pack, "commit") },
    practice: { id: "agentic-coding.implementation.replan-on-material-drift" as const, content_digest: hashField(treatment.practice, "content_digest"), source_sha256: hashField(treatment.practice, "source_sha256"), card_sha256: hashField(treatment.practice, "card_sha256") },
  };
  const prompts = value.prompts;
  exactKeys(prompts, ["task_path", "followup_path", "task_sha256", "followup_sha256", "system_prompt_path", "system_prompt_sha256", "checkpoint_marker", "checkpoint_resume_message"], "prompts");
  if (prompts.task_path !== "public/task.md" || prompts.followup_path !== "public/stage-2/task.md" || prompts.system_prompt_path !== timingPilotSystemPromptPath || prompts.checkpoint_marker !== "CHECKPOINT: compatibility-slice-ready" || prompts.checkpoint_resume_message !== "Continue the task after the compatibility checkpoint.") fail("prompt identity is invalid");
  const parsedPrompts = { task_path: "public/task.md" as const, followup_path: "public/stage-2/task.md" as const, task_sha256: hashField(prompts, "task_sha256"), followup_sha256: hashField(prompts, "followup_sha256"), system_prompt_path: timingPilotSystemPromptPath, system_prompt_sha256: hashField(prompts, "system_prompt_sha256"), checkpoint_marker: "CHECKPOINT: compatibility-slice-ready" as const, checkpoint_resume_message: "Continue the task after the compatibility checkpoint." as const };
  const execution = value.execution;
  exactKeys(execution, ["agent", "model", "environment", "tools", "tool_policy_hash", "budget"], "execution");
  if (!isRecord(execution.agent) || !isRecord(execution.model) || !isRecord(execution.environment) || !isRecord(execution.budget) || !Array.isArray(execution.tools)) fail("execution sections are invalid");
  exactKeys(execution.agent, ["id", "version", "command"], "execution.agent"); exactKeys(execution.model, ["id", "version"], "execution.model"); exactKeys(execution.environment, ["id", "version"], "execution.environment"); exactKeys(execution.budget, ["max_turns", "max_duration_ms"], "execution.budget");
  if (execution.agent.id !== "pi" || execution.agent.version !== "0.85.1" || execution.agent.command !== "pi" || execution.model.id !== timingPilotModel || execution.model.version !== timingPilotModelVersion || execution.environment.id !== "local-pi" || execution.environment.version !== "v4" || JSON.stringify(execution.tools) !== JSON.stringify(["read", "bash", "edit", "write", "grep", "find", "ls"]) || execution.tool_policy_hash !== timingPilotToolPolicyHash || execution.budget.max_turns !== timingPilotMaxTurns || execution.budget.max_duration_ms !== timingPilotMaxDurationMs) fail("execution identity or budget is not frozen");
  const parsedExecution = { agent: { id: "pi" as const, version: "0.85.1" as const, command: "pi" as const }, model: { id: timingPilotModel, version: timingPilotModelVersion }, environment: { id: "local-pi" as const, version: "v4" as const }, tools: ["read", "bash", "edit", "write", "grep", "find", "ls"] as const, tool_policy_hash: timingPilotToolPolicyHash, budget: { max_turns: timingPilotMaxTurns, max_duration_ms: timingPilotMaxDurationMs } };
  const judge = value.judge;
  exactKeys(judge, ["provider_id", "provider_version", "model", "real_opt_in_env", "calibration", "scoring"], "judge");
  if (!isRecord(judge.calibration) || !isRecord(judge.scoring)) fail("judge budget sections are invalid");
  exactKeys(judge.calibration, ["max_calls", "repetitions"], "judge.calibration"); exactKeys(judge.scoring, ["calls_per_attempt", "retries"], "judge.scoring");
  if (judge.provider_id !== timingPilotJudgeProvider || judge.provider_version !== "v1" || judge.model !== timingPilotJudgeModel || judge.real_opt_in_env !== "LORELUM_JUDGE_REAL=1" || judge.calibration.max_calls !== 9 || judge.calibration.repetitions !== 3 || judge.scoring.calls_per_attempt !== 1 || judge.scoring.retries !== 0) fail("judge identity or budget is not frozen");
  const parsedJudge = { provider_id: timingPilotJudgeProvider, provider_version: "v1" as const, model: timingPilotJudgeModel, real_opt_in_env: "LORELUM_JUDGE_REAL=1" as const, calibration: { max_calls: 9 as const, repetitions: 3 as const }, scoring: { calls_per_attempt: 1 as const, retries: 0 as const } };
  const schedule = value.schedule;
  exactKeys(schedule, ["algorithm", "repetitions", "slots"], "schedule");
  if (schedule.algorithm !== "cyclic-latin-square/v1" || schedule.repetitions !== 3 || !Array.isArray(schedule.slots) || schedule.slots.length !== 9) fail("schedule identity or size is invalid");
  const parsedSlots = schedule.slots.map(parseSlot);
  const expectedSlots = buildTimingPilotSchedule();
  if (JSON.stringify(parsedSlots) !== JSON.stringify(expectedSlots)) fail("schedule does not match the frozen cyclic Latin square");
  if (value.claim_boundary !== "diagnostic-only; no formal record, suite revision, or general/product conclusion") fail("claim boundary is invalid");
  const plan: TimingPilotPlan = { schema_version: timingPilotSchemaVersion, id: "async-report-timing-pilot", version: "v1", lifecycle_stage: value.lifecycle_stage, candidate: parsedCandidate, treatment: parsedTreatment, prompts: parsedPrompts, execution: parsedExecution, judge: parsedJudge, schedule: { algorithm: "cyclic-latin-square/v1", repetitions: 3, slots: parsedSlots }, claim_boundary: "diagnostic-only; no formal record, suite revision, or general/product conclusion", plan_hash: hashField(value, "plan_hash") };
  if (await hashTimingPilotPlan(plan) !== plan.plan_hash) fail("plan_hash does not match canonical plan content");
  return Object.freeze(plan);
}

export async function readTimingPilotPlan(path: string): Promise<TimingPilotPlan> {
  const value = path.endsWith(".yaml") || path.endsWith(".yml") ? Bun.YAML.parse(await Bun.file(path).text()) : JSON.parse(await Bun.file(path).text());
  return parseTimingPilotPlan(value);
}

function envText(value: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...Bun.env, ...value };
}

async function readEnvironment(root: string, plan: TimingPilotPlan): Promise<Record<string, unknown>> {
  const path = resolve(root, timingPilotEnvironmentPath);
  const environment = Bun.YAML.parse(await Bun.file(path).text()) as Record<string, unknown>;
  if (environment.id !== plan.execution.environment.id || environment.version !== plan.execution.environment.version) throw new Error("environment identity does not match timing pilot plan");
  const model = environment.model as Record<string, unknown> | undefined;
  if (!model || model.id !== plan.execution.model.id || model.version !== plan.execution.model.version) throw new Error("environment model does not match timing pilot plan");
  const runtime = environment.agent_runtime as Record<string, unknown> | undefined;
  if (!runtime || runtime.id !== plan.execution.agent.id || runtime.version !== plan.execution.agent.version) throw new Error("environment Agent runtime does not match timing pilot plan");
  const sandbox = environment.sandbox as Record<string, unknown> | undefined;
  if (!sandbox || sandbox.policy_hash !== plan.execution.tool_policy_hash) throw new Error("environment policy hash does not match timing pilot plan");
  const dependencies = environment.dependencies as Record<string, unknown> | undefined;
  if (!dependencies || typeof dependencies.lockfile !== "string" || typeof dependencies.lockfile_sha256 !== "string") throw new Error("environment dependency identity is incomplete");
  const lockfilePath = resolve(root, dependencies.lockfile);
  if (await sha256File(lockfilePath) !== dependencies.lockfile_sha256) throw new Error("environment lockfile hash does not match");
  return environment;
}

async function validatePromptAndCandidate(root: string, plan: TimingPilotPlan): Promise<void> {
  const promptPath = resolve(root, plan.prompts.system_prompt_path);
  if (await sha256File(promptPath) !== plan.prompts.system_prompt_sha256) throw new Error("system prompt hash does not match timing pilot plan");
  const slot = plan.schedule.slots[0];
  const deliveryPlanWithoutHash: Omit<StagedPracticeDeliveryPlan, "plan_hash"> = {
    schema_version: "staged-practice-delivery/v1",
    id: `async-report-timing-pilot-${slot.attempt_id}`,
    candidate: plan.candidate,
    treatment: { root: plan.treatment.root, id: plan.treatment.id, version: plan.treatment.version },
    delivery: { condition_id: slot.condition_id, delivery_node: slot.delivery_node },
    prompts: { task_path: plan.prompts.task_path, followup_path: plan.prompts.followup_path, task_sha256: plan.prompts.task_sha256, followup_sha256: plan.prompts.followup_sha256, checkpoint_marker: plan.prompts.checkpoint_marker, checkpoint_resume_message: plan.prompts.checkpoint_resume_message },
    execution: { model: plan.execution.model.id, model_version: plan.execution.model.version, system_prompt_hash: plan.prompts.system_prompt_sha256, tool_policy_hash: plan.execution.tool_policy_hash, environment: plan.execution.environment, budget: plan.execution.budget },
  };
  const deliveryPlan = { ...deliveryPlanWithoutHash, plan_hash: await sha256Text(JSON.stringify(sortKeys(deliveryPlanWithoutHash))) } as StagedPracticeDeliveryPlan;
  await prepareStagedPracticeDelivery(deliveryPlan, root);
}

async function validateIsolation(root: string): Promise<void> {
  await assertSeparateRoots(resolve(root, ".run-workspaces/async-report-timing-pilot-v1/probe"), resolve(root, "scratch/async-report-timing-pilot-v1/preflight"));
  const workspaceFromRoot = relative(resolve(root, ".run-workspaces"), resolve(root, ".run-workspaces/async-report-timing-pilot-v1/probe"));
  if (workspaceFromRoot.startsWith("..") || isAbsolute(workspaceFromRoot)) throw new Error("probe workspace is not runner-owned");
}

function gate(id: string, status: TimingPilotGateStatus, reason?: string): TimingPilotGate {
  return Object.freeze({ id, status, ...(reason ? { reason } : {}) });
}

function summaryBase(plan: TimingPilotPlan, calibrationStatus: TimingPilotPreflightSummary["judge"]["calibration_status"] = "not-run", calibrationCalls = 0): Omit<TimingPilotPreflightSummary, "status" | "allowed_to_start" | "gates"> {
  return { schema_version: timingPilotPreflightSchemaVersion, plan_hash: plan.plan_hash, model: plan.execution.model, agent: { id: plan.execution.agent.id, version: plan.execution.agent.version }, environment: plan.execution.environment, budget: plan.execution.budget, cost_estimate: { agent_attempts: 9, judge_calibration_calls: 9, judge_scoring_calls: 9, agent_max_duration_ms: plan.execution.budget.max_duration_ms * 9, total_judge_calls: 18, cost_usd: "unavailable" }, judge: { provider_id: plan.judge.provider_id, model: plan.judge.model, real_opt_in: false, calibration_status: calibrationStatus, calibration_calls: calibrationCalls } };
}

export async function dryRunTimingPilot(options: { root?: string; plan: TimingPilotPlan }): Promise<TimingPilotDryRun> {
  const root = resolve(options.root ?? workspaceRoot);
  await readEnvironment(root, options.plan);
  await validatePromptAndCandidate(root, options.plan);
  await validateIsolation(root);
  return { plan_hash: options.plan.plan_hash, slot_count: options.plan.schedule.slots.length, slots: options.plan.schedule.slots, candidate_ready: true, environment_ready: true, prompt_ready: true, isolation_ready: true };
}

export async function runTimingPilotPreflight(options: TimingPilotPreflightOptions = {}): Promise<TimingPilotPreflightSummary> {
  const root = resolve(options.root ?? workspaceRoot);
  let plan: TimingPilotPlan;
  try {
    plan = options.plan ?? await readTimingPilotPlan(resolve(root, options.plan_path ?? timingPilotPlanPath));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const fallback = options.plan ?? { plan_hash: "0".repeat(64), execution: { model: { id: timingPilotModel, version: timingPilotModelVersion }, agent: { id: "pi", version: "0.85.1" }, environment: { id: "local-pi", version: "v4" }, budget: { max_turns: timingPilotMaxTurns, max_duration_ms: timingPilotMaxDurationMs } }, judge: { provider_id: timingPilotJudgeProvider, model: timingPilotJudgeModel } } as TimingPilotPlan;
    return { ...summaryBase(fallback), status: "invalid-plan", allowed_to_start: false, gates: [gate("plan", "failed", reason)], failure_reason: reason };
  }
  const gates: TimingPilotGate[] = [];
  let calibrationStatus: TimingPilotPreflightSummary["judge"]["calibration_status"] = "not-run";
  let calibrationCalls = 0;
  let judgeRealOptIn = false;
  const environmentGate = await (async () => { try { await readEnvironment(root, plan); return gate("environment", "passed"); } catch (error) { return gate("environment", "failed", error instanceof Error ? error.message : String(error)); } })();
  gates.push(environmentGate);
  const dryRunGate = await (async () => { try { await dryRunTimingPilot({ root, plan }); return gate("plan-dry-run", "passed"); } catch (error) { return gate("plan-dry-run", "failed", error instanceof Error ? error.message : String(error)); } })();
  gates.push(dryRunGate);
  if (options.run_model_probe !== false && environmentGate.status === "passed" && dryRunGate.status === "passed") {
    try {
      const probe = options.model_probe ?? (async ({ root: probeRoot, model }) => {
        const command = await piCommand(probeRoot);
        const env = envText(options.env ?? {});
        const shellPath = await localPiShellPath(env);
        const catalog = await configureLocalPiModelCatalog(env, model, shellPath);
        if (catalog) { env.PI_CODING_AGENT_DIR = catalog.directory; env.PI_OFFLINE = "1"; }
        const key = localPiApiKey(env);
        if (key) env.DEEPSEEK_API_KEY = key;
        try { return await preflightPiAndModel(command, localPiModelArgument(model), undefined, env); } finally { catalog?.cleanup(); }
      });
      const result = await probe({ root, model: plan.execution.model.id });
      if (result.version !== plan.execution.agent.version) throw new Error(`Pi probe version ${result.version} does not match plan ${plan.execution.agent.version}`);
      gates.push(gate("pi-model-probe", "passed"));
    } catch (error) { gates.push(gate("pi-model-probe", "failed", error instanceof Error ? error.message : String(error))); }
  } else if (options.run_model_probe === false) gates.push(gate("pi-model-probe", "not-run", "model probe disabled by caller"));
  else gates.push(gate("pi-model-probe", "blocked", "environment or plan dry-run failed"));
  const judgeEnv = asyncReportJudgeEnv(envText(options.env ?? {}));
  judgeRealOptIn = judgeEnv.real && Boolean(judgeEnv.baseUrl && judgeEnv.apiKey && judgeEnv.model === plan.judge.model);
  if (!judgeRealOptIn) gates.push(gate("judge-provider", "failed", "Judge real opt-in, endpoint, key, or model is unavailable")); else gates.push(gate("judge-provider", "passed"));
  if (options.run_judge_calibration !== false && judgeRealOptIn && gates.every((entry) => entry.status === "passed" || entry.id === "judge-provider")) {
    try {
      const report = await (options.judge_calibration ?? runRealCalibration)(envText(options.env ?? {}));
      calibrationStatus = report.status;
      calibrationCalls = report.calls;
      gates.push(gate("judge-calibration", report.status === "qualified" ? "passed" : "failed", report.reason));
    } catch (error) { calibrationStatus = "unavailable"; gates.push(gate("judge-calibration", "failed", error instanceof Error ? error.message : String(error))); }
  } else gates.push(gate("judge-calibration", "blocked", "Judge provider preflight or earlier gate failed"));
  const failedGate = gates.find((entry) => entry.status === "failed" || entry.status === "blocked");
  const base = summaryBase(plan, calibrationStatus, calibrationCalls);
  return { ...base, judge: { ...base.judge, real_opt_in: judgeRealOptIn }, status: failedGate ? "preflight-blocked" : "ready", allowed_to_start: !failedGate, gates, ...(failedGate?.reason ? { failure_reason: `${failedGate.id}: ${failedGate.reason}` } : {}) };
}

export async function writeTimingPilotDryRunSummary(result: TimingPilotDryRun, directory: string): Promise<{ json_path: string; markdown_path: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = join(directory, "dry-run-summary.json");
  const markdownPath = join(directory, "dry-run-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = ["# Async-report timing pilot dry-run", "", `- plan_hash: ${result.plan_hash}`, `- slot_count: ${result.slot_count}`, `- candidate_ready: ${result.candidate_ready}`, `- environment_ready: ${result.environment_ready}`, `- prompt_ready: ${result.prompt_ready}`, `- isolation_ready: ${result.isolation_ready}`, "", "## Slots", ...result.slots.map((slot) => `- ${slot.attempt_id}: ${slot.condition_id} (block ${slot.block}, position ${slot.position})`)];
  await writeFile(markdownPath, `${lines.join("\n")}\n`);
  return { json_path: jsonPath, markdown_path: markdownPath };
}

export async function writeTimingPilotPreflightSummary(summary: TimingPilotPreflightSummary, directory: string): Promise<{ json_path: string; markdown_path: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = join(directory, "preflight-summary.json");
  const markdownPath = join(directory, "preflight-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  const lines = ["# Async-report timing pilot preflight", "", `- status: ${summary.status}`, `- allowed_to_start: ${summary.allowed_to_start}`, `- plan_hash: ${summary.plan_hash}`, `- model: ${summary.model.id} (${summary.model.version})`, `- Pi: ${summary.agent.id} ${summary.agent.version}`, `- environment: ${summary.environment.id}/${summary.environment.version}`, `- budget: ${summary.budget.max_turns} turns / ${summary.budget.max_duration_ms} ms`, `- estimated agent duration: ${summary.cost_estimate.agent_max_duration_ms} ms`, `- estimated Judge calls: ${summary.cost_estimate.total_judge_calls}`, `- estimated cost USD: ${summary.cost_estimate.cost_usd}`, `- Judge: ${summary.judge.provider_id} / ${summary.judge.model}`, `- Judge real opt-in: ${summary.judge.real_opt_in}`, `- Judge calibration: ${summary.judge.calibration_status} (${summary.judge.calibration_calls} calls)`, "", "## Gates", ...summary.gates.map((entry) => `- ${entry.id}: ${entry.status}${entry.reason ? ` — ${entry.reason}` : ""}`)];
  await writeFile(markdownPath, `${lines.join("\n")}\n`);
  return { json_path: jsonPath, markdown_path: markdownPath };
}

function argValue(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; }

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const root = resolve(argValue(args, "--root") ?? workspaceRoot);
  const mode = args.includes("--dry-run") ? "dry-run" : "preflight";
  const planPath = argValue(args, "--plan") ?? timingPilotPlanPath;
  const artifactDirectory = resolve(argValue(args, "--artifacts") ?? join("scratch", "async-report-timing-pilot-v1", "preflight"));
  try {
    const plan = await readTimingPilotPlan(resolve(root, planPath));
    if (mode === "dry-run") {
      const result = await dryRunTimingPilot({ root, plan });
      const paths = await writeTimingPilotDryRunSummary(result, artifactDirectory);
      console.log(JSON.stringify({ ...result, artifacts: paths }, null, 2));
    } else {
      const summary = await runTimingPilotPreflight({ root, plan });
      const paths = await writeTimingPilotPreflightSummary(summary, artifactDirectory);
      console.log(JSON.stringify({ ...summary, artifacts: paths }, null, 2));
      if (!summary.allowed_to_start) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}