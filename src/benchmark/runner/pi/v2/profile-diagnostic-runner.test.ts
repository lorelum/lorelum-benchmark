import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInjectionCalibration, resolvePracticePayload, redactedInjectionTrace } from "../../../kernel/profiles/injection-calibration/v1/runtime";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";
import { expansionDecisions, evaluatorResult, isRecord, parseHistoricalSummary, piArgs, replayHistoricalWorkspace, verifyCandidateDeclaration, verifySnapshotIdentity, writeHistoricalReplaySummary } from "./profile-diagnostic-runner";

const fixturePath = join(import.meta.dir, "..", "..", "..", "kernel", "fixtures", "neutral");

async function withFixture(mutator?: (path: string) => Promise<void>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "lorelum-profile-diagnostic-"));
  await cp(fixturePath, path, { recursive: true });
  const yaml = await Bun.file(join(path, "private/candidate.yaml")).text();
  const patched = yaml.replace("  public_root: public/starter\n", "  public_root: public/starter\n  source_commit: abc123\n");
  await Bun.write(join(path, "private/candidate.yaml"), patched);
  if (mutator) await mutator(path);
  return path;
}

const historicalHash = "a".repeat(64);
const historicalSnapshot = "b".repeat(64);
const evaluatorCommit = "c".repeat(40);

function legacyEntry(candidate: string, condition: "baseline" | "oracle-practice" | "irrelevant-practice", repeat = 1) {
  return {
    candidate,
    condition,
    repeat,
    status: "evaluation-failed",
    trace: {
      condition_id: condition,
      channel: condition === "baseline" ? "none" : "condition-scoped-private-runtime",
      profile_input_hash: historicalHash,
      ...(condition === "baseline" ? {} : { practice_id: "practice-card", practice_version: "v1", practice_sha256: "d".repeat(64) }),
    },
    source_commit: "e".repeat(40),
    snapshot_id: historicalSnapshot,
    profile_input_hash: historicalHash,
  };
}

async function withReplayFixture(evaluator: string): Promise<{ candidate: string; historyRoot: string; entry: ReturnType<typeof parseHistoricalSummary>[number]; cleanup: () => Promise<void> }> {
  const candidate = await withFixture();
  const candidateId = "neutral-contract-fixture-v1";
  await mkdir(join(candidate, "private", "evaluator"), { recursive: true });
  await writeFile(join(candidate, "private", "evaluator", "evaluate.ts"), evaluator);
  const historyRoot = await mkdtemp(join(tmpdir(), "lorelum-history-"));
  const app = join(historyRoot, candidateId, candidateId, "baseline", "attempt-1", "workspace", "app");
  await mkdir(app, { recursive: true });
  await writeFile(join(app, "candidate.txt"), "unchanged");
  const entry = parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [legacyEntry(candidateId, "baseline")] }, candidateId)[0];
  return { candidate, historyRoot, entry, cleanup: async () => { await rm(candidate, { force: true, recursive: true }); await rm(historyRoot, { force: true, recursive: true }); } };
}

test("baseline piArgs never includes --append-system-prompt", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  const baseline = await resolvePracticePayload(fixturePath, profile, "baseline");
  const args = piArgs("test-model", baseline);
  expect(baseline.practice).toBeUndefined();
  expect(args).not.toContain("--append-system-prompt");
  expect(args).toContain("--model");
  expect(args).toContain("test-model");
});

test("oracle and irrelevant piArgs include --append-system-prompt with card text", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  for (const conditionId of ["oracle-practice", "irrelevant-practice"] as InjectionConditionId[]) {
    const payload = await resolvePracticePayload(fixturePath, profile, conditionId);
    const args = piArgs("test-model", payload);
    const promptIndex = args.indexOf("--append-system-prompt");
    expect(promptIndex).toBeGreaterThan(-1);
    expect(args[promptIndex + 1]).toContain("Apply this Practice");
  }
});

