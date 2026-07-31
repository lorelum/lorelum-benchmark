import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceRoot } from "../../../fs";
import { buildSchedule, diagnosticConditions, parseDiagnosticPlan, summarizePlan, type DiagnosticPlan, type ReportEntry } from "./profile-diagnostic-plan";
import { diagnosticOutputPath, redactedSchedule, writeSummary } from "./profile-diagnostic-runner";

function plan(overrides: Record<string, unknown> = {}): DiagnosticPlan {
  return parseDiagnosticPlan({
    schema_version: "profile-diagnostic-plan/v2", id: "test-plan", schedule_seed: "balanced-diagnostics-v1", schedule_algorithm: "cyclic-latin-square/v1", repetitions: 3, independent_candidate_threshold: 3,
    conditions: [...diagnosticConditions], candidates: [{ id: "candidate-a", path: "incubator/practice-injection/profile-update-command-boundary-v1", source_commit: "a".repeat(40), snapshot_id: "b".repeat(64), profile_input_hash: "c".repeat(64) }], ...overrides,
  }, "test-plan.yaml");
}

test("cyclic Latin schedule is deterministic and balances positions", () => {
  const schedule = buildSchedule(plan());
  expect(schedule).toEqual(buildSchedule(plan()));
  expect(schedule).toHaveLength(9);
  for (let block = 1; block <= 3; block += 1) expect(schedule.filter((attempt) => attempt.block === block).map((attempt) => attempt.condition).sort()).toEqual([...diagnosticConditions].sort());
  for (const condition of diagnosticConditions) expect(schedule.filter((attempt) => attempt.condition === condition).map((attempt) => attempt.planned_position).sort()).toEqual([1, 2, 3]);
  const serialized = JSON.stringify(redactedSchedule(schedule));
  expect(serialized).not.toContain("candidate_path");
  expect(serialized).not.toContain("incubator/practice-injection");
  expect(diagnosticOutputPath(join(workspaceRoot, "scratch", "profile-diagnostics", "test"))).toBe("scratch/profile-diagnostics/test");
});

test("plan rejects a non-balanced repetition count and unknown condition declaration", () => {
  expect(() => plan({ repetitions: 2 })).toThrow("divisible by 3");
  expect(() => plan({ repetitions: 1 })).toThrow("one-repeat-re-admission");
  expect(() => plan({ conditions: ["baseline", "oracle-practice", "other"] })).toThrow("conditions must declare");
});

test("explicit one-repeat re-admission gate schedules each condition once and remains diagnostic-only", () => {
  const diagnosticPlan = plan({
    repetitions: 1,
    independent_candidate_threshold: 1,
    execution_gate: {
      kind: "one-repeat-re-admission",
      parent_plan: { id: "balanced-diagnostics-v2", repetitions: 3 },
      candidate_id: "candidate-a",
      parent_block: 1,
    },
  });
  const schedule = buildSchedule(diagnosticPlan);
  expect(schedule).toHaveLength(3);
  expect(schedule.map((attempt) => attempt.condition).sort()).toEqual([...diagnosticConditions].sort());
  const entries: ReportEntry[] = schedule.map((attempt) => ({ candidate: attempt.id, condition: attempt.condition, repeat: attempt.block, block: attempt.block, planned_position: attempt.planned_position, evaluation_status: "evaluated", source_commit: attempt.source_commit, snapshot_id: attempt.snapshot_id, profile_input_hash: attempt.profile_input_hash, semantic: "pass", practice_observation: attempt.condition === "oracle-practice" ? "observed" : "not-observed", joint_pass: attempt.condition === "oracle-practice" }));
  const summary = summarizePlan(diagnosticPlan, schedule, entries);
  expect(summary.groups[0].conclusion_grade).toBe("diagnostic-only");
  expect(summary.overall_conclusion_grade).toBe("diagnostic-only");
});

