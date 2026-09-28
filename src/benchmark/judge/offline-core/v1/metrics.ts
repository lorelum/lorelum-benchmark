import type { CalibrationLabel, CaseKind, JudgeDecision, PairCase, PairVerdict, RunMetrics, RunThresholds } from "./types";

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function consistent(left: PairVerdict, right: PairVerdict): boolean {
  return left === right;
}

export function computeMetrics(input: {
  cases: PairCase[];
  labels: CalibrationLabel[];
  decisions: JudgeDecision[];
}): { metrics: RunMetrics; checks: Record<string, boolean> } {
  const labelByCase = new Map(input.labels.map((label) => [label.case_id, label.expected]));
  const caseById = new Map(input.cases.map((pairCase) => [pairCase.id, pairCase]));
  const sufficientKinds = new Set<CaseKind>(["decisive", "equivalent"]);
  let schemaValid = 0;
  let citationValid = 0;
  let decisiveTotal = 0;
  let decisiveCorrect = 0;
  let equivalentTotal = 0;
  let equivalentStable = 0;
  let orderTotal = 0;
  let orderConsistent = 0;
  let unexpectedAbstain = 0;
  let insufficientControlsAbstained = 0;
  let insufficientControlsTotal = 0;
  const highConfidenceErrorCases = new Set<string>();

  const byCase = new Map<string, JudgeDecision[]>();
  for (const decision of input.decisions) {
    const group = byCase.get(decision.case_id) ?? [];
    group.push(decision);
    byCase.set(decision.case_id, group);
    const pairCase = caseById.get(decision.case_id);
    const expected = labelByCase.get(decision.case_id);
    const schemaIsValid = decision.state === "observed"
      ? decision.verdict !== "insufficient" && decision.confidence !== null
      : decision.state === "insufficient";
    if (schemaIsValid) schemaValid += 1;
    const evidenceIds = new Set(decision.evidence_ids);
    const citationsAreValid = (decision.state === "observed" || decision.state === "insufficient")
      && decision.citations.every((citation) => evidenceIds.has(citation));
    if (citationsAreValid) citationValid += 1;
    if (!pairCase || !expected) continue;
    if (sufficientKinds.has(pairCase.kind)) {
      if (decision.verdict === "insufficient" || decision.state !== "observed") unexpectedAbstain += 1;
    }
    if (pairCase.kind === "decisive") {
      decisiveTotal += 1;
      if (decision.canonical_verdict === expected) decisiveCorrect += 1;
    }
    if (pairCase.kind === "equivalent") {
      equivalentTotal += 1;
      if (decision.verdict === "tie") equivalentStable += 1;
    }
    if (pairCase.kind === "insufficient") {
      insufficientControlsTotal += 1;
      if (decision.verdict === "insufficient") insufficientControlsAbstained += 1;
    }
    if (decision.confidence === "high" && sufficientKinds.has(pairCase.kind)) {
      if (decision.canonical_verdict !== expected) highConfidenceErrorCases.add(decision.case_id);
    }
  }

  for (const pairCase of input.cases) {
    const decisions = byCase.get(pairCase.id) ?? [];
    const ab = decisions.find((decision) => decision.orientation === "AB");
    const ba = decisions.find((decision) => decision.orientation === "BA");
    if (!ab || !ba) continue;
    orderTotal += 1;
    const validStates = new Set(["observed", "insufficient"]);
    if (validStates.has(ab.state) && validStates.has(ba.state) && consistent(ab.canonical_verdict, ba.canonical_verdict)) {
      orderConsistent += 1;
    }
  }

  const metrics: RunMetrics = {
    schema_validity: ratio(schemaValid, input.decisions.length),
    citation_validity: ratio(citationValid, input.decisions.length),
    decisive_accuracy: ratio(decisiveCorrect, decisiveTotal),
    equivalence_stability: ratio(equivalentStable, equivalentTotal),
    order_consistency: ratio(orderConsistent, orderTotal),
    unexpected_abstain: ratio(unexpectedAbstain, input.decisions.filter((decision) => {
      const pairCase = caseById.get(decision.case_id);
      return pairCase !== undefined && sufficientKinds.has(pairCase.kind);
    }).length),
    high_confidence_errors: highConfidenceErrorCases.size,
    insufficient_controls_abstained: insufficientControlsAbstained,
    insufficient_controls_total: insufficientControlsTotal,
  };
  return { metrics, checks: {} };
}

function meetsMinimum(value: number | null, minimum: number): boolean {
  return value !== null && value >= minimum;
}

function meetsMaximum(value: number | null, maximum: number): boolean {
  return value !== null && value <= maximum;
}

export function evaluateThresholds(input: {
  metrics: RunMetrics;
  thresholds: RunThresholds;
  claim: "development" | "holdout";
}): Record<string, boolean> {
  const decisiveMinimum = input.claim === "development"
    ? input.thresholds.development_decisive_accuracy
    : input.thresholds.holdout_decisive_accuracy;
  return {
    schema_validity: meetsMinimum(input.metrics.schema_validity, input.thresholds.schema_validity),
    citation_validity: meetsMinimum(input.metrics.citation_validity, input.thresholds.citation_validity),
    decisive_accuracy: meetsMinimum(input.metrics.decisive_accuracy, decisiveMinimum),
    equivalence_stability: meetsMinimum(input.metrics.equivalence_stability, input.thresholds.equivalence_stability),
    order_consistency: meetsMinimum(input.metrics.order_consistency, input.thresholds.order_consistency),
    unexpected_abstain: meetsMaximum(input.metrics.unexpected_abstain, input.thresholds.unexpected_abstain),
    insufficient_controls_abstained: input.metrics.insufficient_controls_total > 0
      && input.metrics.insufficient_controls_abstained === input.metrics.insufficient_controls_total,
    high_confidence_errors: input.metrics.high_confidence_errors <= input.thresholds.high_confidence_errors,
  };
}
