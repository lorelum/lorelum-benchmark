import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { assertJudgeResultV1, deriveJointPass, summarizeOutcomes, type OutcomeEntry } from "./contract";

const judgeSchema = await Bun.file("schemas/judge-result-v1.schema.json").json();
const validateJudgeResult = new Ajv2020({ allErrors: true, strict: true }).compile(judgeSchema);

function judge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "judge-result/v1",
    judge_version: 1,
    judge: { id: "mock-judge", version: "0.1.0" },
    state: "observed",
    score: 80,
    criteria: [{ id: "layering", points: 50, max_points: 60, rationale: "boundary module owns transport" }, { id: "error-boundary", points: 30, max_points: 40, rationale: "domain errors translated at boundary" }],
    prompt_hash: "a".repeat(64),
    rubric_hash: "b".repeat(64),
    input_hash: "c".repeat(64),
    confidence: 90,
    ...overrides
  };
}

test("observed judge result validates against the sidecar schema", () => {
  const result = judge();
  expect(validateJudgeResult(result)).toBe(true);
  expect(assertJudgeResultV1(result).score).toBe(80);
});

test("judge-unavailable is distinct from not-observed and requires a reason", () => {
  const unavailable = { ...judge({ state: "judge-unavailable", score: 0, criteria: [], reason: "provider timeout" }) };
  const notObserved = { ...judge({ state: "not-observed", score: 0, criteria: [] }) };
  expect(validateJudgeResult(unavailable)).toBe(true);
  expect(validateJudgeResult(notObserved)).toBe(true);
  expect(assertJudgeResultV1(unavailable).state).toBe("judge-unavailable");
  expect(assertJudgeResultV1(notObserved).state).toBe("not-observed");
  expect(() => assertJudgeResultV1({ ...judge({ state: "judge-unavailable", score: 0, criteria: [] }) })).toThrow("requires an audit reason");
});

test("indeterminate quality requires an audit reason", () => {
  const indeterminate = { ...judge({ state: "indeterminate", score: 0, criteria: [], reason: "unresolvable import graph" }) };
  expect(validateJudgeResult(indeterminate)).toBe(true);
  expect(assertJudgeResultV1(indeterminate).state).toBe("indeterminate");
  expect(() => assertJudgeResultV1({ ...judge({ state: "indeterminate", score: 0, criteria: [] }) })).toThrow("requires an audit reason");
});

test("non-observed states must score zero without criteria", () => {
  for (const state of ["not-observed", "indeterminate", "not-run", "judge-unavailable"]) {
    const base = judge({ state, score: 0, criteria: [] });
    const valid = state === "indeterminate" || state === "judge-unavailable" ? { ...base, reason: "audit" } : base;
    expect(validateJudgeResult(valid)).toBe(true);
    const invalid = judge({ state, score: 50, criteria: [{ id: "x", points: 50, max_points: 100 }] });
    expect(validateJudgeResult(invalid)).toBe(false);
  }
  expect(() => assertJudgeResultV1(judge({ state: "not-run", score: 10, criteria: [] }))).toThrow("must score zero without criteria");
});

test("observed criteria require a non-empty rationale", () => {
  const withoutRationale = judge({ criteria: [{ id: "layering", points: 50, max_points: 60 }, { id: "error-boundary", points: 30, max_points: 40 }] });
  expect(validateJudgeResult(withoutRationale)).toBe(false);
  expect(() => assertJudgeResultV1(withoutRationale)).toThrow("criterion rationale is required");
  expect(() => assertJudgeResultV1(judge({ criteria: [{ id: "layering", points: 50, max_points: 60, rationale: "" }, { id: "error-boundary", points: 30, max_points: 40, rationale: "ok" }] }))).toThrow("criterion rationale is required");
});
test("requires provenance identity and hashes", () => {
  expect(() => assertJudgeResultV1({ ...judge(), judge: { id: "mock-judge" } })).toThrow("judge identity is invalid");
  expect(() => assertJudgeResultV1({ ...judge(), prompt_hash: "not-a-hash" })).toThrow("provenance hash is missing or invalid");
  expect(() => assertJudgeResultV1({ ...judge(), rubric_hash: undefined })).toThrow("provenance hash is missing or invalid");
  expect(() => assertJudgeResultV1({ ...judge(), input_hash: "x".repeat(64) })).toThrow("provenance hash is missing or invalid");
  expect(() => assertJudgeResultV1({ ...judge(), confidence: 101 })).toThrow("confidence is invalid");
  expect(validateJudgeResult(judge())).toBe(true);
});