test("one-repeat re-admission gate fails closed when it is not exactly one candidate", () => {
  expect(() => plan({
    repetitions: 1,
    execution_gate: {
      kind: "one-repeat-re-admission",
      parent_plan: { id: "balanced-diagnostics-v2", repetitions: 3 },
      candidate_id: "another-candidate",
      parent_block: 1,
    },
  })).toThrow("exactly its one candidate");
  expect(() => plan({
    repetitions: 3,
    execution_gate: {
      kind: "one-repeat-re-admission",
      parent_plan: { id: "balanced-diagnostics-v2", repetitions: 3 },
      candidate_id: "candidate-a",
      parent_block: 1,
    },
  })).toThrow("exactly its one candidate");
});

test("one-repeat summary persists only redacted gate metadata", async () => {
  const diagnosticPlan = plan({
    repetitions: 1,
    execution_gate: {
      kind: "one-repeat-re-admission",
      parent_plan: { id: "balanced-diagnostics-v2", repetitions: 3 },
      candidate_id: "candidate-a",
      parent_block: 1,
    },
  });
  const output = await mkdtemp(join(tmpdir(), "lorelum-one-repeat-summary-"));
  try {
    await writeSummary(output, diagnosticPlan, buildSchedule(diagnosticPlan), [], false);
    const summary = await Bun.file(join(output, "summary.json")).json() as { plan: { execution_gate?: unknown } };
    expect(summary.plan.execution_gate).toEqual(diagnosticPlan.execution_gate);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("incubator/practice-injection");
    expect(serialized).not.toContain("private/");
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});

test("summary retains planned denominators and downgrades unhealthy or indeterminate attempts", () => {
  const diagnosticPlan = plan();
  const schedule = buildSchedule(diagnosticPlan);
  const entries: ReportEntry[] = schedule.map((attempt) => ({
    candidate: attempt.id, condition: attempt.condition, repeat: attempt.block, block: attempt.block, planned_position: attempt.planned_position,
    evaluation_status: "evaluated", source_commit: attempt.source_commit, snapshot_id: attempt.snapshot_id, profile_input_hash: attempt.profile_input_hash,
    semantic: "pass", practice_observation: attempt.condition === "oracle-practice" ? "observed" : "not-observed", joint_pass: attempt.condition === "oracle-practice",
  }));
  const baseline = entries.find((entry) => entry.condition === "baseline")!;
  baseline.evaluation_status = "execution-failed";
  baseline.semantic = undefined; baseline.practice_observation = undefined; baseline.joint_pass = undefined;
  const indeterminate = entries.find((entry) => entry.condition === "irrelevant-practice")!;
  indeterminate.practice_observation = "indeterminate"; indeterminate.joint_pass = false;
  const summary = summarizePlan(diagnosticPlan, schedule, entries);
  const group = summary.groups[0];
  expect(group.conditions.baseline.planned).toBe(3);
  expect(group.conditions.baseline.evaluation_health["execution-failed"]).toBe(1);
  expect(group.conditions["irrelevant-practice"].practice_observation.indeterminate).toBe(1);
  expect(group.conclusion_grade).toBe("diagnostic-or-uncertain");
  expect(JSON.stringify(summary)).not.toContain("private/practices");
});

test("complete three-repeat lead remains a directional screen, not reproducible direction", () => {
  const diagnosticPlan = plan();
  const schedule = buildSchedule(diagnosticPlan);
  const entries: ReportEntry[] = schedule.map((attempt) => ({ candidate: attempt.id, condition: attempt.condition, repeat: attempt.block, block: attempt.block, planned_position: attempt.planned_position, evaluation_status: "evaluated", source_commit: attempt.source_commit, snapshot_id: attempt.snapshot_id, profile_input_hash: attempt.profile_input_hash, semantic: "pass", practice_observation: attempt.condition === "oracle-practice" ? "observed" : "not-observed", joint_pass: attempt.condition === "oracle-practice" }));
  const summary = summarizePlan(diagnosticPlan, schedule, entries);
  expect(summary.groups[0].conclusion_grade).toBe("directional-screen");
  expect(summary.overall_conclusion_grade).toBe("diagnostic-only");
  expect(summary.groups[0].oracle_deltas.baseline.bootstrap_95).toHaveLength(2);
});
