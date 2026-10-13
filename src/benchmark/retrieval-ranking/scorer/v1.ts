export interface ScorerCaseInput {
  id: string;
  candidateIds: string[];
  finalIds: string[];
}

export interface RetrievalPracticeLabel {
  id: string;
  coreIds: string[];
  forbiddenIds: string[];
  coverage: string[];
  rationale: string;
}

export interface ScoreRetrievalBatchInput {
  revision: string;
  candidateWidth: number;
  resultLimit: number;
  cases: ScorerCaseInput[];
  labels: RetrievalPracticeLabel[];
}

export interface ScoredCorePractice {
  id: string;
  inCandidateIds: boolean;
  candidateRank: number | null;
  inFinalIds: boolean;
  finalRank: number | null;
  classification: "candidate-miss" | "final-ranking-miss" | "final-hit";
}

export interface ScoredForbiddenPractice {
  id: string;
  inFinalIds: boolean;
  finalRank: number | null;
  scopeError: boolean;
}

export interface CoreForbiddenOrder {
  coreId: string;
  forbiddenId: string;
  coreRank: number;
  forbiddenRank: number;
  coreBeforeForbidden: boolean;
}

export interface ScoredCase {
  id: string;
  candidateIds: string[];
  finalIds: string[];
  core: ScoredCorePractice[];
  forbidden: ScoredForbiddenPractice[];
  coreForbiddenOrder: CoreForbiddenOrder[];
  unlabelledFinalIds: string[];
  caseClassification: {
    candidateRecallPassed: boolean;
    finalRankingPassed: boolean;
    finalHitPassed: boolean;
    scopeError: boolean;
  };
}

export interface RetrievalBatchScore {
  schemaVersion: 1;
  revision: string;
  candidateWidth: number;
  resultLimit: number;
  summary: {
    caseCount: number;
    corePracticeCount: number;
    candidateRecall: { hits: number; total: number; rate: number };
    finalHitAtK: { hits: number; total: number; rate: number };
    candidateMissPracticeCount: number;
    finalRankingMissPracticeCount: number;
    scopeErrorCaseCount: number;
    scopeErrorForbiddenPracticeCount: number;
    unlabelledFinalIdCaseCount: number;
  };
  cases: ScoredCase[];
  interpretation: string;
}