test("preserves criterion rationale when present", () => {
  const withRationale = judge({ criteria: [{ id: "layering", points: 50, max_points: 60, rationale: "boundary module owns transport" }, { id: "error-boundary", points: 30, max_points: 40, rationale: "domain errors translated at boundary" }] });
  expect(validateJudgeResult(withRationale)).toBe(true);
  expect(assertJudgeResultV1(withRationale).criteria[0].rationale).toBe("boundary module owns transport");
  expect(() => assertJudgeResultV1(judge({ criteria: [{ id: "layering", points: 50, max_points: 60, rationale: "" }] }))).toThrow("criterion rationale is required");
});
test("schema rejects observed results that carry a reason", () => {
  const observedWithReason = judge({ reason: "audit" });
  expect(validateJudgeResult(observedWithReason)).toBe(false);
  expect(() => assertJudgeResultV1(observedWithReason)).toThrow("observed quality must not carry a reason");
});
test("rejects hidden weighted totals and score disagreement", () => {
  const weighted = judge({ weighted_total: 80 });
  expect(validateJudgeResult(weighted)).toBe(false);
  expect(() => assertJudgeResultV1(weighted)).toThrow("unexpected fields");
  const mismatch = judge({ score: 70 });
  expect(validateJudgeResult(mismatch)).toBe(true);
  expect(() => assertJudgeResultV1(mismatch)).toThrow("score disagrees with criterion points");
});

test("rejects duplicate criteria and non-100 max points for observed", () => {
  const duplicate = judge({ criteria: [{ id: "layering", points: 40, max_points: 50, rationale: "a" }, { id: "layering", points: 40, max_points: 50, rationale: "b" }] });
  expect(() => assertJudgeResultV1(duplicate)).toThrow("duplicate quality criterion");
  const badTotal = judge({ criteria: [{ id: "layering", points: 80, max_points: 99, rationale: "a" }] });
  expect(() => assertJudgeResultV1(badTotal)).toThrow("must total 100");
});

test("joint_pass derives only from semantic pass and observed quality", () => {
  expect(deriveJointPass("pass", "observed")).toBe(true);
  expect(deriveJointPass("pass", "judge-unavailable")).toBe(false);
  expect(deriveJointPass("pass", "not-observed")).toBe(false);
  expect(deriveJointPass("pass", "indeterminate")).toBe(false);
  expect(deriveJointPass("fail", "observed")).toBe(false);
  expect(deriveJointPass(undefined, "observed")).toBe(false);
});

test("summary keeps non-healthy and indeterminate attempts in the planned denominator", () => {
  const entries: OutcomeEntry[] = [
    { health: "evaluated", semantic: "pass", quality: "observed" },
    { health: "evaluated", semantic: "pass", quality: "not-observed" },
    { health: "execution-failed" },
    { health: "indeterminate" },
    { health: "not-executable" }
  ];
  const summary = summarizeOutcomes(entries);
  expect(summary.planned).toBe(5);
  expect(summary.evaluated).toBe(2);
  expect(summary.health).toMatchObject({ evaluated: 2, "execution-failed": 1, indeterminate: 1, "not-executable": 1, "invalid-output": 0 });
  expect(summary.semantic).toMatchObject({ pass: 2, fail: 0, "not-run": 0 });
  expect(summary.quality).toMatchObject({ observed: 1, "not-observed": 1, "judge-unavailable": 0, indeterminate: 0, "not-run": 0 });
  expect(summary.joint_pass).toBe(1);
  expect(Object.keys(summary).sort()).toEqual(["evaluated", "health", "joint_pass", "planned", "quality", "semantic"]);
});

test("judge-unavailable never enters a pass or observation numerator", () => {
  const entries: OutcomeEntry[] = [
    { health: "evaluated", semantic: "pass", quality: "judge-unavailable" },
    { health: "evaluated", semantic: "pass", quality: "not-observed" }
  ];
  const summary = summarizeOutcomes(entries);
  expect(summary.quality.observed).toBe(0);
  expect(summary.quality["judge-unavailable"]).toBe(1);
  expect(summary.joint_pass).toBe(0);
});
