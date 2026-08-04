import type { JudgeCriteriaV1 } from "../../../../../src/benchmark/outcome/v1/contract";

export type JudgeRun = {
  score: number;
  confidence: number;
  criteria: JudgeCriteriaV1[];
};

export type AggregateReport = {
  scores: number[];
  median: number;
  spread: number;
  lowConfidence: boolean;
  disagreement: boolean;
};

export type AggregateResult = {
  state: "observed" | "indeterminate";
  score: number;
  criteria: JudgeCriteriaV1[];
  confidence: number;
  reason?: string;
  report: AggregateReport;
};

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("cannot compute median of an empty list");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function aggregateRuns(runs: JudgeRun[], thresholds: { low_confidence: number; disagreement_spread: number }): AggregateResult {
  if (runs.length === 0) throw new Error("aggregate requires at least one judge run");
  const scores = runs.map((run) => run.score);
  const sorted = [...scores].sort((left, right) => left - right);
  const med = median(sorted);
  const spread = sorted[sorted.length - 1] - sorted[0];
  const medianConfidence = median(runs.map((run) => run.confidence));
  const lowConfidence = runs.some((run) => run.confidence < thresholds.low_confidence) || medianConfidence < thresholds.low_confidence;
  const disagreement = spread > thresholds.disagreement_spread;
  const medianRun = runs.find((run) => run.score === med) ?? runs[Math.floor(runs.length / 2)];

  if (disagreement) {
    return {
      state: "indeterminate",
      score: 0,
      criteria: [],
      confidence: medianConfidence,
      reason: `judge score disagreement across ${runs.length} runs: scores [${scores.join(", ")}] spread ${spread} exceeds ${thresholds.disagreement_spread}`,
      report: { scores, median: med, spread, lowConfidence, disagreement: true },
    };
  }
  return {
    state: "observed",
    score: med,
    criteria: medianRun.criteria,
    confidence: medianConfidence,
    report: { scores, median: med, spread, lowConfidence, disagreement: false },
  };
}
