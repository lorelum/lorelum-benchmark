import type { JudgeResultV1 } from "../../../../outcome/v1/contract";
import type { DimensionId, DimensionLabel } from "./structure-facts";
import type { BlindedPairwiseVerdict, PairwiseSide } from "./pairwise";
import { evaluateBlindedPairwiseVerdict } from "./pairwise";

export type CalibrationSample = {
  state: JudgeResultV1["state"];
  score: number;
  criteria: JudgeResultV1["criteria"];
  confidence: number;
  dimension_labels?: Record<DimensionId, DimensionLabel>;
  facts?: unknown;
  reason?: string;
};

export type CalibrationFixtureResult = {
  state: "observed" | "indeterminate" | "mixed";
  score: number | null;
  sample_states: CalibrationSample["state"][];
  samples: CalibrationSample[];
  rubric_hash: string;
  input_hash: string;
  tree_hash: string;
  reason?: string;
};

export const expectedDimensionLabels: Record<string, Record<DimensionId, DimensionLabel>> = {
  reference: fullLabels(),
  equivalent: fullLabels(),
  "anti-pattern": {
    ...fullLabels(),
    "adapter-isolation": "zero",
    "policy-centralization": "zero",
  },
  "docs-present": {
    ...fullLabels(),
    "adapter-isolation": "zero",
    "policy-centralization": "zero",
  },
  "baseline-policy-scatter": {
    ...fullLabels(),
    "policy-centralization": "partial",
    "single-billing-atomicity": "partial",
    "streaming-accounting": "partial",
  },
  "public-starter": {
    "contract-normalization": "zero",
    "adapter-isolation": "zero",
    "policy-centralization": "zero",
    "single-billing-atomicity": "zero",
    "streaming-accounting": "zero",
    "query-and-error-contract": "zero",
  },
};

function fullLabels(): Record<DimensionId, DimensionLabel> {
  return {
    "contract-normalization": "full",
    "adapter-isolation": "full",
    "policy-centralization": "full",
    "single-billing-atomicity": "full",
    "streaming-accounting": "full",
    "query-and-error-contract": "full",
  };
}

export const calibrationDimensions: DimensionId[] = [
  "contract-normalization",
  "adapter-isolation",
  "policy-centralization",
  "single-billing-atomicity",
  "streaming-accounting",
  "query-and-error-contract",
];
const dimensionLabels: DimensionLabel[] = ["full", "partial", "zero"];

export type DimensionConfusionMatrix = Record<DimensionId, Record<DimensionLabel, Record<DimensionLabel, number>>>;
export type DimensionLabelCheck = { fixture: string; dimension: DimensionId; expected: DimensionLabel; predicted?: DimensionLabel; correct: boolean };

