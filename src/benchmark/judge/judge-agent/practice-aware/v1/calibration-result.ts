import type { GeneratedRubric } from "../../generic/v2/rubric";
import type { JudgeResultV1 } from "../../../../outcome/v1/contract";

export type CalibrationSample = {
  state: JudgeResultV1["state"];
  score: number;
  criteria: JudgeResultV1["criteria"];
  confidence: number;
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

export type CalibrationChecks = {
  rubric_has_practice_dimension: boolean;
  reference_high: boolean;
  equivalent_high: boolean;
  equivalent_close: boolean;
  anti_pattern_separated: boolean;
  docs_present_separated: boolean;
  baseline_below_reference: boolean;
  all_rubric_hashes_match: boolean;
};

export type CalibrationThresholds = {
  referenceMin: number;
  equivalentTolerance: number;
  antiPatternMax: number;
  antiPatternGap: number;
  docsPresentMax: number;
  docsPresentGap: number;
};

export function hasPracticeStructureDimension(rubric: GeneratedRubric): boolean {
  return rubric.dimensions.some((dimension) =>
    /(transport|boundary|policy|ledger|budget|provider.*protocol|raw.*response|delegation)/i.test(
      `${dimension.id} ${dimension.name} ${dimension.description}`,
    ),
  );
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
    : states.length > 0 && observedScores.length === states.length
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

export function practiceAwareCalibrationChecks(input: {
  results: Record<string, CalibrationFixtureResult>;
  rubricHash: string;
  rubric: GeneratedRubric;
  thresholds: CalibrationThresholds;
}): CalibrationChecks {
  const reference = input.results.reference;
  const equivalent = input.results.equivalent;
  const antiPattern = input.results["anti-pattern"];
  const docsPresent = input.results["docs-present"];
  const baseline = input.results["baseline-policy-scatter"];
  const rubricMatches = Object.values(input.results).every((result) => result.rubric_hash === input.rubricHash);
  const referenceScore = reference?.state === "observed" ? reference.score : null;
  return {
    rubric_has_practice_dimension: hasPracticeStructureDimension(input.rubric),
    reference_high: referenceScore !== null && referenceScore >= input.thresholds.referenceMin,
    equivalent_high: equivalent?.state === "observed" && equivalent.score !== null && equivalent.score >= input.thresholds.referenceMin,
    equivalent_close: equivalent?.state === "observed" && referenceScore !== null && equivalent.score !== null && Math.abs(equivalent.score - referenceScore) <= input.thresholds.equivalentTolerance,
    anti_pattern_separated: antiPattern?.state === "observed" && antiPattern.score !== null && referenceScore !== null && antiPattern.score <= input.thresholds.antiPatternMax && referenceScore - antiPattern.score >= input.thresholds.antiPatternGap,
    docs_present_separated: docsPresent?.state === "observed" && docsPresent.score !== null && referenceScore !== null && docsPresent.score <= input.thresholds.docsPresentMax && referenceScore - docsPresent.score >= input.thresholds.docsPresentGap,
    baseline_below_reference: baseline?.state === "observed" && baseline.score !== null && referenceScore !== null && baseline.score < referenceScore,
    all_rubric_hashes_match: rubricMatches,
  };
}