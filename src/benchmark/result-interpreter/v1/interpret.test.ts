import { expect, test } from "bun:test";
import { interpret } from "./interpret";
import type { AttemptEntry, DecisionRule, InterpretationInput, SampleUnit, UnitPlan } from "./types";

const commit = "a".repeat(40);
const snapshot = "b".repeat(64);
const inputHash = "c".repeat(64);
const otherInputHash = "d".repeat(64);

const practiceRule: DecisionRule = {
  metric: "joint-pass-count",
  active_condition: "oracle-practice",
  controls: ["baseline", "irrelevant-practice"],
  relation: "strictly-greater-than-each-control",
  otherwise: "diagnostic-only",
};

const skillRule: DecisionRule = {
  metric: "joint-pass-count",
  active_condition: "skill",
  controls: ["baseline"],
  relation: "strictly-greater-than-each-control",
  otherwise: "diagnostic-only",
};

const unit = (overrides: Partial<SampleUnit> = {}): SampleUnit => ({
  candidate: "login-page",
  source_commit: commit,
  snapshot_id: snapshot,
  input_hash: inputHash,
  ...overrides,
});

function practicePlan(overrides: Partial<SampleUnit> = {}): UnitPlan {
  const conditions = ["baseline", "oracle-practice", "irrelevant-practice"];
  return {
    sample_unit: unit(overrides),
    planned: conditions.flatMap((condition_id) => [1, 2, 3].map((repeat) => ({ condition_id, repeat }))),
  };
}

function skillPlan(): UnitPlan {
  return {
    sample_unit: unit({ candidate: "nextjs-perf" }),
    planned: ["baseline", "skill"].flatMap((condition_id) => [1, 2].map((repeat) => ({ condition_id, repeat }))),
  };
}

function entry(condition_id: string, repeat: number, overrides: Partial<AttemptEntry> = {}): AttemptEntry {
  return {
    sample_unit: unit(),
    condition_id,
    repeat,
    outcome: { health: "evaluated", semantic: "pass", quality: "observed" },
    trace: { channel: "condition-scoped-private-runtime", practice_id: "login-card", practice_sha256: "e".repeat(64) },
    ...overrides,
  };
}

/** Builds 3 repeats per condition; the first `jointPassCount` repeats of each condition pass. */
function practiceEntries(counts: Record<string, number>, sampleUnit: SampleUnit = unit()): AttemptEntry[] {
  const entries: AttemptEntry[] = [];
  for (const [condition_id, jointPassCount] of Object.entries(counts)) {
    for (let repeat = 1; repeat <= 3; repeat += 1) {
      const pass = repeat <= jointPassCount;
      entries.push(
        entry(condition_id, repeat, pass
          ? { sample_unit: sampleUnit }
          : { sample_unit: sampleUnit, outcome: { health: "evaluated", semantic: "fail", quality: "not-observed" } }),
      );
    }
  }
  return entries;
}

function input(rule: DecisionRule, units: Array<{ plan: UnitPlan; entries: AttemptEntry[] }>): InterpretationInput {
  return { units: units.map((u) => ({ ...u, decision_rule: rule })) };
}

