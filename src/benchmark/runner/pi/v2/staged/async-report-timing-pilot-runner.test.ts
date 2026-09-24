import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readTimingPilotPlan, timingPilotPlanPath, type TimingPilotPreflightSummary } from "./async-report-timing-pilot";
import { runTimingPilotAttempts, type TimingPilotRunnerDependencies } from "./async-report-timing-pilot-runner";
import { CHECK_IDS, buildEvaluatorResult } from "../../../../../../incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/result";
import { workspaceRoot } from "../../../../fs";
import type { StagedPracticeAttemptReport, StagedPracticeRunOptions } from "./staged-practice-delivery";
import type { JudgeResultV1 } from "../../../../outcome/v1/contract";
import type { AsyncReportAccounting, CalibrationReport, RawReplanAttempt } from "../../../../judge/async-report-replan/v1/types";
import { diagnosticCalibrationFixture } from "./timing-pilot-diagnostic-test-fixture";

const temporaryRoots: string[] = [];
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function plan() { return readTimingPilotPlan(join(workspaceRoot, timingPilotPlanPath)); }

function calibration(): CalibrationReport {
  return {
    id: "async-report-replan-judge-calibration", version: "v1", hash: "a".repeat(64), status: "qualified", calls: 9,
    medians: { reference: 90, equivalent: 88, "anti-pattern": 60 },
    scope: { provider_id: "judge-agent/async-report-replan/v1", provider_version: "v1", model: "deepseek/deepseek-v4-flash" },
    duration_ms: 20, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cost_usd: "unavailable" }, attestation: "opaque-test-attestation",
  };
}

function preflight(planHash: string): TimingPilotPreflightSummary {
  return {
    schema_version: "async-report-timing-pilot-preflight/v1", created_at: new Date().toISOString(), preflight_duration_ms: 100, execution_mode: "judge-scored", judge_score_usable: true, pi_probe: { calls: 1, duration_ms: 50, usage: { input_tokens: null, output_tokens: null, total_tokens: null, cost_usd: null } }, status: "ready", allowed_to_start: true, plan_hash: planHash,
    model: { id: "deepseek/deepseek-v4-flash", version: "operator-local-experiment" },
    evaluator: { id: "async-report-deterministic-evaluator", version: "v1", snapshot_id: "7d68a9e9fc32a2fc96407ad1b4f6d416f6138cddc73587614be6b6d5e8db8be1" },
    runner: { id: "async-report-timing-pilot-runner", version: "v1", manifest_sha256: "f".repeat(64) },
    agent: { id: "pi", version: "0.85.1", command: "pi", observed_version: "0.85.1", command_sha256: "f".repeat(64) },
    environment: { id: "local-pi", version: "v4", bun: "1.4.2", node: "24.21.0", manifest_sha256: "555acce5f7cc79e203113b0f5025f715fe5a6de88dd4e2b54f308b71a3f20247" },
    runtime: { observed_bun: "1.4.2", observed_node: "24.21.0" },
    budget: { max_turns: 128, max_duration_ms: 1_500_000 },
    cost_estimate: { preflight_cost_usd: null, agent_attempts: 9, judge_calibration_calls: 9, judge_scoring_calls: 9, agent_max_duration_ms: 13_500_000, total_judge_calls: 18, cost_usd: "unavailable" },
    judge: { provider_id: "judge-agent/async-report-replan/v1", model: "deepseek/deepseek-v4-flash", real_opt_in: true, calibration_status: "qualified", calibration_hash: calibration().hash, calibration_reused: false, calibration_calls: 9, calibration_duration_ms: 20, calibration_usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cost_usd: null } },
    gates: ["environment", "runtime", "pi-model-probe", "plan-dry-run", "judge-provider", "judge-calibration"].map((id) => ({ id, status: "passed" })),
  };
}

function judgeResult(): JudgeResultV1 {
  return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "judge-agent/async-report-replan/v1", version: "v1" }, state: "observed", score: 80, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as unknown as JudgeResultV1;
}

function judgeAccounting(blindCaseId: string): AsyncReportAccounting {
  return {
    schema_version: "async-report-replan-judge-accounting/v1", accounting_version: 1, state: "observed", blind_case_id: blindCaseId,
    plan: { id: "async-report-replan-evaluation-plan", version: "v1", hash: "1".repeat(64) }, evidence: { schema_version: "replan-evidence/v1", hash: "2".repeat(64) },
    rubric: { id: "async-report-replan-rubric", version: "v1", hash: "3".repeat(64) }, prompt_hash: "4".repeat(64), input_hash: "5".repeat(64),
    provider: { id: "judge-agent/async-report-replan/v1", version: "v1", model: "deepseek/deepseek-v4-flash" },
    calibration: { id: "async-report-replan-judge-calibration", version: "v1", hash: "6".repeat(64), status: "qualified", duration_ms: 10, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cost_usd: "unavailable" } },
    calls: { calibration: 9, scoring: 1 }, duration_ms: 10, usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10, cost_usd: "unavailable" },
  } as AsyncReportAccounting;
}

