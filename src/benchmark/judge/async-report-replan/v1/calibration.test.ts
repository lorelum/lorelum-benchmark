import { expect, test } from "bun:test";
import { calibrationScope, evaluateCalibrationMedians, loadCalibrationFixtures, resolveCalibrationStatus, runCalibration, verifyCalibrationSnapshot } from "./calibration";

test("mock calibration uses three repetitions per fixture and qualifies only at the declared gate", async () => {
  const result = await runCalibration({ mode: "mock", score: async (evidence) => {
    const points = evidence.blind_case_id.includes("ref") ? 80 : evidence.blind_case_id.includes("eq") ? 78 : 40;
    return { schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score: points, criteria: [{ id: "x", points: points, max_points: 100, rationale: "mock" }], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never;
  } });
  expect(result.status).toBe("qualified");
  expect(result.calls).toBe(9);
  expect(result.medians).toEqual({ reference: 80, equivalent: 78, "anti-pattern": 40 });
  expect(evaluateCalibrationMedians(result.medians).qualified).toBe(true);
});

test("calibration becomes diagnostic when the discrimination gate fails", () => {
  expect(evaluateCalibrationMedians({ reference: 70, equivalent: 70, "anti-pattern": 65 })).toEqual({ qualified: false, reason: "reference median is below the minimum" });
});

test("real calibration is not-run without explicit opt-in", async () => {
  const result = await runCalibration({ mode: "real", env: {}, score: async () => { throw new Error("must not call"); } });
  expect(result.status).toBe("not-run");
  expect(result.calls).toBe(0);
});

test("malformed calibration budgets are diagnostic before any fixture call", async () => {
  let calls = 0;
  const score = async () => { calls += 1; throw new Error("must not call"); };
  const fractional = await runCalibration({ mode: "mock", max_calls: 8.5, score });
  const nan = await runCalibration({ mode: "mock", max_calls: Number.NaN, score });
  expect(fractional.status).toBe("diagnostic");
  expect(nan.status).toBe("diagnostic");
  expect(calls).toBe(0);
});

test("calibration fixtures are private evidence with distinct observable structure", async () => {
  const fixtures = await loadCalibrationFixtures();
  expect(fixtures).toHaveLength(3);
  expect(fixtures[0].evidence.assistant_stages[1].text).not.toBe(fixtures[1].evidence.assistant_stages[1].text);
  expect(fixtures[2].evidence.tool_actions.length).toBeLessThan(fixtures[0].evidence.tool_actions.length);
});

test("private calibration snapshot verifies fixture and rubric hashes", async () => {
  expect(await verifyCalibrationSnapshot()).toBe(true);
});

test("qualified calibration is bound to the scoring provider model scope", async () => {
  const report = await runCalibration({ mode: "mock", score: async (evidence) => ({ schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "v1" }, state: "observed", score: evidence.blind_case_id.includes("ref") ? 80 : evidence.blind_case_id.includes("eq") ? 78 : 40, criteria: [], prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64), input_hash: "c".repeat(64), confidence: 90 } as never) });
  expect((await resolveCalibrationStatus(report, calibrationScope("different-model"))).status).toBe("diagnostic");
  expect((await resolveCalibrationStatus(report, calibrationScope("mock"))).status).toBe("qualified");
});
