import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { assertJudgeResultV1, deriveJointPass, summarizeOutcomes, type OutcomeEntry } from "./contract";

const judgeSchema = await Bun.file("schemas/judge-result-v1.schema.json").json();
const validateJudgeResult = new Ajv2020({ allErrors: true, strict: true }).compile(judgeSchema);

function judge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "judge-result/v1",
    judge_version: 1,
    state: "observed",
    score: 80,
    criteria: [{ id: "layering", points: 50, max_points: 60 }, { id: "error-boundary", points: 30, max_points: 40 }],
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

test("rejects hidden weighted totals and score disagreement", () => {
  const weighted = judge({ weighted_total: 80 });
  expect(validateJudgeResult(weighted)).toBe(false);
  expect(() => assertJudgeResultV1(weighted)).toThrow("unexpected fields");
  const mismatch = judge({ score: 70 });
  expect(validateJudgeResult(mismatch)).toBe(true);
  expect(() => assertJudgeResultV1(mismatch)).toThrow("score disagrees with criterion points");
});

test("rejects duplicate criteria and non-100 max points for observed", () => {
  const duplicate = judge({ criteria: [{ id: "layering", points: 40, max_points: 50 }, { id: "layering", points: 40, max_points: 50 }] });
  expect(() => assertJudgeResultV1(duplicate)).toThrow("duplicate quality criterion");
  const badTotal = judge({ criteria: [{ id: "layering", points: 80, max_points: 99 }] });
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
