import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { readFileSync } from "node:fs";
import { assertPlan, hashContract, schedulePlan, type AutonomousPlan, type ScheduledRun } from "./plan";
import { assertObservation, summarizePlan, traceObservation, type AutonomousObservation } from "./summary";
import { auditTrace } from "./trace";

const h = (char: string) => char.repeat(64);
const plan: AutonomousPlan = {
  schema_version: "autonomous-pack-plan/v1", id: "pilot", run_kind: "pilot",
  tasks: ["one", "two", "three"].map(id => ({ id, source_sha256: h("a"), input_sha256: h("b"), evaluator_sha256: h("c") })),
  repetitions: 3, order_seed: 71,
  common: { environment_sha256: h("d"), image_sha256: h("e"), agent: "pi/1.5.0", model: "provider/model@version", model_parameters_sha256: h("4"), profile_sha256: h("f"), tool_policy_sha256: h("0"), system_prompt_sha256: h("1"), budget: { max_turns: 3, max_duration_ms: 60000 } },
  pack: { source: "local working tree", snapshot_uri: "snapshots/pack", snapshot_sha256: h("2"), index_sha256: h("3") }
};
const observation = (slot: ScheduledRun): AutonomousObservation => ({
  schema_version: "autonomous-pack-observation/v1", plan_id: plan.id, plan_sha256: hashContract(plan), pair_id: slot.pair_id,
  condition: slot.condition, ordinal: slot.ordinal, input_sha256: slot.input_sha256, common_sha256: slot.common_sha256,
  pack_snapshot_sha256: slot.condition === "pack-installed" ? plan.pack.snapshot_sha256 : null,
  index_sha256: slot.condition === "pack-installed" ? plan.pack.index_sha256 : null,
  verification: { input: true, isolation: true, treatment: true, reasons: [] },
  health: "evaluated", failure_reasons: [], semantic: "pass", quality: "judge-unavailable", quality_probes: [],
  trace: { complete: true, query: "not-queried", get_success: 0, get_failed: 0, get_indeterminate: 0 },
  duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: []
});