test("redacted trace contains no Practice text or private paths", async () => {
  const profile = await resolveInjectionCalibration(fixturePath);
  const oracle = await resolvePracticePayload(fixturePath, profile, "oracle-practice");
  const trace = redactedInjectionTrace(profile, oracle);
  const serialized = JSON.stringify(trace);
  expect(serialized).not.toContain("Keep user interface state separate");
  expect(serialized).not.toContain("private/practices");
  expect(trace).toMatchObject({ condition_id: "oracle-practice", channel: "condition-scoped-private-runtime" });
  expect(trace.practice_id).toBeDefined();
  expect(trace.practice_sha256).toBeDefined();
});

test("verifyCandidateDeclaration accepts a valid profile v1 candidate", async () => {
  const path = await withFixture();
  try {
    const manifest = await verifyCandidateDeclaration(path);
    expect(manifest.kernel).toEqual({ core: "v1", profile: "injection-calibration/v1", materializer_kind: "react-vite" });
    expect(manifest.source.source_commit).toBe("abc123");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifyCandidateDeclaration rejects a non-injection-calibration candidate", async () => {
  const path = await withFixture(async (candidate) => {
    const yaml = await Bun.file(join(candidate, "private/candidate.yaml")).text();
    await Bun.write(join(candidate, "private/candidate.yaml"), yaml.replace("injection-calibration/v1", "treatment-comparison/v1"));
  });
  try {
    await expect(verifyCandidateDeclaration(path)).rejects.toThrow("does not declare core/v1 + injection-calibration/v1 + react-vite");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifySnapshotIdentity rejects a profile_input_hash mismatch", async () => {
  const path = await withFixture(async (candidate) => {
    await Bun.write(
      join(candidate, "private/snapshot.json"),
      JSON.stringify({ snapshot_id: "abc", resolved: { profile_input_hash: "deadbeef".repeat(8) } })
    );
  });
  try {
    const manifest = await verifyCandidateDeclaration(path);
    await expect(verifySnapshotIdentity(path, manifest)).rejects.toThrow("profile_input_hash mismatch");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("verifySnapshotIdentity rejects a missing profile_input_hash", async () => {
  const path = await withFixture(async (candidate) => {
    await Bun.write(join(candidate, "private/snapshot.json"), JSON.stringify({ snapshot_id: "abc" }));
  });
  try {
    const manifest = await verifyCandidateDeclaration(path);
    await expect(verifySnapshotIdentity(path, manifest)).rejects.toThrow("resolved.profile_input_hash");
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("evaluatorResult parses independent semantic and Practice observation results", () => {
  const result = evaluatorResult('{"semantic":"pass","practice_observation":"not-observed"}');
  expect(result).toEqual({ semantic: "pass", practice_observation: "not-observed" });
});

test("evaluatorResult preserves an indeterminate observation reason", () => {
  const result = evaluatorResult('{"semantic":"pass","practice_observation":"indeterminate","observation_reason":"unresolved-import"}');
  expect(result).toEqual({ semantic: "pass", practice_observation: "indeterminate", observation_reason: "unresolved-import" });
});

test("evaluatorResult accepts a valid semantic failure without an evaluator failure", () => {
  const result = evaluatorResult('{"semantic":"fail","practice_observation":"not-run"}');
  expect(result).toEqual({ semantic: "fail", practice_observation: "not-run" });
});

test("evaluatorResult rejects incomplete or unsupported observation output", () => {
  expect(evaluatorResult('{"semantic":"pass","practice_probe":"fail"}')).toBeUndefined();
  expect(evaluatorResult('{"semantic":"pass","practice_observation":"unknown"}')).toBeUndefined();
});

test("evaluatorResult returns undefined when no structured result is present", () => {
  expect(evaluatorResult("no JSON here")).toBeUndefined();
});

test("isRecord distinguishes objects from arrays and primitives", () => {
  expect(isRecord({})).toBe(true);
  expect(isRecord([])).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(isRecord("string")).toBe(false);
});

test("parses only redacted v1 history entries", () => {
  const candidate = "candidate-v1";
  const parsed = parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [legacyEntry(candidate, "oracle-practice")] }, candidate);
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toMatchObject({ candidate, condition: "oracle-practice", source_commit: "e".repeat(40), profile_input_hash: historicalHash });
  expect(() => parseHistoricalSummary({ schema_version: "profile-diagnostic-summary/v1", entries: [{ ...legacyEntry(candidate, "baseline"), trace: { path: "private/secret" } }] }, candidate)).toThrow("invalid-history-summary");
});

test("replays an existing workspace with a current evaluator despite historical identity differences", async () => {
  const fixture = await withReplayFixture('console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" }));');
  try {
    const replay = await replayHistoricalWorkspace(fixture.historyRoot, fixture.candidate, fixture.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "evaluated", semantic: "pass", practice_observation: "observed", joint_pass: true, evaluator_source_commit: evaluatorCommit, snapshot_id: historicalSnapshot, profile_input_hash: historicalHash });
  } finally {
    await fixture.cleanup();
  }
});

test("marks a missing workspace not executable without an evaluator invocation", async () => {
  const fixture = await withReplayFixture('throw new Error("evaluator should not execute");');
  try {
    await rm(join(fixture.historyRoot, "neutral-contract-fixture-v1", "neutral-contract-fixture-v1", "baseline", "attempt-1"), { force: true, recursive: true });
    const replay = await replayHistoricalWorkspace(fixture.historyRoot, fixture.candidate, fixture.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "not-executable", replay_reason: "missing-workspace" });
  } finally {
    await fixture.cleanup();
  }
});

test("records malformed evaluator output and workspace mutation without serializing logs", async () => {
  const malformed = await withReplayFixture('console.log("not a structured result");');
  try {
    const replay = await replayHistoricalWorkspace(malformed.historyRoot, malformed.candidate, malformed.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "invalid-output", replay_reason: "invalid-evaluator-output" });
  } finally {
    await malformed.cleanup();
  }

  const mutating = await withReplayFixture('await Bun.write(`${process.argv[2]}/changed.txt`, "changed"); console.log(JSON.stringify({ semantic: "pass", practice_observation: "observed" }));');
  try {
    const replay = await replayHistoricalWorkspace(mutating.historyRoot, mutating.candidate, mutating.entry, evaluatorCommit, 10_000);
    expect(replay).toMatchObject({ evaluation_status: "execution-failed", replay_reason: "workspace-modified-during-replay" });
  } finally {
    await mutating.cleanup();
  }
});

test("makes candidate-level expansion decisions and writes a redacted replay summary", async () => {
  const candidate = "candidate-v1";
  const entries = ([
    ["baseline", false], ["irrelevant-practice", false], ["oracle-practice", true],
  ] as const).map(([condition, jointPass]) => ({
    ...legacyEntry(candidate, condition),
    evaluator_source_commit: evaluatorCommit,
    evaluation_status: "evaluated" as const,
    semantic: "pass",
    practice_observation: jointPass ? "observed" as const : "not-observed" as const,
    joint_pass: jointPass,
  }));
  const eligible = expansionDecisions(entries);
  expect(eligible[0].status).toBe("eligible-for-expansion");
  expect(expansionDecisions([{ ...entries[0], evaluation_status: "not-executable" }])[0].status).toBe("indeterminate");
  expect(expansionDecisions(entries.map((entry) => ({ ...entry, joint_pass: false, practice_observation: "not-observed" as const })))[0].status).toBe("adjust-before-expansion");

  const output = await mkdtemp(join(tmpdir(), "lorelum-replay-summary-"));
  try {
    await writeHistoricalReplaySummary(output, entries, evaluatorCommit);
    const summary = await readFile(join(output, "summary.json"), "utf8");
    expect(summary).toContain("historical-evaluator-replay");
    expect(summary).toContain("eligible-for-expansion");
    expect(summary).not.toContain("private/");
    expect(summary).not.toContain(output);
  } finally {
    await rm(output, { force: true, recursive: true });
  }
});
