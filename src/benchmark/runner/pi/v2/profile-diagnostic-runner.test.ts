import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInjectionCalibration, resolvePracticePayload, redactedInjectionTrace } from "../../../kernel/profiles/injection-calibration/v1/runtime";
import type { InjectionConditionId } from "../../../kernel/profiles/injection-calibration/v1/types";
import { piArgs, classifyEvaluatorResult, evaluatorResult, verifyCandidateDeclaration, verifySnapshotIdentity, isRecord } from "./profile-diagnostic-runner";

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

test("nonzero evaluator exit discards a structured partial result", () => {
  const result = classifyEvaluatorResult({
    code: 1,
    stdout: '{"semantic":"pass","practice_observation":"observed"}',
    stderr: "private/evaluator assertion failed",
    timedOut: false,
    durationMs: 1,
  });
  expect(result).toEqual({ evaluation_status: "execution-failed", error: "evaluator-exit-nonzero" });
  expect(result).not.toHaveProperty("semantic");
  expect(result).not.toHaveProperty("practice_observation");
  expect(result).not.toHaveProperty("joint_pass");
});

test("timed out evaluator discards output without leaking stderr", () => {
  const result = classifyEvaluatorResult({
    code: null,
    stdout: '{"semantic":"pass","practice_observation":"observed"}',
    stderr: "E:\\private\\evaluator\\oracle.yaml",
    timedOut: true,
    durationMs: 1,
  });
  expect(result).toEqual({ evaluation_status: "execution-failed", error: "evaluator-timed-out" });
  expect(JSON.stringify(result)).not.toContain("private");
});

test("zero-exit evaluator requires a complete structured result", () => {
  const result = classifyEvaluatorResult({ code: 0, stdout: "no JSON", stderr: "", timedOut: false, durationMs: 1 });
  expect(result).toEqual({ evaluation_status: "invalid-output", error: "evaluator-invalid-output" });
});

test("zero-exit semantic failure remains a healthy evaluator result", () => {
  const result = classifyEvaluatorResult({
    code: 0,
    stdout: '{"semantic":"fail","practice_observation":"not-run"}',
    stderr: "",
    timedOut: false,
    durationMs: 1,
  });
  expect(result).toEqual({
    evaluation_status: "evaluated",
    semantic: "fail",
    practice_observation: "not-run",
    joint_pass: false,
  });
});

test("isRecord distinguishes objects from arrays and primitives", () => {
  expect(isRecord({})).toBe(true);
  expect(isRecord([])).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(isRecord("string")).toBe(false);
});
