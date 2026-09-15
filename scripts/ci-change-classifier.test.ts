import { expect, test } from "bun:test";
import { classifyChangedPaths } from "./ci-change-classifier";

test("realistic calibration includes every evaluator and snapshot dependency", () => {
  const paths = [
    "src/benchmark/evaluate.ts",
    "src/benchmark/snapshot.ts",
    "src/benchmark/fs.ts",
    "src/benchmark/task-discovery.ts",
    "src/benchmark/evaluator/v2/harness.ts",
  ];
  for (const path of paths) expect(classifyChangedPaths([path]).realistic).toBe(true);
});

test("classifier changes run every path-gated validation", () => {
  expect(classifyChangedPaths(["scripts/ci-change-classifier.ts"])).toEqual({ runner: true, formal: true, realistic: true });
});

test("runner integration includes its harness and workflow orchestration", () => {
  expect(classifyChangedPaths(["scripts/run-runner-contracts.ts"]).runner).toBe(true);
  expect(classifyChangedPaths([".github/workflows/validate.yml"]).runner).toBe(true);
});

test("formal and realistic jobs remain off for unrelated documentation", () => {
  expect(classifyChangedPaths(["docs/README.md"])).toEqual({ runner: false, formal: false, realistic: false });
});
