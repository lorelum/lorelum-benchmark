import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { evaluateV2 } from "./harness";
import { assertEvaluatorResultV2, evaluatorResultFromOutput } from "./result";

const evaluatorResultSchema = await Bun.file("schemas/evaluator-result-v2.schema.json").json();
const validateEvaluatorResult = new Ajv2020({ allErrors: true, strict: true }).compile(evaluatorResultSchema);

test("scores named deterministic quality probes after semantic success", async () => {
  const result = await evaluateV2(
    [{ id: "returns-correct-shape", run() {} }, { id: "preserves-errors", run() {} }],
    [{ id: "logical-start-order", maxPoints: 60, run: () => 45 }, { id: "call-count", maxPoints: 40, run: () => 40 }]
  );
  expect(result.semantic.passed).toBe(true);
  expect(result.quality.score).toBe(85);
  expect(result.quality.probes).toHaveLength(2);
  expect(validateEvaluatorResult(result)).toBe(true);
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
  expect(() => assertEvaluatorResultV2({ schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: true, checks: [{ id: "shape", passed: true, extra: true }] }, quality: { score: 100, probes: [{ id: "score", points: 100, max_points: 100 }] } })).toThrow("unexpected fields");
  expect(evaluatorResultFromOutput("runner output\n{\"schema_version\":\"other\"}\n")).toBeUndefined();
});

test("schema rejects semantic states that disagree with their checks", () => {
  const contradictory = {
    schema_version: "evaluator-result/v2",
    evaluator_version: 2,
    semantic: { passed: true, checks: [{ id: "behavior", passed: false, failure_reason: "failed" }] },
    quality: { score: 100, probes: [{ id: "score", points: 100, max_points: 100 }] }
  };
  expect(validateEvaluatorResult(contradictory)).toBe(false);
  expect(() => assertEvaluatorResultV2(contradictory)).toThrow("semantic pass status disagrees with checks");
});

test("schema enforces failure reasons and semantic quality gating", () => {
  const failedWithoutReason = {
    schema_version: "evaluator-result/v2",
    evaluator_version: 2,
    semantic: { passed: false, checks: [{ id: "behavior", passed: false }] },
    quality: { score: 0, probes: [] }
  };
  const passedWithoutProbes = {
    schema_version: "evaluator-result/v2",
    evaluator_version: 2,
    semantic: { passed: true, checks: [{ id: "behavior", passed: true }] },
    quality: { score: 0, probes: [] }
  };
  expect(validateEvaluatorResult(failedWithoutReason)).toBe(false);
  expect(validateEvaluatorResult(passedWithoutProbes)).toBe(false);
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
