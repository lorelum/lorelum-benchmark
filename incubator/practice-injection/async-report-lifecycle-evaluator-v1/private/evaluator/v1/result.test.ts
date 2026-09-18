import { describe, expect, test } from "bun:test";
import {
  assertEvaluatorResult,
  buildEvaluatorResult,
  CHECK_IDS,
  exitCodeForStatus,
  type EvaluatorCheckResult,
} from "./result";

describe("async report evaluator result contract", () => {
  test("all passing checks produce an ordered pass result", () => {
    const result = buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" })));
    expect(result.status).toBe("pass");
    expect(result.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
    expect(result.checks.every((check) => check.reason === undefined)).toBe(true);
  });

  test("indeterminate takes priority over semantic failure", () => {
    const checks: EvaluatorCheckResult[] = CHECK_IDS.map((id) => ({ id, status: "pass" }));
    checks[0] = { id: checks[0].id, status: "fail", reason: "semantic-failure" };
    checks[1] = { id: checks[1].id, status: "indeterminate", reason: "execution-failure" };
    const result = buildEvaluatorResult(checks);
    expect(result.status).toBe("indeterminate");
  });

  test("missing checks fail closed", () => {
    const result = buildEvaluatorResult([]);
    expect(result.status).toBe("indeterminate");
    expect(result.checks).toHaveLength(CHECK_IDS.length);
    expect(result.checks.every((check) => check.reason === "check-missing")).toBe(true);
  });

  test("rejects unexpected result fields and unstable reason shapes", () => {
    const result = buildEvaluatorResult(CHECK_IDS.map((id) => ({ id, status: "pass" })));
    expect(() => assertEvaluatorResult({ ...result, extra: true })).toThrow("unexpected fields");

    const missingReason = structuredClone(result);
    missingReason.checks[0] = { id: CHECK_IDS[0], status: "fail" };
    expect(() => assertEvaluatorResult(missingReason)).toThrow("must contain a reason");

    const unstableReason = structuredClone(result);
    unstableReason.checks[0] = { id: CHECK_IDS[0], status: "fail", reason: "Reason with spaces" };
    expect(() => assertEvaluatorResult(unstableReason)).toThrow("reason is invalid");
  });

  test("exit codes map to the three-state result", () => {
    expect(exitCodeForStatus("pass")).toBe(0);
    expect(exitCodeForStatus("fail")).toBe(1);
    expect(exitCodeForStatus("indeterminate")).toBe(2);
  });
});