function ensureUnique(ids: readonly string[], context: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${context} contains duplicate IDs`);
}

function rankOf(ids: readonly string[], id: string): number | null {
  const index = ids.indexOf(id);
  return index < 0 ? null : index + 1;
}

export function scoreRetrievalBatch(input: ScoreRetrievalBatchInput): RetrievalBatchScore {
  if (input.labels.length !== input.cases.length) throw new Error("Scorer requires exactly one label entry per case");
  const labelsById = new Map(input.labels.map((label) => [label.id, label]));
  let corePracticeCount = 0;
  let candidateHits = 0;
  let finalHits = 0;
  let candidateMissPracticeCount = 0;
  let finalRankingMissPracticeCount = 0;
  let scopeErrorCaseCount = 0;
  let scopeErrorForbiddenPracticeCount = 0;
  let unlabelledFinalIdCaseCount = 0;
  const scoredCases: ScoredCase[] = [];

  for (const retrievalCase of input.cases) {
    ensureUnique(retrievalCase.candidateIds, `${retrievalCase.id} candidateIds`);
    ensureUnique(retrievalCase.finalIds, `${retrievalCase.id} finalIds`);
    if (retrievalCase.candidateIds.length > input.candidateWidth) throw new Error(`${retrievalCase.id} exceeds candidateWidth`);
    if (retrievalCase.finalIds.length > input.resultLimit) throw new Error(`${retrievalCase.id} exceeds resultLimit`);
    if (retrievalCase.finalIds.some((id) => !retrievalCase.candidateIds.includes(id))) {
      throw new Error(`${retrievalCase.id} finalIds are not a subset of candidateIds`);
    }

    const label = labelsById.get(retrievalCase.id);
    if (!label) throw new Error(`Missing gold label for ${retrievalCase.id}`);
    if (label.coreIds.length === 0) throw new Error(`Gold label has no core IDs for ${retrievalCase.id}`);
    ensureUnique(label.coreIds, `${retrievalCase.id} coreIds`);
    ensureUnique(label.forbiddenIds, `${retrievalCase.id} forbiddenIds`);
    if (label.coreIds.some((id) => label.forbiddenIds.includes(id))) {
      throw new Error(`${retrievalCase.id} has a Practice marked both core and forbidden`);
    }

    const candidateSet = new Set(retrievalCase.candidateIds);
    const finalSet = new Set(retrievalCase.finalIds);
    const core = label.coreIds.map((id) => {
      const inCandidateIds = candidateSet.has(id);
      const finalRank = rankOf(retrievalCase.finalIds, id);
      const classification = !inCandidateIds
        ? "candidate-miss"
        : finalRank === null
          ? "final-ranking-miss"
          : "final-hit";
      return {
        id,
        inCandidateIds,
        candidateRank: rankOf(retrievalCase.candidateIds, id),
        inFinalIds: finalRank !== null,
        finalRank,
        classification,
      } satisfies ScoredCorePractice;
    });
    const forbidden = label.forbiddenIds.map((id) => {
      const finalRank = rankOf(retrievalCase.finalIds, id);
      return {
        id,
        inFinalIds: finalRank !== null,
        finalRank,
        scopeError: finalRank !== null,
      } satisfies ScoredForbiddenPractice;
    });

    const coreForbiddenOrder: CoreForbiddenOrder[] = [];
    for (const coreResult of core) {
      if (coreResult.finalRank === null) continue;
      for (const forbiddenResult of forbidden) {
        if (forbiddenResult.finalRank === null) continue;
        coreForbiddenOrder.push({
          coreId: coreResult.id,
          forbiddenId: forbiddenResult.id,
          coreRank: coreResult.finalRank,
          forbiddenRank: forbiddenResult.finalRank,
          coreBeforeForbidden: coreResult.finalRank < forbiddenResult.finalRank,
        });
      }
    }

    const labelledIds = new Set([...label.coreIds, ...label.forbiddenIds]);
    const unlabelledFinalIds = retrievalCase.finalIds.filter((id) => !labelledIds.has(id));
    const caseCandidateMiss = core.some((item) => item.classification === "candidate-miss");
    const caseFinalRankingMiss = !caseCandidateMiss && core.some((item) => item.classification === "final-ranking-miss");
    const caseScopeError = forbidden.some((item) => item.scopeError);
    if (caseScopeError) scopeErrorCaseCount += 1;
    if (unlabelledFinalIds.length > 0) unlabelledFinalIdCaseCount += 1;

    for (const coreResult of core) {
      corePracticeCount += 1;
      if (coreResult.inCandidateIds) candidateHits += 1;
      if (coreResult.inFinalIds) finalHits += 1;
      if (coreResult.classification === "candidate-miss") candidateMissPracticeCount += 1;
      if (coreResult.classification === "final-ranking-miss") finalRankingMissPracticeCount += 1;
    }
    scopeErrorForbiddenPracticeCount += forbidden.filter((item) => item.scopeError).length;

    scoredCases.push({
      id: retrievalCase.id,
      candidateIds: retrievalCase.candidateIds,
      finalIds: retrievalCase.finalIds,
      core,
      forbidden,
      coreForbiddenOrder,
      unlabelledFinalIds,
      caseClassification: {
        candidateRecallPassed: !caseCandidateMiss,
        finalRankingPassed: !caseCandidateMiss && !caseFinalRankingMiss,
        finalHitPassed: core.every((item) => item.inFinalIds),
        scopeError: caseScopeError,
      },
    });
  }

  return {
    schemaVersion: 1,
    revision: input.revision,
    candidateWidth: input.candidateWidth,
    resultLimit: input.resultLimit,
    summary: {
      caseCount: input.cases.length,
      corePracticeCount,
      candidateRecall: {
        hits: candidateHits,
        total: corePracticeCount,
        rate: corePracticeCount === 0 ? 0 : candidateHits / corePracticeCount,
      },
      finalHitAtK: {
        hits: finalHits,
        total: corePracticeCount,
        rate: corePracticeCount === 0 ? 0 : finalHits / corePracticeCount,
      },
      candidateMissPracticeCount,
      finalRankingMissPracticeCount,
      scopeErrorCaseCount,
      scopeErrorForbiddenPracticeCount,
      unlabelledFinalIdCaseCount,
    },
    cases: scoredCases,
    interpretation: "Retrieval outcomes are scoped to this frozen corpus, query set, Profile, and N/K. They do not measure coding-Agent effectiveness or global production accuracy.",
  };
}
