import { expect, test } from "bun:test";
import { practiceCorpusReport, practiceCorpusReportMarkdown, practiceCorpusToInterpretationInput } from "./practice-corpus";
import type { CorpusManifest } from "./practice-corpus";

const commit = "50fdd8b939e5b4271888e1e1293dd23fd7e62540";
const snapUpdate = "7539b26c7f825db4ff485aa0868f2bbf8343d8cc6e9903f1b4d70b3b519a06cf";
const snapPdir = "239ca46eb7c4538421f920428001e059faff7384a984f35550d15d43ad3be5e8";
const hashUpdate = "cd6d58d9507a4fbe33e3d414cd1f9c5d600827857793223034bb4dcebd0ed570";
const hashPdir = "c32065a647e7b3a24ce174fe587efb447b2f6e7201907133cc59be7a528eed53";
const conditions = ["baseline", "oracle-practice", "irrelevant-practice"] as const;

type Overrides = Record<string, unknown>;

function scheduleFor(candidate: string, snap: string, hash: string, repeats: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (let block = 1; block <= repeats; block += 1) {
    conditions.forEach((condition, i) => out.push({ id: candidate, source_commit: commit, snapshot_id: snap, profile_input_hash: hash, block, planned_position: i + 1, condition }));
  }
  return out;
}

function entryFor(candidate: string, condition: string, repeat: number, snap: string, hash: string, overrides: Overrides = {}): Record<string, unknown> {
  return {
    candidate,
    condition,
    repeat,
    evaluation_status: "evaluated",
    trace: { condition_id: condition, channel: "condition-scoped-private-runtime", profile_input_hash: hash, practice_id: "practice", practice_version: "v1", practice_sha256: "a".repeat(64) },
    source_commit: commit,
    snapshot_id: snap,
    profile_input_hash: hash,
    semantic: "pass",
    practice_observation: "observed",
    joint_pass: true,
    block: repeat,
    planned_position: 1,
    actual_execution_position: repeat,
    ...overrides,
  };
}

function v3Summary(candidate: string, snap: string, hash: string, entries: Array<Record<string, unknown>>, repeats: number): Record<string, unknown> {
  return {
    schema_version: "profile-diagnostic-summary/v3",
    generated_at: "2026-08-08T00:00:00.000Z",
    plan: { id: candidate, schedule_seed: "seed", schedule_algorithm: "cyclic-latin-square/v1", repetitions: repeats, schedule: scheduleFor(candidate, snap, hash, repeats) },
    entries,
  };
}

/** Three-repeat summary; `passes` = joint-pass counts per condition; optional failedSlot. */
function threeRepeatSummary(candidate: string, snap: string, hash: string, passes: Record<string, number>, failedSlot?: { condition: string; repeat: number }): Record<string, unknown> {
  const entries: Array<Record<string, unknown>> = [];
  for (const condition of conditions) {
    for (let repeat = 1; repeat <= 3; repeat += 1) {
      const isFailed = failedSlot !== undefined && failedSlot.condition === condition && failedSlot.repeat === repeat;
      const pass = !isFailed && repeat <= (passes[condition] ?? 0);
      entries.push(entryFor(candidate, condition, repeat, snap, hash, isFailed
        ? { evaluation_status: "execution-failed", error: "Pi timed out", joint_pass: false }
        : pass ? {} : { semantic: "fail", practice_observation: "not-observed", joint_pass: false }));
    }
  }
  return v3Summary(candidate, snap, hash, entries, 3);
}

function oneRepeatSummary(candidate: string, snap: string, hash: string, oraclePass: boolean): Record<string, unknown> {
  const entries = [
    entryFor(candidate, "baseline", 1, snap, hash, { semantic: "fail", practice_observation: "not-observed", joint_pass: false }),
    entryFor(candidate, "irrelevant-practice", 1, snap, hash, { semantic: "fail", practice_observation: "not-observed", joint_pass: false }),
    entryFor(candidate, "oracle-practice", 1, snap, hash, oraclePass ? {} : { evaluation_status: "execution-failed", error: "Pi timed out", joint_pass: false }),
  ];
  return v3Summary(candidate, snap, hash, entries, 1);
}

function manifest(units: CorpusManifest["units"], extra: Overrides = {}): CorpusManifest {
  return {
    schema_version: "practice-diagnostic-corpus/v1",
    sources: { primary: "primary/summary.json", rerun: "rerun/summary.json", login: "login/summary.json" },
    units,
    historical: { label: "history-75", note: "#75 非-kernel 历史候选，不可比较。" },
    ...extra,
  } as CorpusManifest;
}

