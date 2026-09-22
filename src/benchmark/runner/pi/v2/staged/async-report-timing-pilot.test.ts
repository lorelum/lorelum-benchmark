import { expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTimingPilotSchedule,
  dryRunTimingPilot,
  hashTimingPilotPlan,
  parseTimingPilotPlan,
  readTimingPilotPlan,
  runTimingPilotPreflight,
  timingPilotPlanPath,
  writeTimingPilotPreflightSummary,
  type TimingPilotPlan,
} from "./async-report-timing-pilot";
import { workspaceRoot } from "../../../../fs";

const planPath = join(workspaceRoot, timingPilotPlanPath);

async function plan(): Promise<TimingPilotPlan> {
  return readTimingPilotPlan(planPath);
}

const testRuntimeProbe = async () => ({ bun: "1.4.2", node: "24.21.0" });

function qualifiedCalibration() {
  return {
    id: "async-report-replan-judge-calibration",
    version: "v1",
    hash: "a".repeat(64),
    status: "qualified" as const,
    calls: 9,
    medians: { reference: 90, equivalent: 88, "anti-pattern": 60 },
    scope: { provider_id: "judge-agent/async-report-replan/v1" as const, provider_version: "v1" as const, model: "deepseek-v4-flash" },
    duration_ms: 100,
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, cost_usd: 0 },
    attestation: "test-attestation",
  };
}

test("timing pilot plan is frozen to nine balanced slots", async () => {
  const value = await plan();
  expect(value.schedule.slots).toEqual(buildTimingPilotSchedule());
  expect(value.schedule.slots).toHaveLength(9);
  expect(new Set(value.schedule.slots.map((slot) => slot.condition_id))).toEqual(new Set(["task_start", "constraint_followup", "first_implementation_checkpoint"]));
  expect(value.schedule.slots.filter((slot) => slot.condition_id === "task_start")).toHaveLength(3);
  expect(value.schedule.slots.filter((slot) => slot.condition_id === "constraint_followup")).toHaveLength(3);
  expect(value.schedule.slots.filter((slot) => slot.condition_id === "first_implementation_checkpoint")).toHaveLength(3);
});

test("plan hash drift is rejected before any gate runs", async () => {
  const value = await plan();
  await expect(parseTimingPilotPlan({ ...value, plan_hash: "b".repeat(64) })).rejects.toThrow("plan_hash");
});

test("plan parser rejects extra fields and any schedule mutation", async () => {
  const value = await plan();
  await expect(parseTimingPilotPlan({ ...value, unexpected: true })).rejects.toThrow("unsupported or missing fields");
  const slots = [...value.schedule.slots];
  [slots[0], slots[1]] = [slots[1], slots[0]];
  await expect(parseTimingPilotPlan({ ...value, schedule: { ...value.schedule, slots } })).rejects.toThrow("schedule does not match");
});

test("invalid plan preflight emits a complete blocked gate summary", async () => {
  const summary = await runTimingPilotPreflight({ root: workspaceRoot, plan_path: "missing/async-report-timing-pilot.yaml" });
  expect(summary.status).toBe("invalid-plan");
  expect(summary.allowed_to_start).toBe(false);
  expect(summary.gates.length).toBeGreaterThanOrEqual(4);
  expect(summary.gates[0]?.id).toBe("plan");
});

test("host runtime drift blocks the pilot before the model probe", async () => {
  const value = await plan();
  let probeCalled = false;
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    plan: value,
    runtime_probe: async () => ({ bun: "1.4.2", node: "22.21.0" }),
    model_probe: async () => { probeCalled = true; return { version: "0.85.1" }; },
  });
  expect(summary.allowed_to_start).toBe(false);
  expect(probeCalled).toBe(false);
  expect(summary.gates.find((entry) => entry.id === "runtime")?.status).toBe("failed");
  expect(summary.gates.find((entry) => entry.id === "pi-model-probe")?.status).toBe("blocked");
});

test("model probe version drift blocks the pilot before Judge calibration", async () => {
  const value = await plan();
  let calibrationCalled = false;
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: value,
    env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_BASE_URL: "https://judge.example/v1", LORELUM_JUDGE_API_KEY: "test-key", LORELUM_JUDGE_MODEL: "deepseek-v4-flash" },
    model_probe: async () => ({ version: "0.80.10" }),
    judge_calibration: async () => { calibrationCalled = true; return qualifiedCalibration(); },
  });
  expect(summary.allowed_to_start).toBe(false);
  expect(summary.gates.find((entry) => entry.id === "pi-model-probe")?.status).toBe("failed");
  expect(calibrationCalled).toBe(false);
});