async function fakeAttempt(options: StagedPracticeRunOptions): Promise<StagedPracticeAttemptReport> {
  await mkdir(join(options.workspace, "app"), { recursive: true });
  await cp(join(workspaceRoot, "incubator/practice-injection/async-report-lifecycle-v1/public/starter/app"), join(options.workspace, "app"), { recursive: true });
  const assistant = (stage: string, text: string) => JSON.stringify({ type: "message_end", stage, message: { role: "assistant", content: [{ type: "text", text }] } });
  await writeFile(join(options.artifacts, "task_start.stdout.jsonl"), `${assistant("initial", "I will inspect and plan.")}\n`);
  await writeFile(join(options.artifacts, "constraint_followup.stdout.jsonl"), `${assistant("post-constraint", "I will preserve compatibility.")}\n`);
  await writeFile(join(options.artifacts, "checkpoint_resume.stdout.jsonl"), `${assistant("post-constraint", "The compatibility slice is ready.")}\n`);
  await mkdir(join(options.artifacts, "private-runtime"), { recursive: true });
  await writeFile(join(options.artifacts, "private-runtime", "turn-budget.json"), JSON.stringify({ turns: 3, ready: true }));
  const publicTrace = { schema_version: "staged-practice-delivery-public/v1", attempt_id: options.attempt_id, condition_id: options.plan.delivery.condition_id, delivery_node: options.plan.delivery.delivery_node, treatment_version: "v1", status: "delivered", session_binding: "same-session" } as const;
  const summaryPath = join(options.artifacts, "delivery-summary.json");
  const tracePath = join(options.artifacts, "delivery-trace.json");
  await writeFile(summaryPath, JSON.stringify({ status: "completed" }));
  await writeFile(tracePath, JSON.stringify(publicTrace));
  return {
    schema_version: "staged-practice-attempt/v1", attempt_id: options.attempt_id, condition_id: options.plan.delivery.condition_id,
    delivery_node: options.plan.delivery.delivery_node, status: "completed", comparable: true, session_binding: "same-session", public_trace: publicTrace,
    audit_path: join(options.artifacts, "delivery-audit.jsonl"), summary_path: summaryPath, public_trace_path: tracePath, transcript_path: join(options.artifacts, "sessions/mock.jsonl"), delivery_status: "delivered", plan_hash: options.plan.plan_hash,
  };
}

async function successfulRun(options: { firstFailure?: boolean; verifyFailAt?: number; evaluate?: TimingPilotRunnerDependencies["evaluate"]; score?: TimingPilotRunnerDependencies["score"] } = {}) {
  const value = await plan();
  const output = join(workspaceRoot, "scratch", `timing-pilot-test-${crypto.randomUUID()}`);
  temporaryRoots.push(output);
  const rawInputs: RawReplanAttempt[] = [];
  const runCalls: string[] = [];
  let verifyCalls = 0;
  const result = await runTimingPilotAttempts({
    root: workspaceRoot, plan: value, run_id: `test-${crypto.randomUUID()}`, output_root: output, preflight: preflight(value.plan_hash), calibration: calibration(),
    env: { LORELUM_LOCAL_EXPERIMENT: "1", LORELUM_JUDGE_REAL: "1", LORELUM_PI_BASE_URL: "https://gateway.example/v1", LORELUM_PI_API_KEY: "redacted-test-key" },
    dependencies: {
      configure_catalog: async () => undefined,
      validate_calibration: async () => true,
      verify_identity: async () => { verifyCalls += 1; if (verifyCalls === options.verifyFailAt) throw new Error("binary drift"); return "mock-pi"; },
      run_attempt: async (attemptOptions) => { runCalls.push(attemptOptions.attempt_id); if (options.firstFailure && runCalls.length === 1) throw new Error("simulated delivery failure"); return fakeAttempt(attemptOptions); },
      evaluate: options.evaluate ?? (async () => buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" as const })))),
      score: async (raw, calibrationReport, env) => {
        rawInputs.push(raw);
        if (options.score) return options.score(raw, calibrationReport, env);
        return { result: judgeResult(), accounting: judgeAccounting(raw.blind_case_id), evidence: { evidence_hash: "2".repeat(64) } };
      },
    },
  });
  return { result, rawInputs, runCalls, verifyCalls };
}

test("runner preserves one master hash across the fixed 3x3 schedule and keeps Judge input condition-blind", async () => {
  const { result, rawInputs, runCalls } = await successfulRun();
  expect(runCalls).toHaveLength(9);
  expect(result.attempts).toHaveLength(9);
  expect(result.attempted_slots).toBe(9);
  expect(result.attempts.every((attempt) => attempt.master_plan_hash === result.master_plan_hash)).toBe(true);
  expect(result.attempts.every((attempt) => attempt.judge.calls.calibration === 0)).toBe(true);
  expect(result.cost_ledger.calibration).toEqual({
    status: "qualified",
    calls: 9,
    duration_ms: 20,
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cost_usd: null },
  });
  expect(result.output_root.startsWith("scratch/")).toBe(true);
  expect(result.attempts.every((attempt) => attempt.artifacts.attempt_root.startsWith("scratch/"))).toBe(true);
  expect(new Set(result.attempts.map((attempt) => attempt.delivery_plan_hash)).size).toBe(9);
  expect(result.attempts.filter((attempt) => attempt.slot.condition_id === "task_start")).toHaveLength(3);
  expect(result.attempts.filter((attempt) => attempt.slot.condition_id === "constraint_followup")).toHaveLength(3);
  expect(result.attempts.filter((attempt) => attempt.slot.condition_id === "first_implementation_checkpoint")).toHaveLength(3);
  expect(rawInputs).toHaveLength(9);
  for (const raw of rawInputs) {
    expect(Object.keys(raw).sort()).toEqual(["blind_case_id", "events", "execution_health", "final_candidate_diff", "public_user_turns"]);
    expect(JSON.stringify(raw)).not.toMatch(/condition_id|delivery_node|timing_node|Practice|Pack|session_id/i);
    expect(raw.blind_case_id).toMatch(/^case-[a-f0-9]{12}$/);
  }
  expect(result.formal_record_created).toBe(false);
}, 30_000);


