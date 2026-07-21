import { expect, test } from "bun:test";
import { evaluateV2 } from "./harness";
import { assertEvaluatorResultV2, evaluatorResultFromOutput } from "./result";

test("scores named deterministic quality probes after semantic success", async () => {
  const result = await evaluateV2(
    [{ id: "returns-correct-shape", run() {} }, { id: "preserves-errors", run() {} }],
    [{ id: "logical-start-order", maxPoints: 60, run: () => 45 }, { id: "call-count", maxPoints: 40, run: () => 40 }]
  );
  expect(result.semantic.passed).toBe(true);
  expect(result.quality.score).toBe(85);
  expect(result.quality.probes).toHaveLength(2);
});

test("returns zero quality without running probes after a semantic failure", async () => {
  let probeRan = false;
  const result = await evaluateV2(
    [{ id: "propagates-error", run: () => { throw new Error("original error was wrapped"); } }],
    [{ id: "logical-start-order", maxPoints: 100, run: () => { probeRan = true; return 100; } }]
  );
  expect(result.semantic).toEqual({ passed: false, checks: [{ id: "propagates-error", passed: false, failure_reason: "original error was wrapped" }] });
  expect(result.quality).toEqual({ score: 0, probes: [] });
  expect(probeRan).toBe(false);
});

test("rejects malformed or incomplete score results", () => {
  expect(() => assertEvaluatorResultV2({ schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: true, checks: [{ id: "shape", passed: true }] }, quality: { score: 100, probes: [{ id: "score", points: 100, max_points: 99 }] } })).toThrow("quality probe is invalid");
  expect(evaluatorResultFromOutput("runner output\n{\"schema_version\":\"other\"}\n")).toBeUndefined();
});

test("parses a structured result after runner output", () => {
  const output = [
    "Task snapshots are intact.",
    JSON.stringify({
      schema_version: "evaluator-result/v2",
      evaluator_version: 2,
      semantic: { passed: true, checks: [{ id: "returns-shape", passed: true }] },
      quality: { score: 100, probes: [{ id: "logical-start-order", points: 100, max_points: 100 }] }
    })
  ].join("\n");
  expect(evaluatorResultFromOutput(output)?.quality.score).toBe(100);
});