test("model probe runs before a dry-run drift becomes invalid-plan", async () => {
  const value = await plan();
  let probeCalled = false;
  let calibrationCalled = false;
  const drifted = {
    ...value,
    prompts: { ...value.prompts, system_prompt_sha256: "0".repeat(64) },
  } as TimingPilotPlan;
  const driftedWithHash = { ...drifted, plan_hash: await hashTimingPilotPlan(drifted) };
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: driftedWithHash,
    env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_BASE_URL: "https://judge.example/v1", LORELUM_JUDGE_API_KEY: "test-key", LORELUM_JUDGE_MODEL: "deepseek-v4-flash" },
    model_probe: async () => { probeCalled = true; return { version: "0.85.1" }; },
    judge_calibration: async () => { calibrationCalled = true; return qualifiedCalibration(); },
  });
  expect(probeCalled).toBe(true);
  expect(calibrationCalled).toBe(false);
  expect(summary.status).toBe("invalid-plan");
  expect(summary.allowed_to_start).toBe(false);
  expect(summary.gates.map((entry) => entry.id)).toEqual(["environment", "runtime", "pi-model-probe", "plan-dry-run", "judge-provider", "judge-calibration"]);
  expect(summary.gates.find((entry) => entry.id === "pi-model-probe")?.status).toBe("passed");
  expect(summary.gates.find((entry) => entry.id === "plan-dry-run")?.status).toBe("failed");
});

test("dry-run rejects treatment provenance drift", async () => {
  const value = await plan();
  const drifted = {
    ...value,
    treatment: { ...value.treatment, practice: { ...value.treatment.practice, card_sha256: "0".repeat(64) } },
  } as TimingPilotPlan;
  const driftedWithHash = { ...drifted, plan_hash: await hashTimingPilotPlan(drifted) };
  await expect(dryRunTimingPilot({ root: workspaceRoot, plan: driftedWithHash })).rejects.toThrow("treatment provenance");
});

test("retired timing pilot plans are blocked before the model probe", async () => {
  const value = await plan();
  let probeCalled = false;
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: { ...value, lifecycle_stage: "retired" } as TimingPilotPlan,
    model_probe: async () => { probeCalled = true; return { version: "0.85.1" }; },
  });
  expect(summary.status).toBe("invalid-plan");
  expect(summary.allowed_to_start).toBe(false);
  expect(probeCalled).toBe(false);
});

test("dry-run validates candidate, environment, prompt and isolation without model calls", async () => {
  const value = await plan();
  const result = await dryRunTimingPilot({ root: workspaceRoot, plan: value });
  expect(result).toMatchObject({ plan_hash: value.plan_hash, slot_count: 9, candidate_ready: true, environment_ready: true, prompt_ready: true, isolation_ready: true });
});

test("preflight requires a qualified Judge calibration before allowing the pilot", async () => {
  const value = await plan();
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: value,
    env: { LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_BASE_URL: "https://judge.example/v1", LORELUM_JUDGE_API_KEY: "test-key", LORELUM_JUDGE_MODEL: "deepseek-v4-flash" },
    model_probe: async () => ({ version: "0.85.1" }),
    judge_calibration: async () => qualifiedCalibration(),
  });
  expect(summary.allowed_to_start).toBe(true);
  expect(summary.status).toBe("ready");
  expect(summary.judge.calibration_status).toBe("qualified");
  expect(summary.gates.every((entry) => entry.status === "passed")).toBe(true);
});

test("missing Judge opt-in blocks the pilot without starting calibration", async () => {
  const value = await plan();
  let calibrationCalled = false;
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: value,
    env: {},
    model_probe: async () => ({ version: "0.85.1" }),
    judge_calibration: async () => { calibrationCalled = true; return qualifiedCalibration(); },
  });
  expect(summary.allowed_to_start).toBe(false);
  expect(summary.status).toBe("preflight-blocked");
  expect(calibrationCalled).toBe(false);
  expect(summary.gates.find((entry) => entry.id === "judge-provider")?.status).toBe("failed");
  expect(summary.gates.find((entry) => entry.id === "judge-calibration")?.status).toBe("blocked");
});

test("preflight summary is human-readable and does not contain credentials", async () => {
  const value = await plan();
  const summary = await runTimingPilotPreflight({
    root: workspaceRoot,
    runtime_probe: testRuntimeProbe,
    plan: value,
    env: {},
    run_model_probe: false,
    run_judge_calibration: false,
  });
  const directory = join(workspaceRoot, ".run-workspaces", `timing-pilot-summary-${crypto.randomUUID()}`);
  try {
    const paths = await writeTimingPilotPreflightSummary(summary, directory);
    const json = await readFile(paths.json_path, "utf8");
    const markdown = await readFile(paths.markdown_path, "utf8");
    expect(json).not.toContain("test-key");
    expect(json).not.toContain("private/practice.md");
    expect(markdown).toContain("allowed_to_start: false");
    expect(markdown).toContain(value.plan_hash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
