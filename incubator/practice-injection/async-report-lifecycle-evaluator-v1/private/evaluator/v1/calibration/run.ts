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

function reasonsMatch(result: Awaited<ReturnType<typeof evaluateApp>>, identity: EvaluatorIdentity): boolean {
  return result.checks.every((check) => (
    check.status !== "fail" || check.reason === identity.oracle.checks[check.id].failure_reason
  ));
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
    const reasonMatches = reasonsMatch(result, identity);
    calibration.push({
      fixture: fixtureId,
      expected,
      actual,
      reason_matches: reasonMatches,
      passed: matrixMatches(actual, expected) && reasonMatches,
    });
  } finally {
    await fixture.dispose();
  }
}
const passed = calibration.every((entry) => entry.passed);
console.log(JSON.stringify({ calibration }));
process.exit(passed ? 0 : 1);