export function emptyDimensionConfusion(): DimensionConfusionMatrix {
  return Object.fromEntries(calibrationDimensions.map((dimension) => [
    dimension,
    Object.fromEntries(dimensionLabels.map((expected) => [
      expected,
      Object.fromEntries(dimensionLabels.map((predicted) => [predicted, 0])),
    ])),
  ])) as DimensionConfusionMatrix;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function aggregateCalibrationSamples(input: {
  samples: CalibrationSample[];
  rubricHash: string;
  inputHash: string;
  treeHash: string;
}): CalibrationFixtureResult {
  const states = input.samples.map((sample) => sample.state);
  const observedScores = input.samples.filter((sample) => sample.state === "observed").map((sample) => sample.score);
  const state: CalibrationFixtureResult["state"] = states.every((value) => value === "observed")
    ? "observed"
    : observedScores.length > 0
      ? "mixed"
      : "indeterminate";
  const lastReason = [...input.samples].reverse().find((sample) => sample.reason)?.reason;
  return {
    state,
    score: observedScores.length ? median(observedScores) : null,
    sample_states: states,
    samples: input.samples,
    rubric_hash: input.rubricHash,
    input_hash: input.inputHash,
    tree_hash: input.treeHash,
    ...(state !== "observed" && lastReason ? { reason: lastReason } : {}),
  };
}

export function dimensionLabelChecks(input: { results: Record<string, CalibrationFixtureResult>; fixtures?: string[] }): DimensionLabelCheck[] {
  const fixtures = input.fixtures ?? Object.keys(expectedDimensionLabels);
  const checks: DimensionLabelCheck[] = [];
  for (const fixture of fixtures) {
    const expected = expectedDimensionLabels[fixture];
    const samples = input.results[fixture]?.samples ?? [];
    for (const dimension of calibrationDimensions) {
      const predicted = samples.length > 0 && samples.every((sample) => sample.dimension_labels?.[dimension] === samples[0]?.dimension_labels?.[dimension])
        ? samples[0]!.dimension_labels?.[dimension]
        : undefined;
      checks.push({
        fixture,
        dimension,
        expected: expected[dimension],
        ...(predicted ? { predicted } : {}),
        correct: samples.length > 0 && samples.every((sample) => sample.dimension_labels?.[dimension] === expected[dimension]),
      });
    }
  }
  return checks;
}

export function dimensionConfusion(input: { results: Record<string, CalibrationFixtureResult>; fixtures?: string[] }): DimensionConfusionMatrix {
  const matrix = emptyDimensionConfusion();
  const fixtures = input.fixtures ?? Object.keys(expectedDimensionLabels);
  for (const fixture of fixtures) {
    const expected = expectedDimensionLabels[fixture];
    for (const sample of input.results[fixture]?.samples ?? []) {
      for (const dimension of calibrationDimensions) {
        const predicted = sample.dimension_labels?.[dimension];
        if (predicted === "full" || predicted === "partial" || predicted === "zero") {
          matrix[dimension][expected[dimension]][predicted] += 1;
        }
      }
    }
  }
  return matrix;
}

export type CalibrationThresholds = {
  referenceMin: number;
  equivalentTolerance: number;
  antiPatternMax: number;
  antiPatternGap: number;
  docsPresentMax: number;
  docsPresentGap: number;
};

export type PairwiseEvaluationInput = { verdict: BlindedPairwiseVerdict; positiveSide: PairwiseSide };

export function practiceAwareStructureCalibrationChecks(input: {
  results: Record<string, CalibrationFixtureResult>;
  rubricHash: string;
  thresholds: CalibrationThresholds;
  pairwise?: PairwiseEvaluationInput[];
}) {
  const reference = input.results.reference;
  const equivalent = input.results.equivalent;
  const antiPattern = input.results["anti-pattern"];
  const docsPresent = input.results["docs-present"];
  const baseline = input.results["baseline-policy-scatter"];
  const referenceScore = reference?.state === "observed" ? reference.score : null;
  const labels = dimensionLabelChecks({ results: input.results });
  const pairwise = input.pairwise?.map((item) => evaluateBlindedPairwiseVerdict(item.verdict, item.positiveSide)) ?? [];
  return {
    reference_high: referenceScore !== null && referenceScore >= input.thresholds.referenceMin,
    equivalent_high: equivalent?.state === "observed" && equivalent.score !== null && equivalent.score >= input.thresholds.referenceMin,
    equivalent_close: equivalent?.state === "observed" && referenceScore !== null && equivalent.score !== null && Math.abs(equivalent.score - referenceScore) <= input.thresholds.equivalentTolerance,
    anti_pattern_separated: antiPattern?.state === "observed" && antiPattern.score !== null && referenceScore !== null && antiPattern.score <= input.thresholds.antiPatternMax && referenceScore - antiPattern.score >= input.thresholds.antiPatternGap,
    docs_present_separated: docsPresent?.state === "observed" && docsPresent.score !== null && referenceScore !== null && docsPresent.score <= input.thresholds.docsPresentMax && referenceScore - docsPresent.score >= input.thresholds.docsPresentGap,
    baseline_below_reference: baseline?.state === "observed" && baseline.score !== null && referenceScore !== null && baseline.score < referenceScore,
    all_dimension_labels_match: labels.length > 0 && labels.every((check) => check.correct),
    all_rubric_hashes_match: Object.values(input.results).every((result) => result.rubric_hash === input.rubricHash),
    pairwise_discriminability: pairwise.length === 0 || pairwise.every((result) => result.passed),
  };
}
