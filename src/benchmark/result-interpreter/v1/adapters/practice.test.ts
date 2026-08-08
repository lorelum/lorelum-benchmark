import { expect, test } from "bun:test";
import { interpretPracticeSummary, practiceToInterpretationInput } from "./practice";

const commit = "f10d672394402a819efe3ca0cdd1d5c4eab93f55";
const snapshot = "1519423103dfcb0ecb9e10314345c0098bb39e532c9a086d59631cc0d06b524f";
const inputHash = "c9d38b6c90604796f97421cb79453730146eca73aa6fb1eab7a81a664ac1d083";
const otherInputHash = "d".repeat(64);
const conditions = ["baseline", "oracle-practice", "irrelevant-practice"] as const;

type EntryOverrides = Record<string, unknown>;
type ScheduleOverrides = Record<string, unknown>;

function scheduleEntry(block: number, condition: string, overrides: ScheduleOverrides = {}): Record<string, unknown> {
  return {
    id: "login-page-auth-flow-v2",
    source_commit: commit,
    snapshot_id: snapshot,
    profile_input_hash: inputHash,
    block,
    planned_position: 1,
    condition,
    ...overrides,
  };
}

function v3Entry(condition: string, repeat: number, overrides: EntryOverrides = {}): Record<string, unknown> {
  return {
    candidate: "login-page-auth-flow-v2",
    condition,
    repeat,
    evaluation_status: "evaluated",
    trace: {
      condition_id: condition,
      channel: "condition-scoped-private-runtime",
      profile_input_hash: inputHash,
      practice_id: "login-page.frontend-layering",
      practice_version: "v1",
      practice_sha256: "6a90238898a8caed181ffdbe697d8984f6bc8a8d99d6479f7de7baefea4e7fb6",
    },
    source_commit: commit,
    snapshot_id: snapshot,
    profile_input_hash: inputHash,
    semantic: "pass",
    practice_observation: "observed",
    joint_pass: true,
    judge: { provider_id: "practice-layered-api/v2", provider_version: "2.0.0", state: "observed", score: 100, criteria: [] },
    block: repeat,
    planned_position: 1,
    actual_execution_position: 1,
    ...overrides,
  };
}

/** Builds a login-page-like v3 summary: 6 blocks x 3 conditions, with `passes` joint-pass counts per condition. */
function loginPageSummary(passes: Record<string, number>, inputHashOverride: string = inputHash, repeats = 6): Record<string, unknown> {
  const schedule: Array<Record<string, unknown>> = [];
  const entries: Array<Record<string, unknown>> = [];
  for (let block = 1; block <= repeats; block += 1) {
    for (const condition of conditions) {
      schedule.push(scheduleEntry(block, condition, { profile_input_hash: inputHashOverride }));
    }
  }
  for (const condition of conditions) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const pass = repeat <= (passes[condition] ?? 0);
      entries.push(v3Entry(condition, repeat, {
        profile_input_hash: inputHashOverride,
        ...(pass ? {} : { semantic: "fail", practice_observation: "not-observed", joint_pass: false }),
      }));
    }
  }
  return {
    schema_version: "profile-diagnostic-summary/v3",
    generated_at: "2026-08-06T03:15:50.958Z",
    plan: { id: "login-page-auth-flow-v2", schedule_seed: "seed", schedule_algorithm: "cyclic-latin-square/v1", repetitions: repeats, schedule },
    entries,
    report: { schema_version: "profile-diagnostic-report/v1", groups: [], overall_conclusion_grade: "diagnostic-only" },
    judge: {},
    interrupted: false,
  };
}

