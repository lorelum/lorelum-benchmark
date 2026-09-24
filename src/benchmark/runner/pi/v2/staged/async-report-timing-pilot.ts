import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { sha256File, sha256Text, workspaceRoot } from "../../../../fs";
import { asyncReportJudgeEnv } from "../../../../judge/async-report-replan/v1/llm";
import { evaluationPlanHash } from "../../../../judge/async-report-replan/v1/plan";
import { redactSensitiveText } from "../../../../judge/async-report-replan/v1/canonical";
import { rubricHash } from "../../../../judge/async-report-replan/v1/rubric";
import { accountingSchemaVersion, replanEvidenceSchemaVersion } from "../../../../judge/async-report-replan/v1/types";
import { calibrationDiagnosticsForPreflightError, createCachedReportDiagnostics, evaluateCalibrationGateChecks, readCalibrationThresholds, renderJudgeCalibrationDiagnosticsMarkdown, runRealCalibrationWithDiagnostics, type JudgeCalibrationDiagnostics } from "./timing-pilot-judge-diagnostics";
import { calibrationAttestationKey, calibrationScope, resolveCalibrationStatus } from "../../../../judge/async-report-replan/v1/calibration";
import type { CalibrationReport } from "../../../../judge/async-report-replan/v1/types";
import { configureLocalPiModelCatalog, localPiApiKey, localPiModelArgument, localPiModelBaseUrl, localPiShellPath } from "../local-pi-model-catalog";
import { piCommand, preflightTimeoutMs, run as runPiCommand } from "../preflight";
import { assertSeparateRoots, prepareStagedPracticeDelivery, type StagedPracticeDeliveryPlan } from "./staged-practice-delivery";
import { loadEvaluatorIdentity } from "../../../../../../incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/identity";

export const timingPilotSchemaVersion = "async-report-timing-pilot/v1" as const;
export const timingPilotPreflightSchemaVersion = "async-report-timing-pilot-preflight/v1" as const;
export const timingPilotPlanPath = "incubator/practice-injection-plans/async-report-timing-pilot-v1.yaml" as const;
export const timingPilotEnvironmentPath = "environments/local-pi/v4/environment.yaml" as const;
export const timingPilotRunnerId = "async-report-timing-pilot-runner" as const;
export const timingPilotRunnerVersion = "v1" as const;
export const timingPilotRunnerManifestPath = "incubator/practice-injection-plans/async-report-timing-pilot-runner-v1.json" as const;
export const timingPilotEnvironmentManifestSha256 = "555acce5f7cc79e203113b0f5025f715fe5a6de88dd4e2b54f308b71a3f20247" as const;
export const timingPilotBunVersion = "1.4.2" as const;
export const timingPilotNodeVersion = "24.21.0" as const;
export const timingPilotEvaluatorManifestPath = "incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/evaluator.yaml" as const;
export const timingPilotEvaluatorSnapshotPath = "incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/snapshot.json" as const;
export const timingPilotEvaluatorId = "async-report-deterministic-evaluator" as const;
export const timingPilotEvaluatorVersion = "v1" as const;
export const timingPilotEvaluatorSnapshotId = "7d68a9e9fc32a2fc96407ad1b4f6d416f6138cddc73587614be6b6d5e8db8be1" as const;
export const timingPilotSystemPromptPath = "prompts/async-report-timing-pilot/v1/system.md" as const;
export const timingPilotModel = "deepseek/deepseek-v4-flash" as const;
export const timingPilotModelVersion = "operator-local-experiment" as const;
export const timingPilotToolPolicyHash = "095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2" as const;
export const timingPilotMaxTurns = 128 as const;
export const timingPilotMaxDurationMs = 1_500_000 as const;
export const timingPilotJudgeProvider = "judge-agent/async-report-replan/v1" as const;
export const timingPilotJudgeModel = "deepseek/deepseek-v4-flash" as const;
export const timingPilotJudgeEvaluationPlanHash = "3b6ffa1acec2e2d42551032cd6629509260cc026c5a2211798bc3229508da388" as const;
export const timingPilotJudgeRubricHash = "2ff71b4208479e5bd3f246c9450264f52ec01f59de2944916d8e540bd03afe98" as const;

export const timingPilotNodes = ["task_start", "constraint_followup", "first_implementation_checkpoint"] as const;
export type TimingPilotNode = (typeof timingPilotNodes)[number];
export type TimingPilotGateStatus = "passed" | "failed" | "blocked" | "not-run" | "accepted-diagnostic";
export type TimingPilotStatus = "ready" | "preflight-blocked" | "invalid-plan";
export type TimingPilotExecutionMode = "judge-scored" | "diagnostic-only";

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
  evaluator: Readonly<{ id: typeof timingPilotEvaluatorId; version: typeof timingPilotEvaluatorVersion; snapshot_id: typeof timingPilotEvaluatorSnapshotId }>;
  runner: Readonly<{ id: typeof timingPilotRunnerId; version: typeof timingPilotRunnerVersion; manifest_path: typeof timingPilotRunnerManifestPath; manifest_sha256: string }>;
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
    environment: Readonly<{ id: "local-pi"; version: "v4"; bun: typeof timingPilotBunVersion; node: typeof timingPilotNodeVersion; manifest_sha256: typeof timingPilotEnvironmentManifestSha256 }>;
    tools: readonly ["read", "bash", "edit", "write", "grep", "find", "ls"];
    tool_policy_hash: typeof timingPilotToolPolicyHash;
    budget: Readonly<{ max_turns: 128; max_duration_ms: 1_500_000 }>;
  }>;
  judge: Readonly<{
    provider_id: typeof timingPilotJudgeProvider;
    provider_version: "v1";
    model: typeof timingPilotJudgeModel;
    evaluation_plan_hash: typeof timingPilotJudgeEvaluationPlanHash;
    rubric_hash: typeof timingPilotJudgeRubricHash;
    evidence_schema: typeof replanEvidenceSchemaVersion;
    accounting_schema: typeof accountingSchemaVersion;
    real_opt_in_env: "LORELUM_JUDGE_REAL=1";
    calibration: Readonly<{ max_calls: 9; repetitions: 3 }>;
    scoring: Readonly<{ calls_per_attempt: 1; retries: 0 }>;
  }>;
  schedule: Readonly<{ algorithm: "cyclic-latin-square/v1"; repetitions: 3; slots: readonly TimingPilotSlot[] }>;
  claim_boundary: "diagnostic-only; no formal record, suite revision, or general/product conclusion";
  plan_hash: string;
}>;

export type TimingPilotGate = Readonly<{ id: string; status: TimingPilotGateStatus; reason?: string }>;
export type TimingPilotPreflightUsage = Readonly<{ input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; cost_usd: number | null }>;

export type TimingPilotCostEstimate = Readonly<{
  preflight_cost_usd: number | null;
  agent_attempts: 9;
  judge_calibration_calls: number;
  judge_scoring_calls: number;
  agent_max_duration_ms: number;
  total_judge_calls: number;
  cost_usd: "unavailable";
}>;