test("practice-like and skill-like units flow through the same core with their own rules and both signal on strict lead", () => {
  const summary = interpret({
    units: [
      {
        plan: practicePlan(),
        entries: practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 }),
        decision_rule: practiceRule,
      },
      {
        plan: skillPlan(),
        decision_rule: skillRule,
        entries: [
          entry("skill", 1, { sample_unit: unit({ candidate: "nextjs-perf" }), trace: { channel: "pi-skill", skill_id: "vercel-skill", skill_sha256: "e".repeat(64) } }),
          entry("skill", 2, { sample_unit: unit({ candidate: "nextjs-perf" }), trace: { channel: "pi-skill", skill_id: "vercel-skill", skill_sha256: "e".repeat(64) } }),
          entry("baseline", 1, { sample_unit: unit({ candidate: "nextjs-perf" }), outcome: { health: "evaluated", semantic: "fail", quality: "not-observed" }, trace: { channel: "none" } }),
          entry("baseline", 2, { sample_unit: unit({ candidate: "nextjs-perf" }), outcome: { health: "evaluated", semantic: "fail", quality: "not-observed" }, trace: { channel: "none" } }),
        ],
      },
    ],
  });
  expect(summary.schema_version).toBe("result-interpreter-summary/v1");
  expect(summary.units).toHaveLength(2);
  expect(summary.units.map((u) => u.verdict)).toEqual(["signal", "signal"]);
  expect(summary.units[0].conditions["oracle-practice"].joint_pass).toBe(3);
  expect(summary.units[1].conditions["skill"].joint_pass).toBe(2);
  expect(summary.units[1].conditions.baseline.joint_pass).toBe(0);
  expect(summary.overall).toBe("diagnostic-only");
});

test("equal or lower control counts stay diagnostic-only", () => {
  const summary = interpret(input(practiceRule, [
    { plan: practicePlan(), entries: practiceEntries({ baseline: 2, "oracle-practice": 2, "irrelevant-practice": 0 }) },
  ]));
  expect(summary.units[0].verdict).toBe("diagnostic-only");
  expect(summary.units[0].conditions["oracle-practice"].joint_pass).toBe(2);
  expect(summary.units[0].conditions.baseline.joint_pass).toBe(2);
});

test("different input hashes are never combined into one denominator", () => {
  const summary = interpret(input(practiceRule, [
    { plan: practicePlan(), entries: practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 }) },
    { plan: practicePlan({ input_hash: otherInputHash }), entries: practiceEntries({ baseline: 3, "oracle-practice": 2, "irrelevant-practice": 1 }, unit({ input_hash: otherInputHash })) },
  ]));
  expect(summary.units).toHaveLength(2);
  expect(summary.units[0].verdict).toBe("signal");
  expect(summary.units[1].verdict).toBe("diagnostic-only");
  expect(summary.cross_unit.verdict_distribution).toEqual({ signal: 1, "diagnostic-only": 1, uncertain: 0 });
  expect(summary.units[1].conditions["oracle-practice"].joint_pass).toBe(2);
  expect(summary.units[1].conditions.baseline.joint_pass).toBe(3);
});

test("identity drift inside a unit is uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], sample_unit: unit({ source_commit: "f".repeat(40) }) };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("identity-drift");
});

test("missing planned attempts are uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  const withoutLast = entries.filter((item) => !(item.condition_id === "irrelevant-practice" && item.repeat === 3));
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries: withoutLast }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons.some((reason) => reason.startsWith("denominator-gap:"))).toBe(true);
});

test("duplicate attempts are uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries.push(entry("baseline", 1));
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons.some((reason) => reason.startsWith("duplicate-attempt:"))).toBe(true);
});

test("non-evaluated attempts are uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], outcome: { health: "execution-failed" } };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("unhealthy-attempt");
});

test("indeterminate quality is uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], outcome: { health: "evaluated", semantic: "pass", quality: "indeterminate" } };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("indeterminate-quality");
});

test("private or free-text trace content is rejected fail-closed", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], trace: { channel: "condition-scoped-private-runtime", text: "the login page must show the current user name" } };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("redaction-failed");
});

test("path-like trace values are rejected", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], trace: { channel: "condition-scoped-private-runtime", practice_path: "private/practices/login-card.md" } };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("redaction-failed");
});

