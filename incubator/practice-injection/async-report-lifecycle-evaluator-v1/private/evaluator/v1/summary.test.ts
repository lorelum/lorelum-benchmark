import { describe, expect, test } from "bun:test";
import { buildEvaluatorResult, CHECK_IDS } from "./result";
import { judgeHardGateSummary } from "./summary";

describe("Judge hard-gate summary", () => {
  test("exposes only version, overall status, and check ids", () => {
    const result = buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" })));
    const summary = judgeHardGateSummary(result);
    expect(Object.keys(summary).sort()).toEqual(["check_ids", "evaluator_version", "overall_status"]);
    expect(summary.overall_status).toBe("pass");
    expect(summary.check_ids).toEqual([...CHECK_IDS]);
  });
});