export type TimingPilotPreflightSummary = Readonly<{
  schema_version: typeof timingPilotPreflightSchemaVersion;
  created_at: string;
  preflight_duration_ms: number;
  pi_probe: Readonly<{ calls: number; duration_ms: number; usage: TimingPilotPreflightUsage }>;
  status: TimingPilotStatus;
  execution_mode: TimingPilotExecutionMode;
  allowed_to_start: boolean;
  judge_score_usable: boolean;
  plan_hash: string;
  model: Readonly<{ id: string; version: string }>;
  evaluator: Readonly<{ id: string; version: string; snapshot_id: string }>;
  runner: Readonly<{ id: string; version: string; manifest_sha256: string }>;
  agent: Readonly<{ id: string; version: string; command: string; observed_version: string | null; command_sha256: string | null }>;
  environment: Readonly<{ id: string; version: string; bun: string; node: string; manifest_sha256: string }>;
  runtime: Readonly<{ observed_bun: string | null; observed_node: string | null }>;
  budget: Readonly<{ max_turns: number; max_duration_ms: number }>;
  cost_estimate: TimingPilotCostEstimate;
  judge: Readonly<{
    provider_id: string;
    model: string;
    real_opt_in: boolean;
    calibration_status: "qualified" | "diagnostic" | "unavailable" | "not-run";
    calibration_hash: string | null;
    calibration_reused: boolean;
    calibration_calls: number;
    calibration_duration_ms: number;
    calibration_usage: TimingPilotPreflightUsage;
  }>;

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
  execution_mode?: TimingPilotExecutionMode;
  calibration_diagnostics?: JudgeCalibrationDiagnostics;
  runtime_probe?: () => Promise<{ bun: string; node: string }>;
  model_probe?: (input: { root: string; model: string }) => Promise<{ version: string; command_sha256: string; duration_ms?: number; usage?: unknown }>;
  judge_calibration?: (env: Record<string, string | undefined>) => Promise<CalibrationReport>;
  calibration_report?: CalibrationReport;
  on_judge_calibration_report?: (report: CalibrationReport) => void;
  on_judge_calibration_diagnostics?: (diagnostics: JudgeCalibrationDiagnostics) => void;
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
const expectedPlanKeys = ["schema_version", "id", "version", "lifecycle_stage", "candidate", "evaluator", "runner", "treatment", "prompts", "execution", "judge", "schedule", "claim_boundary", "plan_hash"] as const;
const timingPilotRunnerSourcePaths = [
  "src/benchmark/runner/pi/v2/staged/async-report-timing-pilot.ts",
  "src/benchmark/runner/pi/v2/staged/async-report-timing-pilot-runner.ts",
  "src/benchmark/runner/pi/v2/staged/timing-pilot-judge-diagnostics.ts",
  "src/benchmark/runner/pi/v2/staged/staged-practice-delivery.ts",
  "src/benchmark/runner/pi/v2/staged/staged-practice-delivery-pi-adapter.ts",
  "src/benchmark/runner/pi/v2/staged/timing-pilot-runtime-extension.ts",
  "src/benchmark/runner/pi/v2/staged/checkpoint-stop-extension.ts",
  "src/benchmark/runner/pi/v2/staged/checkpoint-marker.ts",
  "src/benchmark/runner/pi/v2/local-pi-model-catalog.ts",
  "src/benchmark/runner/pi/v2/preflight.ts",
  "src/benchmark/judge/async-report-replan/v1/accounting.ts",
  "src/benchmark/judge/async-report-replan/v1/calibration.ts",
  "src/benchmark/judge/async-report-replan/v1/evidence.ts",
  "src/benchmark/judge/async-report-replan/v1/llm.ts",
  "src/benchmark/judge/async-report-replan/v1/plan.ts",
  "src/benchmark/judge/async-report-replan/v1/provider.ts",
  "src/benchmark/judge/async-report-replan/v1/rubric.ts",
  "src/benchmark/judge/async-report-replan/v1/run.ts",
  "src/benchmark/judge/async-report-replan/v1/score.ts",
] as const;

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
  if (!isRecord(value.candidate) || !isRecord(value.runner) || !isRecord(value.treatment) || !isRecord(value.prompts) || !isRecord(value.execution) || !isRecord(value.judge) || !isRecord(value.schedule)) fail("plan sections are invalid");
  const candidate = value.candidate;
  exactKeys(candidate, ["path", "source_commit", "snapshot_id"], "candidate");
  if (candidate.path !== "incubator/practice-injection/async-report-lifecycle-v1") fail("candidate path is not the frozen #196 candidate");
  const parsedCandidate = { path: stringField(candidate, "path"), source_commit: commitField(candidate, "source_commit"), snapshot_id: hashField(candidate, "snapshot_id") };
  const evaluator = value.evaluator;
  exactKeys(evaluator, ["id", "version", "snapshot_id"], "evaluator");
  if (evaluator.id !== timingPilotEvaluatorId || evaluator.version !== timingPilotEvaluatorVersion || evaluator.snapshot_id !== timingPilotEvaluatorSnapshotId) fail("evaluator identity is not the frozen #202 evaluator");
  const parsedEvaluator = { id: timingPilotEvaluatorId, version: timingPilotEvaluatorVersion, snapshot_id: timingPilotEvaluatorSnapshotId };
  const runner = value.runner;
  exactKeys(runner, ["id", "version", "manifest_path", "manifest_sha256"], "runner");
  if (runner.id !== timingPilotRunnerId || runner.version !== timingPilotRunnerVersion || runner.manifest_path !== timingPilotRunnerManifestPath) fail("runner implementation identity is not the frozen timing pilot runner");
  const parsedRunner = { id: timingPilotRunnerId, version: timingPilotRunnerVersion, manifest_path: timingPilotRunnerManifestPath, manifest_sha256: hashField(runner, "manifest_sha256") };
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
  exactKeys(execution.agent, ["id", "version", "command"], "execution.agent"); exactKeys(execution.model, ["id", "version"], "execution.model"); exactKeys(execution.environment, ["id", "version", "bun", "node", "manifest_sha256"], "execution.environment"); exactKeys(execution.budget, ["max_turns", "max_duration_ms"], "execution.budget");
  if (execution.agent.id !== "pi" || execution.agent.version !== "0.85.1" || execution.agent.command !== "pi" || execution.model.id !== timingPilotModel || execution.model.version !== timingPilotModelVersion || execution.environment.id !== "local-pi" || execution.environment.version !== "v4" || execution.environment.bun !== timingPilotBunVersion || execution.environment.node !== timingPilotNodeVersion || execution.environment.manifest_sha256 !== timingPilotEnvironmentManifestSha256 || JSON.stringify(execution.tools) !== JSON.stringify(["read", "bash", "edit", "write", "grep", "find", "ls"]) || execution.tool_policy_hash !== timingPilotToolPolicyHash || execution.budget.max_turns !== timingPilotMaxTurns || execution.budget.max_duration_ms !== timingPilotMaxDurationMs) fail("execution identity or budget is not frozen");
  const parsedExecution = { agent: { id: "pi" as const, version: "0.85.1" as const, command: "pi" as const }, model: { id: timingPilotModel, version: timingPilotModelVersion }, environment: { id: "local-pi" as const, version: "v4" as const, bun: timingPilotBunVersion, node: timingPilotNodeVersion, manifest_sha256: timingPilotEnvironmentManifestSha256 }, tools: ["read", "bash", "edit", "write", "grep", "find", "ls"] as const, tool_policy_hash: timingPilotToolPolicyHash, budget: { max_turns: timingPilotMaxTurns, max_duration_ms: timingPilotMaxDurationMs } };
  const judge = value.judge;
  exactKeys(judge, ["provider_id", "provider_version", "model", "evaluation_plan_hash", "rubric_hash", "evidence_schema", "accounting_schema", "real_opt_in_env", "calibration", "scoring"], "judge");
  if (!isRecord(judge.calibration) || !isRecord(judge.scoring)) fail("judge budget sections are invalid");
  exactKeys(judge.calibration, ["max_calls", "repetitions"], "judge.calibration"); exactKeys(judge.scoring, ["calls_per_attempt", "retries"], "judge.scoring");
  if (judge.provider_id !== timingPilotJudgeProvider || judge.provider_version !== "v1" || judge.model !== timingPilotJudgeModel || judge.evaluation_plan_hash !== timingPilotJudgeEvaluationPlanHash || judge.rubric_hash !== timingPilotJudgeRubricHash || judge.evidence_schema !== replanEvidenceSchemaVersion || judge.accounting_schema !== accountingSchemaVersion || judge.real_opt_in_env !== "LORELUM_JUDGE_REAL=1" || judge.calibration.max_calls !== 9 || judge.calibration.repetitions !== 3 || judge.scoring.calls_per_attempt !== 1 || judge.scoring.retries !== 0) fail("judge identity or budget is not frozen");
  const parsedJudge = { provider_id: timingPilotJudgeProvider, provider_version: "v1" as const, model: timingPilotJudgeModel, evaluation_plan_hash: timingPilotJudgeEvaluationPlanHash, rubric_hash: timingPilotJudgeRubricHash, evidence_schema: replanEvidenceSchemaVersion, accounting_schema: accountingSchemaVersion, real_opt_in_env: "LORELUM_JUDGE_REAL=1" as const, calibration: { max_calls: 9 as const, repetitions: 3 as const }, scoring: { calls_per_attempt: 1 as const, retries: 0 as const } };
  const schedule = value.schedule;
  exactKeys(schedule, ["algorithm", "repetitions", "slots"], "schedule");
  if (schedule.algorithm !== "cyclic-latin-square/v1" || schedule.repetitions !== 3 || !Array.isArray(schedule.slots) || schedule.slots.length !== 9) fail("schedule identity or size is invalid");
  const parsedSlots = schedule.slots.map(parseSlot);
  const expectedSlots = buildTimingPilotSchedule();
  if (JSON.stringify(parsedSlots) !== JSON.stringify(expectedSlots)) fail("schedule does not match the frozen cyclic Latin square");
  if (value.claim_boundary !== "diagnostic-only; no formal record, suite revision, or general/product conclusion") fail("claim boundary is invalid");
  const plan: TimingPilotPlan = { schema_version: timingPilotSchemaVersion, id: "async-report-timing-pilot", version: "v1", lifecycle_stage: value.lifecycle_stage, candidate: parsedCandidate, evaluator: parsedEvaluator, runner: parsedRunner, treatment: parsedTreatment, prompts: parsedPrompts, execution: parsedExecution, judge: parsedJudge, schedule: { algorithm: "cyclic-latin-square/v1", repetitions: 3, slots: parsedSlots }, claim_boundary: "diagnostic-only; no formal record, suite revision, or general/product conclusion", plan_hash: hashField(value, "plan_hash") };
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

async function resolveContainedPath(root: string, path: string, label: string): Promise<string> {
  if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part.length === 0)) throw new Error(`${label} must be a normalized relative path`);
  const rootReal = await realpath(resolve(root));
  const targetReal = await realpath(resolve(root, path));
  const fromRoot = relative(rootReal, targetReal);
  if (fromRoot === ".." || fromRoot.startsWith(`..${"/"}`) || fromRoot.startsWith(`..${"\\"}`) || isAbsolute(fromRoot)) throw new Error(`${label} escapes runner root`);
  return targetReal;
}