test("summary preserves evidence, raw counts, and diagnostic-only cross-unit output", () => {
  const summary = interpret(input(practiceRule, [
    { plan: practicePlan(), entries: practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 }) },
    { plan: practicePlan({ input_hash: otherInputHash }), entries: practiceEntries({ baseline: 2, "oracle-practice": 2, "irrelevant-practice": 1 }, unit({ input_hash: otherInputHash })) },
  ]));
  const first = summary.units[0];
  expect(first.sample_unit).toEqual({ candidate: "login-page", source_commit: commit, snapshot_id: snapshot, input_hash: inputHash });
  const oracle = first.conditions["oracle-practice"];
  expect(oracle.planned).toBe(3);
  expect(oracle.evaluated).toBe(3);
  expect(oracle.joint_pass).toBe(3);
  expect(oracle.semantic.pass).toBe(3);
  expect(oracle.quality.observed).toBe(3);
  expect(first.conditions.baseline.joint_pass).toBe(1);
  expect(first.conditions["irrelevant-practice"].joint_pass).toBe(0);
  expect(summary.cross_unit.verdict_distribution).toEqual({ signal: 1, "diagnostic-only": 1, uncertain: 0 });
  expect(summary.cross_unit.execution_gaps).toEqual([]);
  expect(summary.overall).toBe("diagnostic-only");
  expect(JSON.stringify(summary)).not.toMatch(/"(score|weight)"/);
});

test("uncertain units surface as execution gaps and flip overall to uncertain", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], outcome: { health: "execution-failed" } };
  const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.cross_unit.execution_gaps).toHaveLength(1);
  expect(summary.cross_unit.execution_gaps[0]).toContain("login-page/");
  expect(summary.overall).toBe("uncertain");
});

test("malformed contract input fails closed", () => {
  expect(() => interpret({ units: [{ plan: practicePlan(), entries: [], decision_rule: { ...practiceRule, controls: [] } }] })).toThrow(/controls/);
  expect(() => interpret({ units: [] })).toThrow(/non-empty array/);
  const plan = practicePlan();
  plan.planned = [...plan.planned, { condition_id: "baseline", repeat: 1 }];
  expect(() => interpret({ units: [{ plan, entries: [], decision_rule: practiceRule }] })).toThrow(/duplicate/);
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  entries[0] = { ...entries[0], outcome: { health: "mystery" } as AttemptEntry["outcome"] };
  expect(() => interpret({ units: [{ plan: practicePlan(), entries, decision_rule: practiceRule }] })).toThrow(/outcome\.health/);
});

test("duplicate units are rejected", () => {
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  expect(() => interpret({
    units: [
      { plan: practicePlan(), entries, decision_rule: practiceRule },
      { plan: practicePlan(), entries, decision_rule: practiceRule },
    ],
  })).toThrow(/duplicate unit/);
});
test("unknown private fields on entry, sample_unit, or outcome are rejected fail-closed", () => {
  const badEntries: Array<Record<string, unknown>> = [
    { ...entry("baseline", 1), practice_text: "the login page must show the current user name" },
    { ...entry("baseline", 1), sample_unit: { ...unit(), private_path: "private/practices/login-card.md" } },
    { ...entry("baseline", 1), outcome: { health: "evaluated", semantic: "pass", quality: "observed", raw_body: "..." } },
  ];
  for (const bad of badEntries) {
    const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
    entries[0] = bad as unknown as AttemptEntry;
    const summary = interpret(input(practiceRule, [{ plan: practicePlan(), entries }]));
    expect(summary.units[0].verdict).toBe("uncertain");
    expect(summary.units[0].reasons).toContain("redaction-failed");
  }
});

test("unknown private fields on the plan are rejected fail-closed", () => {
  const plan = practicePlan() as unknown as Record<string, unknown>;
  plan.workspace_path = "C:/private/path";
  const entries = practiceEntries({ baseline: 1, "oracle-practice": 3, "irrelevant-practice": 0 });
  const summary = interpret(input(practiceRule, [{ plan: plan as unknown as UnitPlan, entries }]));
  expect(summary.units[0].verdict).toBe("uncertain");
  expect(summary.units[0].reasons).toContain("redaction-failed");
});