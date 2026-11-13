import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executionPlan, observeRunTrace, type AutonomousPackPlanV2 } from "./paired-runner";
import { hashContract, schedulePlan, type AutonomousPlan } from "../v1/plan";
import type { AutonomousObservation } from "../v1/summary";
const digest = "a".repeat(64);
const base: AutonomousPlan = {
  schema_version: "autonomous-pack-plan/v1", id: "pilot", run_kind: "pilot",
  tasks: [{ id: "one", source_sha256: digest, input_sha256: digest, evaluator_sha256: digest }], repetitions: 1, order_seed: 1,
  common: { environment_sha256: digest, image_sha256: digest, agent: "pi", model: "provider/model", model_parameters_sha256: digest, profile_sha256: digest, tool_policy_sha256: digest, system_prompt_sha256: digest, budget: { max_turns: 2, max_duration_ms: 1000 } },
  pack: { source: "local", snapshot_uri: "local", snapshot_sha256: digest, index_sha256: digest },
};
const wrap = (plan: AutonomousPlan): AutonomousPackPlanV2 => ({ schema_version: "autonomous-pack-plan/v2", execution_contract: "autonomous-pack-pi-verifier/v2", plan, task_contracts: plan.tasks.map(task => ({ id: task.id, runtime: "node", declaration_sha256: digest, calibration_sha256: digest })) });

test("v2 identity binds the complete plan and cannot reuse a v1 schedule identity", () => {
  const outer = wrap(base), projected = executionPlan(outer);
  expect(projected.id).toBe(`autonomous-pack/v2:${hashContract(outer)}`);
  expect(hashContract(projected)).not.toBe(hashContract(base));
  expect(schedulePlan(projected)[0].pair_id).not.toBe(schedulePlan(base)[0].pair_id);
  expect(executionPlan(wrap({ ...base, tasks: [{ ...base.tasks[0], evaluator_sha256: "b".repeat(64) }] })).id).not.toBe(projected.id);
  expect(executionPlan({ ...outer, task_contracts: [{ ...outer.task_contracts[0], runtime: "python" }] }).id).not.toBe(projected.id);
  expect(() => executionPlan({ ...outer, task_contracts: [] })).toThrow();
  expect(() => executionPlan(base)).toThrow();
  expect(() => executionPlan({ ...outer, execution_contract: "other" })).toThrow();
  expect(() => executionPlan({ ...outer, extra: true })).toThrow();
});

test("completed shell trace permits evaluation while incomplete structure does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "v2-trace-decision-"));
  try {
    const queryResult = { content: [{ type: "text", text: JSON.stringify({ protocolVersion: 2, toolVersion: "fixture", command: "query", ok: true, data: { mode: "semantic", coverage: "complete", results: [] } }) }], details: { exitCode: 0 } };
    const events = [
      { type: "session" }, { type: "agent_start" },
      { type: "tool_execution_start", toolCallId: "s", toolName: "bash", args: {} },
      { type: "tool_execution_end", toolCallId: "s", toolName: "bash", result: {}, isError: false },
      { type: "tool_execution_start", toolCallId: "q", toolName: "lore_query", args: {} },
      { type: "tool_execution_end", toolCallId: "q", toolName: "lore_query", result: queryResult, isError: false },
      { type: "agent_end", messages: [{ role: "assistant", stopReason: "stop", content: [] }] },
      { type: "agent_settled", aborted: false },
    ];
    const path = join(root, "trace.jsonl");
    const observation = (): AutonomousObservation => ({
      schema_version: "autonomous-pack-observation/v1", plan_id: "pilot", plan_sha256: digest,
      pair_id: digest, condition: "empty-store", ordinal: 0, input_sha256: digest, common_sha256: digest,
      pack_snapshot_sha256: null, index_sha256: null, verification: { input: true, isolation: true, treatment: true, reasons: [] },
      health: "execution-failed", failure_reasons: [], semantic: "not-run", quality: "not-run", quality_probes: [],
      trace: { complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 },
      duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: [],
    });
    const run = { status: "completed" as const, reason: null, artifacts: { pi: { path, sha256: digest }, usage: null, agentStderr: null, finishLog: null, topology: null } };
    await writeFile(path, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    const completed = observation();
    expect(await observeRunTrace(completed, run)).toBe(true);
    expect(completed.trace).toMatchObject({ complete: false, query: "indeterminate", query_empty: 1 });
    await writeFile(path, events.slice(0, -1).map(event => JSON.stringify(event)).join("\n") + "\n");
    const incomplete = observation();
    expect(await observeRunTrace(incomplete, run)).toBe(false);
    expect(incomplete.health).toBe("indeterminate");
    expect(incomplete.trace).toMatchObject({ complete: false, query: "indeterminate", query_empty: 1 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