async function canonicalFileHash(path: string): Promise<string> {
  return sha256Text((await Bun.file(path).text()).replace(/\r\n?/g, "\n"));
}

async function readHostRuntime(): Promise<{ bun: string; node: string }> {
  const child = Bun.spawn(["node", "--version"], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`Node runtime probe failed: ${(stderr || stdout).trim()}`);
  return { bun: Bun.version, node: (stdout || stderr).trim().replace(/^v/, "") };
}

async function readEnvironment(root: string, plan: TimingPilotPlan): Promise<Record<string, unknown>> {
  const path = await resolveContainedPath(root, timingPilotEnvironmentPath, "environment manifest");
  const environmentText = await Bun.file(path).text();
  const environment = Bun.YAML.parse(environmentText) as Record<string, unknown>;
  if (environment.id !== plan.execution.environment.id || environment.version !== plan.execution.environment.version || environment.bun !== plan.execution.environment.bun || environment.node !== plan.execution.environment.node) throw new Error("environment identity does not match timing pilot plan");
  if (await canonicalFileHash(path) !== plan.execution.environment.manifest_sha256) throw new Error("environment manifest hash does not match timing pilot plan");
  const model = environment.model as Record<string, unknown> | undefined;
  if (!model || model.id !== plan.execution.model.id || model.version !== plan.execution.model.version) throw new Error("environment model does not match timing pilot plan");
  const runtime = environment.agent_runtime as Record<string, unknown> | undefined;
  if (!runtime || runtime.id !== plan.execution.agent.id || runtime.version !== plan.execution.agent.version || runtime.command !== plan.execution.agent.command) throw new Error("environment Agent runtime does not match timing pilot plan");
  const sandbox = environment.sandbox as Record<string, unknown> | undefined;
  if (!sandbox || sandbox.policy_hash !== plan.execution.tool_policy_hash) throw new Error("environment policy hash does not match timing pilot plan");
  const dependencies = environment.dependencies as Record<string, unknown> | undefined;
  if (!dependencies || typeof dependencies.package !== "string" || typeof dependencies.manifest !== "string" || typeof dependencies.lockfile !== "string" || typeof dependencies.lockfile_sha256 !== "string") throw new Error("environment dependency identity is incomplete");
  const expectedPackage = `@earendil-works/pi-coding-agent@${plan.execution.agent.version}`;
  if (dependencies.package !== expectedPackage) throw new Error("environment Pi package identity does not match the timing pilot plan");
  const manifestPath = await resolveContainedPath(root, dependencies.manifest, "environment package manifest");
  const manifest = await Bun.file(manifestPath).json() as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  const declaredPiVersion = manifest.devDependencies?.["@earendil-works/pi-coding-agent"] ?? manifest.dependencies?.["@earendil-works/pi-coding-agent"];
  if (declaredPiVersion !== plan.execution.agent.version) throw new Error("package manifest Pi version does not match the timing pilot plan");
  const lockfilePath = await resolveContainedPath(root, dependencies.lockfile, "environment lockfile");
  if (await sha256File(lockfilePath) !== dependencies.lockfile_sha256) throw new Error("environment lockfile hash does not match");
  return environment;
}