describe("autonomous Pack plan and summary", () => {
  test("rejects unregistered fields, incomplete identities and duplicate task IDs", () => {
    assertPlan(plan);
    expect(() => assertPlan({ ...plan, typo: 1 })).toThrow();
    expect(() => assertPlan({ ...plan, common: { ...plan.common, image_sha256: "" } })).toThrow();
    expect(() => assertPlan({ ...plan, tasks: [plan.tasks[0], plan.tasks[0]] })).toThrow();
    expect(() => assertPlan({ ...plan, order_seed: -1 })).toThrow();
  });

  test("schedules stable adjacent pairs and balances each task and odd remainder", () => {
    const runs = schedulePlan(plan);
    expect(runs).toEqual(schedulePlan(plan));
    expect(runs.length).toBe(18);
    for (let i = 0; i < runs.length; i += 2) {
      expect(runs[i].pair_id).toBe(runs[i + 1].pair_id);
      expect(runs[i].condition).not.toBe(runs[i + 1].condition);
      expect(runs[i].input_sha256).toBe(runs[i + 1].input_sha256);
    }
    for (const task of plan.tasks) {
      const first = runs.filter((run, i) => i % 2 === 0 && run.task_id === task.id);
      expect(first.filter(run => run.condition === "empty-store").length).toBeGreaterThanOrEqual(1);
      expect(first.filter(run => run.condition === "pack-installed").length).toBeGreaterThanOrEqual(1);
    }
    expect(Math.abs(runs.filter((run, i) => i % 2 === 0 && run.condition === "empty-store").length - runs.filter((run, i) => i % 2 === 0 && run.condition === "pack-installed").length)).toBe(1);
    expect(hashContract({ b: 2, a: 1 })).toBe(hashContract({ a: 1, b: 2 }));
  });

  test("retains missing and failed planned slots, and separates semantic from quality", () => {
    const slots = schedulePlan(plan);
    const good = observation(slots[0]);
    const failure = { ...observation(slots[1]), health: "execution-failed" as const, failure_reasons: ["timeout"], semantic: "not-run" as const, quality: "not-run" as const };
    const result = summarizePlan(plan, [good, failure]);
    expect(result.planned_runs).toBe(18);
    expect(result.runs.filter(run => run.status === "missing").length).toBe(16);
    expect(result.pairs.eligible).toBe(0);
    expect(result.conditions[good.condition].semantic.pass).toBe(1);
    expect(result.conditions[good.condition].quality["judge-unavailable"]).toBe(1);
    expect(result.conditions[failure.condition].health["execution-failed"]).toBe(1);
    expect(result.runs[1].reasons).toContain("timeout");
    const schema = JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-summary-v1.schema.json", import.meta.url), "utf8"));
    expect(new Ajv2020({ strict: true }).compile(schema)(result)).toBe(true);
  });

  test("aggregates available token counts independently without treating missing usage as zero", () => {
    const slots = schedulePlan(plan);
    const empty = slots.filter(slot => slot.condition === "empty-store");
    const pack = slots.filter(slot => slot.condition === "pack-installed");
    const result = summarizePlan(plan, [
      { ...observation(empty[0]), input_tokens: 0, output_tokens: null, total_tokens: null, cost_usd: 0 },
      { ...observation(empty[1]), input_tokens: 12, output_tokens: 3, total_tokens: 15, cost_usd: 0.25 },
      { ...observation(pack[0]), input_tokens: null, output_tokens: 0, total_tokens: 0 },
      { ...observation(pack[1]), input_tokens: 8, output_tokens: 2, total_tokens: 10, health: "execution-failed", failure_reasons: ["timeout"], semantic: "not-run", quality: "not-run" }
    ]);
    expect(result.conditions["empty-store"].input_tokens).toEqual({ available: 2, sum: 12 });
    expect(result.conditions["empty-store"].output_tokens).toEqual({ available: 1, sum: 3 });
    expect(result.conditions["empty-store"].total_tokens).toEqual({ available: 1, sum: 15 });
    expect(result.conditions["empty-store"].cost_usd).toEqual({ available: 2, sum: 0.25 });
    expect(result.conditions["pack-installed"].input_tokens).toEqual({ available: 1, sum: 8 });
    expect(result.conditions["pack-installed"].output_tokens).toEqual({ available: 2, sum: 2 });
    expect(result.conditions["pack-installed"].total_tokens).toEqual({ available: 2, sum: 10 });
    expect(result.conditions["pack-installed"].cost_usd).toEqual({ available: 0, sum: 0 });
    const noUsage = summarizePlan(plan, [observation(empty[0])]);
    expect(noUsage.conditions["empty-store"].input_tokens).toEqual({ available: 0, sum: 0 });
    const zeroUsage = summarizePlan(plan, [{ ...observation(empty[0]), input_tokens: 0 }]);
    expect(zeroUsage.conditions["empty-store"].input_tokens).toEqual({ available: 1, sum: 0 });
    const schema = JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-summary-v1.schema.json", import.meta.url), "utf8"));
    expect(new Ajv2020({ strict: true }).compile(schema)(result)).toBe(true);
    for (const field of ["input_tokens", "output_tokens", "total_tokens"] as const) {
      expect(() => assertObservation({ ...observation(empty[0]), [field]: undefined })).toThrow();
      expect(() => assertObservation({ ...observation(empty[0]), [field]: -1 })).toThrow();
      expect(() => assertObservation({ ...observation(empty[0]), [field]: 0.5 })).toThrow();
    }
  });

  test("requires identities, trace and healthy paired evidence before comparison", () => {
    const slots = schedulePlan(plan);
    const first = observation(slots[0]), second = observation(slots[1]);
    const valid = summarizePlan(plan, [first, second]);
    expect(valid.pairs).toMatchObject({ planned: 9, eligible: 1, semantic_comparable: 1, both_pass: 1 });
    for (const changed of [
      { ...second, common_sha256: h("9") },
      { ...second, input_sha256: h("9") },
      { ...second, pack_snapshot_sha256: h("9") },
      { ...second, trace: { ...second.trace, complete: false, query: "indeterminate" as const } },
      { ...second, verification: { ...second.verification, isolation: false, reasons: ["not isolated"] } }
    ]) expect(summarizePlan(plan, [first, changed]).pairs.eligible).toBe(0);
    expect(() => summarizePlan(plan, [first, first])).toThrow();
    expect(() => summarizePlan(plan, [{ ...first, plan_sha256: h("9") }])).toThrow();
    expect(() => assertObservation({ ...first, health: "execution-failed", semantic: "pass" })).toThrow();
    expect(() => assertObservation({ ...first, quality_probes: [{ id: "probe", status: "observed", points: 2, max_points: 1 }] })).toThrow();
    const unavailable = { ...second, input_sha256: null, common_sha256: null, health: "not-executable" as const, semantic: "not-run" as const, quality: "not-run" as const, failure_reasons: ["setup failed"] };
    expect(summarizePlan(plan, [first, unavailable]).runs[1].status).toBe("ineligible");
    expect(() => assertObservation({ ...first, verification: { ...first.verification, input: false } })).toThrow();
  });

  test("distinguishes no query and indeterminate trace without exposing contents", () => {
    const complete = auditTrace('{"type":"session","version":3}\n{"type":"agent_start"}\n{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","content":[]}]}\n{"type":"agent_settled","aborted":false}\n');
    expect(traceObservation(complete)).toEqual({ complete: true, query: "not-queried", get_success: 0, get_failed: 0, get_indeterminate: 0 });
    expect(traceObservation(auditTrace("")).query).toBe("indeterminate");
  });
});
