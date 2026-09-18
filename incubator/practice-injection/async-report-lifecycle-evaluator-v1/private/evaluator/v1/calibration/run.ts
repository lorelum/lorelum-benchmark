import { evaluateApp } from "../evaluate";
import { loadEvaluatorIdentity, type EvaluatorIdentity } from "../identity";
import { CHECK_IDS, type CheckId, type CheckStatus } from "../result";
import { materializeFixture } from "./materialize";

type Matrix = Record<CheckId, CheckStatus>;

function matrixFrom(result: Awaited<ReturnType<typeof evaluateApp>>): Matrix {
  const matrix: Partial<Matrix> = {};
  for (const check of result.checks) matrix[check.id] = check.status;
  return matrix as Matrix;
}

function expectedMatrix(identity: EvaluatorIdentity, fixture: string): Matrix {
  const expected = identity.oracle.fixtures[fixture];
  if (!expected) throw new Error(`Missing oracle fixture: ${fixture}`);
  return expected;
}

function matrixMatches(actual: Matrix, expected: Matrix): boolean {
  return CHECK_IDS.every((id) => actual[id] === expected[id]);
}

const identity = await loadEvaluatorIdentity();
const fixtureIds = [
  "public-starter",
  "reference",
  "equivalent",
  ...CHECK_IDS.map((id) => `negative/${id}`),
];
const calibration = [];
for (const fixtureId of fixtureIds) {
  const fixture = await materializeFixture(identity, fixtureId);
  try {
    const result = await evaluateApp(fixture.appRoot, identity.root);
    const actual = matrixFrom(result);
    const expected = expectedMatrix(identity, fixtureId);
    calibration.push({
      fixture: fixtureId,
      expected,
      actual,
      passed: matrixMatches(actual, expected),
    });
  } finally {
    await fixture.dispose();
  }
}
const passed = calibration.every((entry) => entry.passed);
console.log(JSON.stringify({ calibration }));
process.exit(passed ? 0 : 1);