test("login-page-like summary maps to a unit and oracle strict lead signals", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const input = practiceToInterpretationInput(summary);
  expect(input.units).toHaveLength(1);
  const unit = input.units[0];
  expect(unit.plan.sample_unit).toEqual({ candidate: "login-page-auth-flow-v2", source_commit: commit, snapshot_id: snapshot, input_hash: inputHash });
  expect(unit.plan.planned).toHaveLength(18);
  expect(unit.entries).toHaveLength(18);
  expect(unit.decision_rule.active_condition).toBe("oracle-practice");
  expect(unit.decision_rule.controls).toEqual(["baseline", "irrelevant-practice"]);

  const result = interpretPracticeSummary(summary);
  expect(result.units).toHaveLength(1);
  expect(result.units[0].verdict).toBe("signal");
  expect(result.units[0].conditions["oracle-practice"].joint_pass).toBe(3);
  expect(result.units[0].conditions.baseline.joint_pass).toBe(1);
  expect(result.units[0].conditions["irrelevant-practice"].joint_pass).toBe(2);
  expect(result.overall).toBe("diagnostic-only");
});

test("unsupported schema version fails closed", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  summary.schema_version = "profile-diagnostic-summary/v2";
  expect(() => practiceToInterpretationInput(summary)).toThrow(/schema_version/);
});

test("unknown private field on an entry fails closed", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  entries[0].practice_text = "the login page must show the current user name";
  expect(() => practiceToInterpretationInput(summary)).toThrow(/unknown fields/);
});

test("trace with a disallowed key fails closed", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  (entries[0].trace as Record<string, unknown>).workspace_path = "C:/private/path";
  expect(() => practiceToInterpretationInput(summary)).toThrow(/not a redacted id\/hash field/);
});

test("identity drift inside a unit yields uncertain", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  entries[0].source_commit = "f".repeat(40);
  const result = interpretPracticeSummary(summary);
  expect(result.units[0].verdict).toBe("uncertain");
  expect(result.units[0].reasons).toContain("identity-drift");
});

test("missing attempt yields uncertain with a denominator gap", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  entries.pop();
  const result = interpretPracticeSummary(summary);
  expect(result.units[0].verdict).toBe("uncertain");
  expect(result.units[0].reasons.some((reason) => reason.startsWith("denominator-gap:"))).toBe(true);
});

test("indeterminate quality yields uncertain", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  entries[0].practice_observation = "indeterminate";
  entries[0].joint_pass = false;
  const result = interpretPracticeSummary(summary);
  expect(result.units[0].verdict).toBe("uncertain");
  expect(result.units[0].reasons).toContain("indeterminate-quality");
});

test("different input hashes are isolated into separate units", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const other = loginPageSummary({ baseline: 3, "oracle-practice": 2, "irrelevant-practice": 1 }, otherInputHash);
  const merged = {
    ...summary,
    entries: [...(summary.entries as unknown[]), ...(other.entries as unknown[])],
    plan: { ...(summary.plan as Record<string, unknown>), schedule: [...((summary.plan as Record<string, unknown>).schedule as unknown[]), ...((other.plan as Record<string, unknown>).schedule as unknown[])] },
  };
  const result = interpretPracticeSummary(merged);
  expect(result.units).toHaveLength(2);
  const first = result.units.find((u) => u.sample_unit.input_hash === inputHash)!;
  const second = result.units.find((u) => u.sample_unit.input_hash === otherInputHash)!;
  expect(first.verdict).toBe("signal");
  expect(second.verdict).toBe("diagnostic-only");
  expect(first.conditions["oracle-practice"].joint_pass).toBe(3);
  expect(second.conditions["oracle-practice"].joint_pass).toBe(2);
  expect(second.conditions.baseline.joint_pass).toBe(3);
});
test("execution-failed attempt yields uncertain", () => {
  const summary = loginPageSummary({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 2 });
  const entries = summary.entries as Array<Record<string, unknown>>;
  entries[0] = { ...entries[0], evaluation_status: "execution-failed", error: "Pi timed out", joint_pass: false };
  const result = interpretPracticeSummary(summary);
  expect(result.units[0].verdict).toBe("uncertain");
  expect(result.units[0].reasons).toContain("unhealthy-attempt");
});