test("slot replacement fills a failed slot and yields signal without adding a denominator", () => {
  const primary = threeRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, { baseline: 0, "oracle-practice": 2, "irrelevant-practice": 0 }, { condition: "oracle-practice", repeat: 3 });
  const rerun = oneRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, true);
  const m = manifest([{ candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary", replacements: [{ condition_id: "oracle-practice", repeat: 3, source: "rerun" }] }]);

  const input = practiceCorpusToInterpretationInput(m, { primary, rerun });
  expect(input.units).toHaveLength(1);
  expect(input.units[0].plan.planned).toHaveLength(9);
  expect(input.units[0].entries).toHaveLength(9);
  expect(input.units[0].entries.every((e) => e.outcome.health === "evaluated")).toBe(true);

  const report = practiceCorpusReport(m, { primary, rerun });
  expect(report.units).toHaveLength(1);
  expect(report.units[0].verdict).toBe("signal");
  expect(report.units[0].conditions["oracle-practice"].joint_pass).toBe(3);
  expect(report.units[0].conditions["oracle-practice"].planned).toBe(3);
  expect(report.units[0].conditions.baseline.joint_pass).toBe(0);
  expect(report.aggregate.overall).toBe("diagnostic-only");
});

test("replacement targeting an already-evaluated slot fails closed", () => {
  const primary = threeRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, { baseline: 0, "oracle-practice": 3, "irrelevant-practice": 0 });
  const rerun = oneRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, true);
  const m = manifest([{ candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary", replacements: [{ condition_id: "oracle-practice", repeat: 1, source: "rerun" }] }]);
  expect(() => practiceCorpusReport(m, { primary, rerun })).toThrow(/already-evaluated slot/);
});

test("non-evaluated replacement entry fails closed", () => {
  const primary = threeRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, { baseline: 0, "oracle-practice": 2, "irrelevant-practice": 0 }, { condition: "oracle-practice", repeat: 3 });
  const rerun = oneRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, false);
  const m = manifest([{ candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary", replacements: [{ condition_id: "oracle-practice", repeat: 3, source: "rerun" }] }]);
  expect(() => practiceCorpusReport(m, { primary, rerun })).toThrow(/no evaluated entry/);
});

test("missing primary source fails closed", () => {
  const m = manifest([{ candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary" }]);
  expect(() => practiceCorpusReport(m, {})).toThrow(/missing primary source/);
});

test("unfilled failed slot yields uncertain", () => {
  const primary = threeRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, { baseline: 0, "oracle-practice": 2, "irrelevant-practice": 0 }, { condition: "oracle-practice", repeat: 3 });
  const m = manifest([{ candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary" }]);
  const report = practiceCorpusReport(m, { primary });
  expect(report.units[0].verdict).toBe("uncertain");
  expect(report.units[0].reasons).toContain("unhealthy-attempt");
  expect(report.aggregate.overall).toBe("uncertain");
});

test("multiple units stay isolated and aggregate is diagnostic-only", () => {
  const update = threeRepeatSummary("profile-update-command-boundary-v2", snapUpdate, hashUpdate, { baseline: 1, "oracle-practice": 3, "irrelevant-practice": 1 });
  const pdir = threeRepeatSummary("project-directory-resource-state-v2", snapPdir, hashPdir, { baseline: 0, "oracle-practice": 3, "irrelevant-practice": 0 });
  const m = manifest([
    { candidate: "profile-update-command-boundary-v2", profile_input_hash: hashUpdate, primary: "primary" },
    { candidate: "project-directory-resource-state-v2", profile_input_hash: hashPdir, primary: "primary" },
  ]);
  const report = practiceCorpusReport(m, { primary: { ...update, entries: [...(update.entries as unknown[]), ...(pdir.entries as unknown[])], plan: { ...(update.plan as Record<string, unknown>), schedule: [...(update.plan as Record<string, unknown>).schedule, ...(pdir.plan as Record<string, unknown>).schedule] } } });
  expect(report.units).toHaveLength(2);
  expect(report.units.map((u) => u.verdict)).toEqual(["signal", "signal"]);
  expect(report.aggregate.verdict_distribution).toEqual({ signal: 2, "diagnostic-only": 0, uncertain: 0 });
  expect(report.aggregate.overall).toBe("diagnostic-only");
});

test("indeterminate quality yields uncertain under the v1 gap set", () => {
  const primary = threeRepeatSummary("profile-update-command-boundary-v2", snapUpdate, hashUpdate, { baseline: 1, "oracle-practice": 3, "irrelevant-practice": 1 });
  const entries = primary.entries as Array<Record<string, unknown>>;
  entries[0] = { ...entries[0], practice_observation: "indeterminate", joint_pass: false };
  const m = manifest([{ candidate: "profile-update-command-boundary-v2", profile_input_hash: hashUpdate, primary: "primary" }]);
  const report = practiceCorpusReport(m, { primary });
  expect(report.units[0].verdict).toBe("uncertain");
  expect(report.units[0].reasons).toContain("indeterminate-quality");
});

test("markdown report is redacted, evidence-linked, and separates history", () => {
  const update = threeRepeatSummary("profile-update-command-boundary-v2", snapUpdate, hashUpdate, { baseline: 1, "oracle-practice": 3, "irrelevant-practice": 1 });
  const m = manifest([{ candidate: "profile-update-command-boundary-v2", profile_input_hash: hashUpdate, primary: "primary" }]);
  const report = practiceCorpusReport(m, { primary: update });
  const md = practiceCorpusReportMarkdown(report);
  expect(md).toContain("profile-update-command-boundary-v2");
  expect(md).toContain("source_commit=");
  expect(md).toContain("profile_input_hash=");
  expect(md).toContain("历史背景");
  expect(md).toContain("signal");
  expect(md).not.toMatch(/score|weight|C:\\\\|private|workspace_path/i);
});