test("diagnostic-only run executes all hard-evaluator slots with zero Judge scoring calls", async () => {
  const value = await plan();
  const fixture = await diagnosticCalibrationFixture();
  const output = join(workspaceRoot, "scratch", "timing-pilot-diagnostic-" + crypto.randomUUID());
  temporaryRoots.push(output);
  const scoredPreflight = preflight(value.plan_hash);
  const diagnosticPreflight: TimingPilotPreflightSummary = {
    ...scoredPreflight,
    execution_mode: "diagnostic-only",
    judge_score_usable: false,
    cost_estimate: { ...scoredPreflight.cost_estimate, judge_scoring_calls: 0, total_judge_calls: 9 },
    judge: { ...scoredPreflight.judge, real_opt_in: false, calibration_status: "diagnostic", calibration_hash: fixture.report.hash, calibration_reused: true },
    gates: scoredPreflight.gates.map((entry) => entry.id === "judge-provider" ? { ...entry, status: "not-run" as const } : entry.id === "judge-calibration" ? { ...entry, status: "accepted-diagnostic" as const } : entry),
  };
  const { LORELUM_JUDGE_REAL: _notNeeded, ...calibrationEnv } = fixture.env;
  const env = { ...calibrationEnv, LORELUM_LOCAL_EXPERIMENT: "1", LORELUM_PI_BASE_URL: "https://gateway.example/v1", LORELUM_PI_API_KEY: "redacted-test-key" };
  let scoringCalls = 0;
  let attemptCalls = 0;
  const result = await runTimingPilotAttempts({
    root: workspaceRoot, plan: value, run_id: "diagnostic-only-test", output_root: output,
    preflight: diagnosticPreflight, calibration: fixture.report, calibration_diagnostics: fixture.diagnostics, env,
    dependencies: {
      configure_catalog: async () => undefined,
      verify_identity: async () => "mock-pi",
      run_attempt: async (options) => { attemptCalls += 1; return fakeAttempt(options); },
      evaluate: async () => buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" as const }))),
      score: async () => { scoringCalls += 1; throw new Error("diagnostic-only must not score"); },
    },
  });
  expect(result).toMatchObject({ status: "completed", execution_mode: "diagnostic-only", judge_score_usable: false, planned_slots: 9, attempted_slots: 9 });
  expect(attemptCalls).toBe(9);
  expect(scoringCalls).toBe(0);
  expect(result.attempts.every((attempt) => attempt.status === "completed" && attempt.evaluator.status === "pass")).toBe(true);
  expect(result.attempts.every((attempt) => attempt.execution_mode === "diagnostic-only" && attempt.judge.state === "not-run" && attempt.judge.score_usable === false && attempt.judge.calls.scoring === 0)).toBe(true);
  expect(result.cost_ledger.judge).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 });
  const rejectedOutput = join(workspaceRoot, "scratch", "timing-pilot-diagnostic-rejected-" + crypto.randomUUID());
  temporaryRoots.push(rejectedOutput);
  let rejectedAttempts = 0;
  const incompleteDiagnostics = { ...fixture.diagnostics, observations: fixture.diagnostics.observations.slice(1) };
  await expect(runTimingPilotAttempts({ root: workspaceRoot, plan: value, run_id: "diagnostic-rejected-test", output_root: rejectedOutput, preflight: diagnosticPreflight, calibration: fixture.report, calibration_diagnostics: incompleteDiagnostics, env, dependencies: { run_attempt: async (options) => { rejectedAttempts += 1; return fakeAttempt(options); } } })).rejects.toThrow("matching private sidecar");
  expect(rejectedAttempts).toBe(0);
});