function redactedReason(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function assertActiveTimingPilot(plan: TimingPilotPlan): void {
  if (plan.lifecycle_stage !== "pilot") throw new Error("timing pilot plan is retired and cannot run as the active pilot");
}

function commandIdentity(command: string): string {
  return command.split(/[\\/]/).pop()?.replace(/\.(?:cmd|exe)$/i, "") ?? command;
}

async function resolvePiCommandFile(root: string, env: Record<string, string | undefined>): Promise<{ command: string; sha256: string }> {
  const configured = env.LORELUM_PI_COMMAND?.trim();
  const command = configured || await piCommand(root);
  const hasPath = isAbsolute(command) || command.includes("/") || command.includes("\\");
  const found = hasPath ? resolve(root, command) : Bun.which(command);
  if (!found) throw new Error("pinned Pi command could not be resolved");
  const path = await realpath(found);
  const info = await lstat(path);
  if (!info.isFile()) throw new Error("pinned Pi command is not a file");
  return { command: path, sha256: await sha256File(path) };
}

export async function inspectTimingPilotPiCommand(root: string, env: Record<string, string | undefined> = Bun.env): Promise<{ command: string; sha256: string; version: string }> {
  const resolvedCommand = await resolvePiCommandFile(root, env);
  const result = await runPiCommand([resolvedCommand.command, "--version"], root, preflightTimeoutMs, envText(env), true);
  if (result.timedOut || result.code !== 0) throw new Error("pinned Pi command version check failed");
  return { ...resolvedCommand, version: result.stdout.trim() };
}

async function probeTimingPilotPiAndModel(root: string, model: string, plan: TimingPilotPlan, suppliedEnv: Record<string, string | undefined>): Promise<{ version: string; command_sha256: string; duration_ms: number; usage: unknown }> {
  const probeStarted = performance.now();
  const env = envText(suppliedEnv);
  if (!localPiModelBaseUrl(env) || !localPiApiKey(env)) throw new Error("Pi gateway endpoint or credential is unavailable");
  const resolvedCommand = await resolvePiCommandFile(root, env);
  if (commandIdentity(resolvedCommand.command) !== plan.execution.agent.command) throw new Error("resolved Pi command does not match the timing pilot environment");
  const shellPath = await localPiShellPath(env);
  const catalog = await configureLocalPiModelCatalog(env, model, shellPath);
  const probeDirectory = await mkdtemp(join(tmpdir(), "lorelum-timing-pilot-probe-"));
  const statePath = join(probeDirectory, "turn-budget.json");
  await Bun.write(statePath, JSON.stringify({ turns: 0 }) + "\n");
  const probeEnv: Record<string, string> = {};
  for (const name of ["PATH", "Path", "PATHEXT", "SystemRoot", "HOME", "USERPROFILE", "TEMP", "TMP"]) {
    const value = env[name];
    if (value) probeEnv[name] = value;
  }
  if (catalog) { probeEnv.PI_CODING_AGENT_DIR = catalog.directory; probeEnv.PI_OFFLINE = "1"; }
  const key = localPiApiKey(env);
  if (key) probeEnv.DEEPSEEK_API_KEY = key;
  probeEnv.LORELUM_TIMING_PILOT_TURN_STATE = statePath;
  probeEnv.LORELUM_TIMING_PILOT_MAX_TURNS = "2";
  const modelArgs = [
    resolvedCommand.command, "--print", "--mode", "json", "--no-session", "--no-tools", "--no-context-files", "--no-extensions", "--no-skills", "--no-prompt-templates",
    "--model", localPiModelArgument(model), "--extension", join(import.meta.dir, "timing-pilot-runtime-extension.ts"),
    "--append-system-prompt", resolve(root, plan.prompts.system_prompt_path), "Reply with exactly: ok",
  ];
  try {
    const version = await runPiCommand([resolvedCommand.command, "--version"], probeDirectory, preflightTimeoutMs, probeEnv, false);
    if (version.timedOut || version.code !== 0 || version.stdout.trim() !== plan.execution.agent.version) throw new Error("Pi version does not match the timing pilot environment");
    const probe = await runPiCommand(modelArgs, probeDirectory, preflightTimeoutMs, probeEnv, false);
    if (probe.timedOut || probe.code !== 0 || !/\bok\b/i.test(probe.stdout)) throw new Error("target-model short probe did not complete successfully");
    const state = await Bun.file(statePath).json().catch(() => undefined) as { ready?: unknown; turns?: unknown; exhausted?: unknown } | undefined;
    if (state?.ready !== true || !Number.isInteger(state.turns) || (state.turns as number) < 1 || (state.turns as number) > 2 || state.exhausted === true) throw new Error("Pi did not apply the pinned timing pilot turn-budget extension");
    let usage: unknown;
    for (const line of probe.stdout.split(/\r?\n/)) {
      try {
        const event = JSON.parse(line) as unknown;
        if (!isRecord(event) || event.type !== "message_end" || !isRecord(event.message) || event.message.role !== "assistant") continue;
        if (isRecord(event.message.usage)) usage = event.message.usage;
      } catch { /* ignore non-JSON stdout */ }
    }
    return { version: version.stdout.trim(), command_sha256: resolvedCommand.sha256, duration_ms: Math.round(performance.now() - probeStarted), usage };
  } finally {
    catalog?.cleanup();
    await rm(probeDirectory, { recursive: true, force: true });
  }
}


export async function validateTimingPilotRunnerIdentity(root: string, plan: TimingPilotPlan): Promise<void> {
  const manifestPath = await resolveContainedPath(root, plan.runner.manifest_path, "runner source manifest");
  if (await canonicalFileHash(manifestPath) !== plan.runner.manifest_sha256) throw new Error("runner source manifest hash does not match timing pilot plan");
  const manifest = JSON.parse(await Bun.file(manifestPath).text()) as unknown;
  if (!isRecord(manifest)) throw new Error("runner source manifest is invalid");
  exactKeys(manifest, ["schema_version", "id", "version", "files"], "runner source manifest");
  if (manifest.schema_version !== "async-report-timing-pilot-runner/v1" || manifest.id !== plan.runner.id || manifest.version !== plan.runner.version || !Array.isArray(manifest.files)) throw new Error("runner source manifest identity is invalid");
  const files: Array<{ path: string; sha256: string }> = [];
  for (const [index, raw] of manifest.files.entries()) {
    if (!isRecord(raw)) throw new Error(`runner source manifest files[${index}] is invalid`);
    exactKeys(raw, ["path", "sha256"], `runner source manifest files[${index}]`);
    const path = stringField(raw, "path");
    const digest = hashField(raw, "sha256");
    files.push({ path, sha256: digest });
  }
  const expectedPaths = [...timingPilotRunnerSourcePaths].sort();
  const actualPaths = files.map((file) => file.path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error("runner source manifest file set is incomplete or unexpected");
  for (const file of files) {
    const sourcePath = await resolveContainedPath(root, file.path, "runner source file");
    if (await canonicalFileHash(sourcePath) !== file.sha256) throw new Error(`runner source hash does not match: ${file.path}`);
  }
}

async function validateEvaluatorAndJudge(root: string, plan: TimingPilotPlan): Promise<void> {
  const evaluatorRoot = await resolveContainedPath(root, "incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1", "evaluator root");
  await loadEvaluatorIdentity(evaluatorRoot);
  const evaluatorManifestPath = await resolveContainedPath(root, timingPilotEvaluatorManifestPath, "evaluator manifest");
  const evaluatorManifest = Bun.YAML.parse(await Bun.file(evaluatorManifestPath).text()) as Record<string, unknown>;
  const evaluatorCandidate = evaluatorManifest.candidate as Record<string, unknown> | undefined;
  if (evaluatorManifest.schema_version !== "async-report-deterministic-evaluator/v1" || evaluatorManifest.evaluator_version !== plan.evaluator.version || evaluatorCandidate?.id !== plan.candidate.path.split("/").pop() || evaluatorCandidate.source_commit !== plan.candidate.source_commit || evaluatorCandidate.snapshot_id !== plan.candidate.snapshot_id) throw new Error("evaluator identity does not match timing pilot plan");
  const evaluatorSnapshotPath = await resolveContainedPath(root, timingPilotEvaluatorSnapshotPath, "evaluator snapshot");
  const evaluatorSnapshot = JSON.parse(await Bun.file(evaluatorSnapshotPath).text()) as Record<string, unknown>;
  if (evaluatorSnapshot.snapshot_id !== plan.evaluator.snapshot_id) throw new Error("evaluator snapshot does not match timing pilot plan");
  if (plan.judge.evidence_schema !== replanEvidenceSchemaVersion || plan.judge.accounting_schema !== accountingSchemaVersion) throw new Error("Judge evidence contract does not match timing pilot plan");
  if (await evaluationPlanHash() !== plan.judge.evaluation_plan_hash) throw new Error("Judge evaluation plan hash does not match timing pilot plan");
  if (await rubricHash() !== plan.judge.rubric_hash) throw new Error("Judge rubric hash does not match timing pilot plan");
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
    execution: { model: plan.execution.model.id, model_version: plan.execution.model.version, system_prompt_hash: plan.prompts.system_prompt_sha256, tool_policy_hash: plan.execution.tool_policy_hash, environment: { id: plan.execution.environment.id, version: plan.execution.environment.version }, budget: plan.execution.budget },
  };
  const deliveryPlan = { ...deliveryPlanWithoutHash, plan_hash: await sha256Text(JSON.stringify(sortKeys(deliveryPlanWithoutHash))) } as StagedPracticeDeliveryPlan;
  const prepared = await prepareStagedPracticeDelivery(deliveryPlan, root);
  const provenance = prepared.prepared.provenance;
  if (provenance.repository !== plan.treatment.pack.repository || provenance.ref !== plan.treatment.pack.ref || provenance.version !== plan.treatment.pack.version || provenance.commit !== plan.treatment.pack.commit || provenance.practice_id !== plan.treatment.practice.id || provenance.content_digest !== plan.treatment.practice.content_digest || provenance.source_sha256 !== plan.treatment.practice.source_sha256 || provenance.card_sha256 !== plan.treatment.practice.card_sha256) {
    throw new Error("treatment provenance does not match timing pilot plan");
  }
}

async function validateIsolation(root: string): Promise<void> {
  await assertSeparateRoots(resolve(root, ".run-workspaces/async-report-timing-pilot-v1/probe"), resolve(root, "scratch/async-report-timing-pilot-v1/preflight"));
  const workspaceFromRoot = relative(resolve(root, ".run-workspaces"), resolve(root, ".run-workspaces/async-report-timing-pilot-v1/probe"));
  if (workspaceFromRoot.startsWith("..") || isAbsolute(workspaceFromRoot)) throw new Error("probe workspace is not runner-owned");
}

function gate(id: string, status: TimingPilotGateStatus, reason?: string): TimingPilotGate {
  return Object.freeze({ id, status, ...(reason ? { reason } : {}) });
}

function preflightUsage(value: unknown): TimingPilotPreflightUsage {
  const source = isRecord(value) ? value : {};
  const number = (field: string, alternate?: string): number | null => {
    const candidate = source[field] ?? (alternate ? source[alternate] : undefined);
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
  };
  return {
    input_tokens: number("input_tokens", "input"),
    output_tokens: number("output_tokens", "output"),
    total_tokens: number("total_tokens", "total"),
    cost_usd: number("cost_usd", "cost"),
  };
}

function summaryBase(plan: TimingPilotPlan, calibrationStatus: TimingPilotPreflightSummary["judge"]["calibration_status"] = "not-run", calibrationCalls = 0, executionMode: TimingPilotExecutionMode = "judge-scored"): Omit<TimingPilotPreflightSummary, "status" | "allowed_to_start" | "gates" | "failure_reason"> {
  const judgeScoringCalls = executionMode === "diagnostic-only" ? 0 : 9;
  return {
    schema_version: timingPilotPreflightSchemaVersion,
    created_at: new Date().toISOString(),
    preflight_duration_ms: 0,
    pi_probe: { calls: 0, duration_ms: 0, usage: preflightUsage(undefined) },
    execution_mode: executionMode,
    judge_score_usable: executionMode === "judge-scored" && calibrationStatus === "qualified",
    plan_hash: plan.plan_hash,
    model: plan.execution.model,
    evaluator: plan.evaluator,
    runner: { id: plan.runner.id, version: plan.runner.version, manifest_sha256: plan.runner.manifest_sha256 },
    agent: { id: plan.execution.agent.id, version: plan.execution.agent.version, command: plan.execution.agent.command, observed_version: null, command_sha256: null },
    environment: plan.execution.environment,
    runtime: { observed_bun: null, observed_node: null },
    budget: plan.execution.budget,
    cost_estimate: { preflight_cost_usd: null, agent_attempts: 9, judge_calibration_calls: 9, judge_scoring_calls: judgeScoringCalls, agent_max_duration_ms: plan.execution.budget.max_duration_ms * 9, total_judge_calls: 9 + judgeScoringCalls, cost_usd: "unavailable" },
    judge: { provider_id: plan.judge.provider_id, model: plan.judge.model, real_opt_in: false, calibration_status: calibrationStatus, calibration_hash: null, calibration_reused: false, calibration_calls: calibrationCalls, calibration_duration_ms: 0, calibration_usage: preflightUsage(undefined) },
  };
}

function invalidPlanSummary(plan: TimingPilotPlan, reason: unknown, executionMode: TimingPilotExecutionMode = "judge-scored"): TimingPilotPreflightSummary {
  const safeReason = redactedReason(reason);
  const gates = [
    gate("plan", "failed", safeReason),
    gate("environment", "blocked", "plan validation failed"),
    gate("runtime", "blocked", "plan validation failed"),
    gate("pi-model-probe", "blocked", "plan validation failed"),
    gate("plan-dry-run", "blocked", "plan validation failed"),
    gate("judge-provider", executionMode === "diagnostic-only" ? "not-run" : "blocked", "plan validation failed"),
    gate("judge-calibration", "blocked", "plan validation failed"),
  ];
  return { ...summaryBase(plan, "not-run", 0, executionMode), status: "invalid-plan", allowed_to_start: false, gates, failure_reason: `plan: ${safeReason}` };
}
export async function dryRunTimingPilot(options: { root?: string; plan: TimingPilotPlan }): Promise<TimingPilotDryRun> {
  const root = resolve(options.root ?? workspaceRoot);
  const plan = await parseTimingPilotPlan(options.plan);
  assertActiveTimingPilot(plan);
  await validateTimingPilotRunnerIdentity(root, plan);
  await readEnvironment(root, plan);
  await validateEvaluatorAndJudge(root, plan);
  await validatePromptAndCandidate(root, plan);
  await validateIsolation(root);
  return { plan_hash: plan.plan_hash, slot_count: plan.schedule.slots.length, slots: plan.schedule.slots, candidate_ready: true, environment_ready: true, prompt_ready: true, isolation_ready: true };
}

export async function verifyDiagnosticCalibration(
  report: CalibrationReport,
  diagnostics: JudgeCalibrationDiagnostics,
  expectedModel: string,
  env: Record<string, string | undefined> = Bun.env,
  root = workspaceRoot,
): Promise<Awaited<ReturnType<typeof resolveCalibrationStatus>>> {
  const diagnosticsSchema = await Bun.file(join(root, "schemas/async-report-timing-pilot-judge-calibration-diagnostics-v1.schema.json")).json();
  const validateDiagnostics = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(diagnosticsSchema);
  if (!validateDiagnostics(diagnostics)) throw new Error("private calibration diagnostics do not match the frozen schema");
  const resolved = await resolveCalibrationStatus(report, calibrationScope(expectedModel), calibrationAttestationKey("real", env));
  if (report.status !== "diagnostic" || report.calls !== 9 || resolved.status !== "diagnostic" || resolved.calls !== 9 || resolved.reason !== "calibration gate is not qualified") {
    throw new Error("a complete, attested diagnostic calibration report matching the frozen Judge identity is required");
  }
  if (diagnostics.schema_version !== "async-report-timing-pilot-judge-calibration-diagnostics/v1"
    || diagnostics.status !== "captured"
    || diagnostics.calibration.id !== report.id
    || diagnostics.calibration.version !== report.version
    || diagnostics.calibration.hash !== report.hash
    || diagnostics.calibration.status !== "diagnostic"
    || diagnostics.calibration.model !== expectedModel
    || diagnostics.calibration.calls !== 9
    || diagnostics.calibration.duration_ms !== report.duration_ms
    || diagnostics.contract_snapshot_verified !== true
    || !diagnostics.thresholds
    || diagnostics.observations.length !== 9) {
    throw new Error("complete private calibration diagnostics matching the attested report are required");
  }
  const groups = ["reference", "equivalent", "anti-pattern"] as const;
  const seen = new Set<string>();
  for (let index = 0; index < diagnostics.observations.length; index += 1) {
    const observation = diagnostics.observations[index]!;
    if (observation.call_index !== index + 1 || !groups.includes(observation.fixture_group as typeof groups[number])
      || observation.status !== "observed" || !Number.isInteger(observation.score) || observation.score === null
      || observation.score < 0 || observation.score > 100 || observation.repetition < 1 || observation.repetition > 3
      || !hashPattern.test(observation.prompt_hash ?? "") || !hashPattern.test(observation.input_hash ?? "")) {
      throw new Error("private calibration diagnostics do not contain nine complete observed calls");
    }
    const identity = observation.fixture_group + ":" + observation.repetition;
    if (seen.has(identity)) throw new Error("private calibration diagnostics contain duplicate fixture repetitions");
    seen.add(identity);
  }
  if (seen.size !== 9 || groups.some((group) => [1, 2, 3].some((repeat) => !seen.has(group + ":" + repeat)))) {
    throw new Error("private calibration diagnostics do not cover three fixture groups with three repetitions each");
  }
  for (const group of groups) {
    const scores = diagnostics.observations.filter((entry) => entry.fixture_group === group).map((entry) => entry.score as number).sort((a, b) => a - b);
    const median = scores[1];
    if (median === undefined || report.medians[group] !== median || diagnostics.calibration.medians[group] !== median) {
      throw new Error("private calibration diagnostics do not match the attested report medians");
    }
  }
  const usageKeys = ["input_tokens", "output_tokens", "total_tokens", "cost_usd"] as const;
  if (usageKeys.some((key) => diagnostics.calibration.usage[key] !== report.usage[key])) throw new Error("private calibration diagnostics usage does not match the attested report");
  const frozenThresholds = await readCalibrationThresholds();
  if (!frozenThresholds || JSON.stringify(frozenThresholds) !== JSON.stringify(diagnostics.thresholds)) throw new Error("private calibration diagnostics use different thresholds from frozen #200 v1");
  const expectedChecks = evaluateCalibrationGateChecks(report.medians, diagnostics.thresholds);
  if (expectedChecks.length !== 4 || JSON.stringify(expectedChecks) !== JSON.stringify(diagnostics.gate_checks)
    || !expectedChecks.some((entry) => entry.status === "failed")) {
    throw new Error("private calibration gate details do not match the attested diagnostic report");
  }
  return resolved;
}

export async function runTimingPilotPreflight(options: TimingPilotPreflightOptions = {}): Promise<TimingPilotPreflightSummary> {
  const preflightStarted = performance.now();
  const executionMode = options.execution_mode ?? "judge-scored";
  const root = resolve(options.root ?? workspaceRoot);
  let plan: TimingPilotPlan;
  try {
    plan = options.plan ? await parseTimingPilotPlan(options.plan) : await readTimingPilotPlan(resolve(root, options.plan_path ?? timingPilotPlanPath));
  } catch (error) {
    const fallback = {
      plan_hash: "0".repeat(64),
      evaluator: { id: timingPilotEvaluatorId, version: timingPilotEvaluatorVersion, snapshot_id: timingPilotEvaluatorSnapshotId },
      runner: { id: timingPilotRunnerId, version: timingPilotRunnerVersion, manifest_path: timingPilotRunnerManifestPath, manifest_sha256: "0".repeat(64) },
      execution: { model: { id: timingPilotModel, version: timingPilotModelVersion }, agent: { id: "pi", version: "0.85.1", command: "pi" }, environment: { id: "local-pi", version: "v4", bun: timingPilotBunVersion, node: timingPilotNodeVersion, manifest_sha256: timingPilotEnvironmentManifestSha256 }, budget: { max_turns: timingPilotMaxTurns, max_duration_ms: timingPilotMaxDurationMs } },
      judge: { provider_id: timingPilotJudgeProvider, model: timingPilotJudgeModel, evaluation_plan_hash: timingPilotJudgeEvaluationPlanHash, rubric_hash: timingPilotJudgeRubricHash },
    } as TimingPilotPlan;
    return invalidPlanSummary(fallback, error, executionMode);
  }
  if (plan.lifecycle_stage !== "pilot") return invalidPlanSummary(plan, "timing pilot plan is retired and cannot run as the active pilot");
  const gates: TimingPilotGate[] = [];
  let calibrationStatus: TimingPilotPreflightSummary["judge"]["calibration_status"] = "not-run";
  let calibrationCalls = 0;
  let calibrationHash: string | null = null;
  let calibrationReused = false;
  let diagnosticCalibrationVerified = false;
  let judgeRealOptIn = false;
  let observedRuntime: { bun: string; node: string } | undefined;
  let observedPi: { version: string; command_sha256: string } | undefined;
  let piProbeCalls = 0;
  let piProbeDurationMs = 0;
  let piProbeUsage = preflightUsage(undefined);
  let calibrationDurationMs = 0;
  let calibrationUsage = preflightUsage(undefined);
  const environmentGate = await (async () => {
    try {
      await readEnvironment(root, plan);
      return gate("environment", "passed");
    } catch (error) {
      return gate("environment", "failed", redactedReason(error));
    }
  })();
  gates.push(environmentGate);
  const runtimeGate = await (async () => {
    if (environmentGate.status !== "passed") return gate("runtime", "blocked", "environment manifest validation failed");
    try {
      const runtime = await (options.runtime_probe ?? readHostRuntime)();
      observedRuntime = runtime;
      if (runtime.bun !== plan.execution.environment.bun || runtime.node !== plan.execution.environment.node) throw new Error(`host runtime ${runtime.bun}/${runtime.node} does not match plan ${plan.execution.environment.bun}/${plan.execution.environment.node}`);
      return gate("runtime", "passed");
    } catch (error) {
      return gate("runtime", "failed", redactedReason(error));
    }
  })();
  gates.push(runtimeGate);

  // The short Pi/model probe is deliberately before the scratch dry-run. It is
  // the cheap reachability check that prevents a later long attempt from being
  // started against a drifted or unavailable Agent route.
  if (options.run_model_probe === false) {
    gates.push(gate("pi-model-probe", "not-run", "model probe disabled by caller"));
  } else if (environmentGate.status !== "passed" || runtimeGate.status !== "passed") {
    gates.push(gate("pi-model-probe", "blocked", "environment or host runtime validation failed"));
  } else if (!localPiModelBaseUrl(envText(options.env ?? {})) || !localPiApiKey(envText(options.env ?? {}))) {
    gates.push(gate("pi-model-probe", "failed", "Pi gateway endpoint or credential is unavailable"));
  } else {
    try {
      piProbeCalls = 1;
      const probe = options.model_probe ?? (async ({ root: probeRoot, model }) => probeTimingPilotPiAndModel(probeRoot, model, plan, envText(options.env ?? {})));
      const probeStarted = performance.now();
      const result = await probe({ root, model: plan.execution.model.id });
      piProbeDurationMs = result.duration_ms ?? Math.round(performance.now() - probeStarted);
      piProbeUsage = preflightUsage(result.usage);
      if (result.version !== plan.execution.agent.version) throw new Error(`Pi probe version ${result.version} does not match plan ${plan.execution.agent.version}`);
      if (!hashPattern.test(result.command_sha256)) throw new Error("Pi executable identity is unavailable");
      observedPi = { version: result.version, command_sha256: result.command_sha256 };
      gates.push(gate("pi-model-probe", "passed"));
    } catch (error) {
      gates.push(gate("pi-model-probe", "failed", redactedReason(error)));
    }
  }

  // This remains scratch-only: it validates identity, hashes and isolation and
  // never invokes an Agent adapter or writes a formal run record.
  const dryRunGate = await (async () => {
    try {
      await dryRunTimingPilot({ root, plan });
      return gate("plan-dry-run", "passed");
    } catch (error) {
      return gate("plan-dry-run", "failed", redactedReason(error));
    }
  })();
  gates.push(dryRunGate);

  const judgeEnv = asyncReportJudgeEnv(envText(options.env ?? {}));
  judgeRealOptIn = judgeEnv.real && Boolean(judgeEnv.baseUrl && judgeEnv.apiKey && judgeEnv.model === plan.judge.model);
  if (executionMode === "judge-scored") {
    if (!judgeRealOptIn) gates.push(gate("judge-provider", "failed", "Judge real opt-in, endpoint, key, or model is unavailable")); else gates.push(gate("judge-provider", "passed"));
    if (options.run_judge_calibration !== false && judgeRealOptIn && gates.every((entry) => entry.status === "passed")) {
      try {
        const env = envText(options.env ?? {});
        let report: CalibrationReport;
        let diagnostics: JudgeCalibrationDiagnostics;
        if (options.calibration_report) {
          report = options.calibration_report;
          diagnostics = options.calibration_diagnostics ?? createCachedReportDiagnostics(report);
          calibrationReused = true;
        } else if (options.judge_calibration) {
          report = await options.judge_calibration(env);
          diagnostics = createCachedReportDiagnostics(report);
        } else {
          const run = await runRealCalibrationWithDiagnostics({ env });
          report = run.report;
          diagnostics = run.diagnostics;
        }
        calibrationHash = report.hash;
        calibrationDurationMs = report.duration_ms;
        calibrationUsage = preflightUsage(report.usage);
        const resolved = options.judge_calibration
          ? { status: report.status, calls: report.calls, reason: report.reason }
          : await resolveCalibrationStatus(report, calibrationScope(plan.judge.model), calibrationAttestationKey("real", env));
        calibrationStatus = resolved.status === "qualified" ? "qualified" : "diagnostic";
        calibrationCalls = resolved.calls;
        options.on_judge_calibration_report?.(report);
        options.on_judge_calibration_diagnostics?.(diagnostics);
        const qualified = calibrationStatus === "qualified";
        const reason = qualified ? undefined : resolved.reason ?? report.reason ?? "Judge calibration did not qualify";
        gates.push(gate("judge-calibration", qualified ? "passed" : "failed", reason ? redactedReason(reason) : undefined));
      } catch (error) {
        calibrationStatus = "unavailable";
        options.on_judge_calibration_diagnostics?.(calibrationDiagnosticsForPreflightError(error));
        gates.push(gate("judge-calibration", "failed", redactedReason(error)));
      }
    } else gates.push(gate("judge-calibration", "blocked", "Judge provider preflight or earlier gate failed"));
  } else {
    gates.push(gate("judge-provider", "not-run", "attempt-level Judge scoring is disabled in diagnostic-only mode"));
    const report = options.calibration_report;
    const diagnostics = options.calibration_diagnostics;
    if (report && diagnostics) {
      try {
        const env = envText(options.env ?? {});
        const resolved = await verifyDiagnosticCalibration(report, diagnostics, plan.judge.model, env, root);
        calibrationHash = report.hash;
        calibrationReused = true;
        calibrationDurationMs = report.duration_ms;
        calibrationUsage = preflightUsage(report.usage);
        calibrationCalls = resolved.calls;
        calibrationStatus = "diagnostic";
        diagnosticCalibrationVerified = true;
        options.on_judge_calibration_report?.(report);
        options.on_judge_calibration_diagnostics?.(diagnostics);
        gates.push(gate("judge-calibration", "accepted-diagnostic", "attested diagnostic report verified; Judge score is unusable and scoring is disabled"));
      } catch (error) {
        calibrationStatus = "unavailable";
        gates.push(gate("judge-calibration", "failed", redactedReason(error)));
      }
    } else {
      gates.push(gate("judge-calibration", "blocked", "complete attested diagnostic report and private sidecar are required"));
    }
  }
  const blockingGate = gates.find((entry) => {
    if (executionMode === "diagnostic-only" && entry.id === "judge-provider") return false;
    if (executionMode === "diagnostic-only" && entry.id === "judge-calibration" && diagnosticCalibrationVerified) return false;
    return entry.status !== "passed";
  });
  const invalidPlan = environmentGate.status === "passed" && runtimeGate.status === "passed" && dryRunGate.status === "failed";
  const base = summaryBase(plan, calibrationStatus, calibrationCalls, executionMode);
  return {
    ...base,
    agent: { ...base.agent, observed_version: observedPi?.version ?? null, command_sha256: observedPi?.command_sha256 ?? null },
    runtime: { observed_bun: observedRuntime?.bun ?? null, observed_node: observedRuntime?.node ?? null },
    preflight_duration_ms: Math.max(0, Math.round(performance.now() - preflightStarted)),
    pi_probe: { calls: piProbeCalls, duration_ms: piProbeDurationMs, usage: piProbeUsage },
    judge: { ...base.judge, real_opt_in: judgeRealOptIn, calibration_hash: calibrationHash, calibration_reused: calibrationReused, calibration_duration_ms: calibrationDurationMs, calibration_usage: calibrationUsage },
    cost_estimate: { ...base.cost_estimate, preflight_cost_usd: (piProbeCalls === 0 || piProbeUsage.cost_usd !== null) && (calibrationReused || calibrationCalls === 0 || calibrationUsage.cost_usd !== null) ? (piProbeCalls ? piProbeUsage.cost_usd! : 0) + (!calibrationReused && calibrationCalls ? calibrationUsage.cost_usd! : 0) : null },
    status: blockingGate ? (invalidPlan ? "invalid-plan" : "preflight-blocked") : "ready",
    execution_mode: executionMode,
    allowed_to_start: !blockingGate,
    judge_score_usable: !blockingGate && executionMode === "judge-scored" && calibrationStatus === "qualified",
    gates,
    ...(blockingGate?.reason ? { failure_reason: `${blockingGate.id}: ${blockingGate.reason}` } : {}),
  };
}

export async function readTimingPilotScratchJson<T>(root: string, filePath: string, required = true): Promise<T | undefined> {
  const absoluteRoot = await realpath(resolve(root));
  const scratchRoot = await realpath(join(absoluteRoot, "scratch"));
  const target = resolve(filePath);
  await resolveTimingPilotScratchOutput(absoluteRoot, dirname(target));
  let info;
  try { info = await lstat(target); }
  catch (error) {
    if (!required && error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw new Error("required scratch artifact is missing or unreadable");
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("scratch artifact must be a regular non-symlink file");
  const targetReal = await realpath(target);
  if (!isWithin(scratchRoot, targetReal)) throw new Error("scratch artifact resolved outside workspace scratch/");
  try { return JSON.parse(await Bun.file(targetReal).text()) as T; }
  catch { throw new Error("scratch artifact is not valid JSON"); }
}

function isWithin(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(relativePath));
}

async function rejectSymlinkComponents(parent: string, target: string): Promise<void> {
  const tail = relative(parent, target);
  let current = parent;
  for (const part of tail.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("scratch artifact path must not traverse a symlink or junction");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function resolveTimingPilotScratchOutput(root: string, requestedPath: string): Promise<string> {
  const rootReal = await realpath(resolve(root));
  const scratchRoot = join(rootReal, "scratch");
  try {
    if ((await lstat(scratchRoot)).isSymbolicLink()) throw new Error("scratch root must not be a symlink or junction");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    await mkdir(scratchRoot, { recursive: true });
  }
  const scratchReal = await realpath(scratchRoot);
  if (!isWithin(rootReal, scratchReal) || scratchReal !== scratchRoot) throw new Error("scratch root resolves outside the selected workspace");
  const target = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(rootReal, requestedPath);
  if (target === scratchReal || !isWithin(scratchReal, target)) throw new Error("timing pilot artifacts must be written below the workspace scratch/ directory");
  await rejectSymlinkComponents(scratchReal, target);
  await mkdir(target, { recursive: true });
  const targetReal = await realpath(target);
  if (!isWithin(scratchReal, targetReal) || targetReal === scratchReal) throw new Error("timing pilot artifact directory escapes workspace scratch/");
  return targetReal;
}

export async function writeTimingPilotDryRunSummary(result: TimingPilotDryRun, directory: string, root = workspaceRoot): Promise<{ json_path: string; markdown_path: string }> {
  directory = await resolveTimingPilotScratchOutput(root, directory);
  const jsonPath = join(directory, "dry-run-summary.json");
  const markdownPath = join(directory, "dry-run-summary.md");
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = ["# Async-report timing pilot dry-run", "", `- plan_hash: ${result.plan_hash}`, `- slot_count: ${result.slot_count}`, `- candidate_ready: ${result.candidate_ready}`, `- environment_ready: ${result.environment_ready}`, `- prompt_ready: ${result.prompt_ready}`, `- isolation_ready: ${result.isolation_ready}`, "", "## Slots", ...result.slots.map((slot) => `- ${slot.attempt_id}: ${slot.condition_id} (block ${slot.block}, position ${slot.position})`)];
  await writeFile(markdownPath, `${lines.join("\n")}\n`);
  return { json_path: jsonPath, markdown_path: markdownPath };
}

async function writeTimingPilotDryRunFailureSummary(reason: string, directory: string, root = workspaceRoot): Promise<{ json_path: string; markdown_path: string }> {
  directory = await resolveTimingPilotScratchOutput(root, directory);
  const jsonPath = join(directory, "dry-run-failure.json");
  const markdownPath = join(directory, "dry-run-failure.md");
  const failure = { status: "invalid-plan" as const, allowed_to_start: false, reason: redactedReason(reason) };
  await writeFile(jsonPath, `${JSON.stringify(failure, null, 2)}\n`);
  await writeFile(markdownPath, `# Async-report timing pilot dry-run\n\n- status: ${failure.status}\n- allowed_to_start: ${failure.allowed_to_start}\n- reason: ${failure.reason}\n`);
  return { json_path: jsonPath, markdown_path: markdownPath };
}

export async function validateTimingPilotPreflightSummary(summary: TimingPilotPreflightSummary, root = workspaceRoot): Promise<void> {
  const schemaPath = join(root, "schemas/async-report-timing-pilot-preflight-v1.schema.json");
  const schema = await Bun.file(schemaPath).json();
  const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(schema);
  if (!validate(summary)) throw new Error("timing pilot preflight summary schema validation failed: " + (validate.errors ?? []).map((entry) => (entry.instancePath || "/") + " " + (entry.message ?? entry.keyword)).join("; "));
}

export async function writeTimingPilotPreflightSummary(summary: TimingPilotPreflightSummary, directory: string, root = workspaceRoot, diagnostics?: JudgeCalibrationDiagnostics): Promise<{ json_path: string; markdown_path: string; judge_calibration_diagnostics_json_path?: string; judge_calibration_diagnostics_markdown_path?: string }> {
  await validateTimingPilotPreflightSummary(summary, root);
  directory = await resolveTimingPilotScratchOutput(root, directory);
  const jsonPath = join(directory, "preflight-summary.json");
  const markdownPath = join(directory, "preflight-summary.md");
  let diagnosticPaths: { judge_calibration_diagnostics_json_path: string; judge_calibration_diagnostics_markdown_path: string } | undefined;
  if (diagnostics) {
    const privateDirectory = await resolveTimingPilotScratchOutput(root, join(directory, "private"));
    const diagnosticJson = join(privateDirectory, "judge-calibration-diagnostics.json");
    const diagnosticMarkdown = join(privateDirectory, "judge-calibration-diagnostics.md");
    await writeFile(diagnosticJson, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");
    await writeFile(diagnosticMarkdown, renderJudgeCalibrationDiagnosticsMarkdown(diagnostics), "utf8");
    diagnosticPaths = { judge_calibration_diagnostics_json_path: diagnosticJson, judge_calibration_diagnostics_markdown_path: diagnosticMarkdown };
  }
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const lines = ["# Async-report timing pilot preflight", "", `- status: ${summary.status}`, `- execution mode: ${summary.execution_mode}`, `- allowed_to_start: ${summary.allowed_to_start}`, `- Judge score usable: ${summary.judge_score_usable}`, `- plan_hash: ${summary.plan_hash}`, `- model: ${summary.model.id} (${summary.model.version})`, `- evaluator: ${summary.evaluator.id} ${summary.evaluator.version} (${summary.evaluator.snapshot_id})`, `- runner: ${summary.runner.id} ${summary.runner.version} (${summary.runner.manifest_sha256})`, `- Pi: ${summary.agent.id} ${summary.agent.version} (${summary.agent.command})`, `- environment: ${summary.environment.id}/${summary.environment.version} (${summary.environment.manifest_sha256})`, `- runtime observed: Bun ${summary.runtime.observed_bun ?? "not observed"} / Node ${summary.runtime.observed_node ?? "not observed"}`, `- budget: ${summary.budget.max_turns} turns / ${summary.budget.max_duration_ms} ms`, `- preflight elapsed: ${summary.preflight_duration_ms} ms`, `- Pi probe calls/elapsed/tokens/cost: ${summary.pi_probe.calls} / ${summary.pi_probe.duration_ms} ms / ${summary.pi_probe.usage.total_tokens ?? "unavailable"} / ${summary.pi_probe.usage.cost_usd ?? "unavailable"} USD`, `- Judge calibration elapsed/tokens/cost: ${summary.judge.calibration_duration_ms} ms / ${summary.judge.calibration_usage.total_tokens ?? "unavailable"} / ${summary.judge.calibration_usage.cost_usd ?? "unavailable"} USD`, `- estimated agent duration: ${summary.cost_estimate.agent_max_duration_ms} ms`, `- estimated Judge calls: ${summary.cost_estimate.total_judge_calls}`, `- observed preflight cost USD: ${summary.cost_estimate.preflight_cost_usd ?? "unavailable"}`, `- estimated cost USD: ${summary.cost_estimate.cost_usd}`, `- Judge: ${summary.judge.provider_id} / ${summary.judge.model}`, `- Judge real opt-in: ${summary.judge.real_opt_in}`, `- Judge calibration: ${summary.judge.calibration_status} (${summary.judge.calibration_calls} calls)`, `- Judge scoring calls planned: ${summary.cost_estimate.judge_scoring_calls}`];
  if (diagnosticPaths) lines.push("- Judge calibration details: `private/judge-calibration-diagnostics.md` (host-local private artifact; not sent to the Judge or Agent)");
  lines.push("", "## Gates", ...summary.gates.map((entry) => `- ${entry.id}: ${entry.status}${entry.reason ? ` — ${entry.reason}` : ""}`));
  await writeFile(markdownPath, `${lines.join("\n")}\n`, "utf8");
  return { json_path: jsonPath, markdown_path: markdownPath, ...diagnosticPaths };
}
function argValue(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; }

if (import.meta.main) {
  await (async () => {
    const args = Bun.argv.slice(2);
    const root = resolve(argValue(args, "--root") ?? workspaceRoot);
    const mode = args.includes("--dry-run") ? "dry-run" : args.includes("--run") ? "run" : "preflight";
    const executionMode: TimingPilotExecutionMode = args.includes("--diagnostic-only") ? "diagnostic-only" : "judge-scored";
    const confirmStart = args.includes("--confirm-start");
    const planPath = argValue(args, "--plan") ?? timingPilotPlanPath;
    const requestedArtifacts = argValue(args, "--artifacts") ?? join("scratch", "async-report-timing-pilot-v1", "preflight");
    try {
      if (confirmStart && mode !== "run") throw new Error("--confirm-start requires --run");
      if (executionMode === "diagnostic-only" && mode === "dry-run") throw new Error("--diagnostic-only is only valid with preflight or --run");
      const artifactDirectory = await resolveTimingPilotScratchOutput(root, requestedArtifacts);
      if (mode === "dry-run") {
        try {
          const plan = await readTimingPilotPlan(resolve(root, planPath));
          const result = await dryRunTimingPilot({ root, plan });
          const paths = await writeTimingPilotDryRunSummary(result, artifactDirectory, root);
          console.log(JSON.stringify({ ...result, artifacts: paths }, null, 2));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const paths = await writeTimingPilotDryRunFailureSummary(reason, artifactDirectory, root);
          console.error(JSON.stringify({ status: "invalid-plan", allowed_to_start: false, reason: redactedReason(reason), artifacts: paths }, null, 2));
          process.exitCode = 1;
        }
        return;
      }

      const reportPath = resolve(argValue(args, "--calibration-report") ?? join(artifactDirectory, "private", "judge-calibration-report.json"));
      const diagnosticsPath = resolve(argValue(args, "--calibration-diagnostics") ?? join(dirname(reportPath), "judge-calibration-diagnostics.json"));
      const cachedCalibration = await readTimingPilotScratchJson<CalibrationReport>(root, reportPath, confirmStart);
      const calibrationDiagnostics = executionMode === "diagnostic-only"
        ? await readTimingPilotScratchJson<JudgeCalibrationDiagnostics>(root, diagnosticsPath, confirmStart)
        : undefined;

      if (mode === "run") {
        if (Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") throw new Error("Agent run requires explicit LORELUM_LOCAL_EXPERIMENT=1 opt-in");
        if (confirmStart) {
          if (!cachedCalibration) throw new Error("a calibration report is required before --confirm-start");
          if (executionMode === "diagnostic-only" && !calibrationDiagnostics) throw new Error("the complete private calibration diagnostics sidecar is required before --confirm-start");
          const summaryPath = join(artifactDirectory, "preflight-summary.json");
          const summary = await readTimingPilotScratchJson<TimingPilotPreflightSummary>(root, summaryPath, true);
          if (!summary || summary.execution_mode !== executionMode || summary.allowed_to_start !== true) throw new Error("a fresh successful preflight summary for the selected execution mode is required before --confirm-start");
          await validateTimingPilotPreflightSummary(summary, root);
          const plan = await readTimingPilotPlan(resolve(root, planPath));
          if (summary.plan_hash !== plan.plan_hash || summary.judge.calibration_hash !== cachedCalibration.hash) throw new Error("preflight summary does not match the selected plan and calibration report");
          const result = await (await import("./async-report-timing-pilot-runner")).runTimingPilotAttempts({
            root, plan,
            run_id: argValue(args, "--run-id") ?? "pilot-" + new Date().toISOString().replaceAll(/[:.]/g, "-"),
            output_root: join(artifactDirectory, "attempts"),
            preflight: summary,
            calibration: cachedCalibration,
            calibration_diagnostics: calibrationDiagnostics,
          });
          await writeFile(join(artifactDirectory, "pilot-result-index.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        let calibrationReport: CalibrationReport | undefined;
        let capturedDiagnostics: JudgeCalibrationDiagnostics | undefined;
        const summary = await runTimingPilotPreflight({
          root,
          plan_path: planPath,
          execution_mode: executionMode,
          run_judge_calibration: false,
          calibration_report: cachedCalibration,
          calibration_diagnostics: calibrationDiagnostics,
          on_judge_calibration_report: (report) => { calibrationReport = report; },
          on_judge_calibration_diagnostics: (diagnostics) => { capturedDiagnostics = diagnostics; },
        });
        const summaryPaths = await writeTimingPilotPreflightSummary(summary, artifactDirectory, root, capturedDiagnostics ?? calibrationDiagnostics);
        if (calibrationReport ?? cachedCalibration) await privateWriteTimingPilotCalibrationReport(artifactDirectory, calibrationReport ?? cachedCalibration!, root);
        console.log(JSON.stringify({ ...summary, artifacts: summaryPaths, pilot_started: false }, null, 2));
        if (!summary.allowed_to_start) process.exitCode = 1;
        else console.log("No Agent attempts were started. Review the preflight summary, then explicitly rerun with --run --confirm-start" + (executionMode === "diagnostic-only" ? " --diagnostic-only" : "") + ".");
        return;
      }

      let calibrationReport: CalibrationReport | undefined;
      let capturedDiagnostics: JudgeCalibrationDiagnostics | undefined;
      const summary = await runTimingPilotPreflight({
        root,
        plan_path: planPath,
        execution_mode: executionMode,
        ...(executionMode === "diagnostic-only" ? { run_judge_calibration: false, calibration_report: cachedCalibration, calibration_diagnostics: calibrationDiagnostics } : {}),
        on_judge_calibration_report: (report) => { calibrationReport = report; },
        on_judge_calibration_diagnostics: (diagnostics) => { capturedDiagnostics = diagnostics; },
      });
      const summaryPaths = await writeTimingPilotPreflightSummary(summary, artifactDirectory, root, capturedDiagnostics ?? calibrationDiagnostics);
      if (calibrationReport ?? cachedCalibration) await privateWriteTimingPilotCalibrationReport(artifactDirectory, calibrationReport ?? cachedCalibration!, root);
      console.log(JSON.stringify({ ...summary, artifacts: summaryPaths }, null, 2));
      if (!summary.allowed_to_start) process.exitCode = 1;
    } catch (error) {
      console.error(redactedReason(error));
      process.exitCode = 1;
    }
  })();
}

async function privateWriteTimingPilotCalibrationReport(directory: string, report: CalibrationReport, root = workspaceRoot): Promise<void> {
  const privateDirectory = await resolveTimingPilotScratchOutput(root, join(directory, "private"));
  await writeFile(join(privateDirectory, "judge-calibration-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
