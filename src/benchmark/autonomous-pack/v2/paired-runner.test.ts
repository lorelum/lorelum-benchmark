import { expect, test } from "bun:test";
import { executionPlan, type AutonomousPackPlanV2 } from "./paired-runner";
import { hashContract, schedulePlan, type AutonomousPlan } from "../v1/plan";
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