test("preflight failure blocks the entire attempt matrix", async () => {
  const value = await plan();
  const output = join(workspaceRoot, "scratch", `timing-pilot-blocked-${crypto.randomUUID()}`);
  temporaryRoots.push(output);
  let calls = 0;
  const blocked = { ...preflight(value.plan_hash), status: "preflight-blocked" as const, allowed_to_start: false };
  await expect(runTimingPilotAttempts({ root: workspaceRoot, plan: value, run_id: "blocked-test", output_root: output, preflight: blocked, calibration: calibration(), env: { LORELUM_LOCAL_EXPERIMENT: "1", LORELUM_JUDGE_REAL: "1" }, dependencies: { run_attempt: async (options) => { calls += 1; return fakeAttempt(options); } } })).rejects.toThrow("successful matching preflight");
  expect(calls).toBe(0);
});

test("a failed slot is retained and does not trigger a replacement attempt", async () => {
  const { result, runCalls } = await successfulRun({ firstFailure: true, verifyFailAt: 2 });
  expect(runCalls).toEqual(["block-1-position-1-task-start"]);
  expect(result.attempts[0]?.attempt_id).toBe(runCalls[0]);
  expect(result.attempts[0]?.status).toBe("indeterminate");
  expect(result.attempts[1]?.status).toBe("blocked");
  expect(result.attempts.slice(2).every((attempt) => attempt.status === "not-run")).toBe(true);
}, 30_000);

test("identity drift blocks the current and all remaining slots without replacing them", async () => {
  const { result, runCalls, verifyCalls } = await successfulRun({ verifyFailAt: 2 });
  expect(runCalls).toHaveLength(1);
  expect(verifyCalls).toBe(2);
  expect(result.attempts).toHaveLength(9);
  expect(result.attempts[1]?.status).toBe("blocked");
  expect(result.attempts.slice(2).every((attempt) => attempt.status === "not-run")).toBe(true);
});

test("evaluator and Judge failures remain indeterminate without fabricating an observed score", async () => {
  const { result, runCalls } = await successfulRun({
    verifyFailAt: 2,
    evaluate: async () => { throw new Error("evaluator adapter unavailable"); },
    score: async () => { throw new Error("Judge endpoint timed out"); },
  });
  expect(runCalls).toHaveLength(1);
  expect(result.status).toBe("incomplete");
  expect(result.attempted_slots).toBe(1);
  expect(result.attempts[0].status).toBe("indeterminate");
  expect(result.attempts[0].evaluator.status).toBe("indeterminate");
  expect(result.attempts[0].judge.state).toBe("judge-unavailable");
  expect(result.attempts[0].judge.score).toBeNull();
  expect(result.attempts[0].judge.calls).toEqual({ calibration: 0, scoring: 1 });
  expect(result.attempts[0].judge.evidence_hash).toBeNull();
  expect(result.attempts[1].status).toBe("blocked");
  expect(result.attempts.slice(2).every((attempt) => attempt.status === "not-run")).toBe(true);
  expect(result.formal_record_created).toBe(false);
});


test("a Judge indeterminate result remains separate from the hard evaluator", async () => {
  const { result } = await successfulRun({
    verifyFailAt: 2,
    score: async (raw) => ({
      result: { ...judgeResult(), state: "indeterminate", score: 0, criteria: [], reason: "insufficient public evidence" },
      accounting: { ...judgeAccounting(raw.blind_case_id), state: "indeterminate", failure_reason: "insufficient public evidence" },
      evidence: { evidence_hash: "2".repeat(64) },
    }),
  });
  expect(result.attempts[0].evaluator.status).toBe("pass");
  expect(result.attempts[0].judge.state).toBe("indeterminate");
  expect(result.attempts[0].judge.score).toBeNull();
  expect(result.attempts[0].status).toBe("indeterminate");
  expect(result.formal_record_created).toBe(false);
}, 30_000);
