import { describe, expect, test } from "bun:test";

import { scoreRetrievalBatch } from "./v1";

const labels = [
  {
    id: "candidate-miss",
    coreIds: ["core.a"],
    forbiddenIds: ["forbidden.a"],
    coverage: ["direct"],
    rationale: "fixture",
  },
  {
    id: "ranking-miss",
    coreIds: ["core.b", "core.c"],
    forbiddenIds: ["forbidden.b"],
    coverage: ["direct"],
    rationale: "fixture",
  },
  {
    id: "final-hit",
    coreIds: ["core.d"],
    forbiddenIds: ["forbidden.c"],
    coverage: ["direct"],
    rationale: "fixture",
  },
];

describe("retrieval scorer v1", () => {
  test("separates candidate recall, final ranking, scope errors, and unlabelled neighbors", () => {
    const score = scoreRetrievalBatch({
      revision: "v1",
      candidateWidth: 20,
      resultLimit: 5,
      labels,
      cases: [
        {
          id: "candidate-miss",
          candidateIds: ["forbidden.a"],
          finalIds: ["forbidden.a"],
        },
        {
          id: "ranking-miss",
          candidateIds: ["core.b", "core.c", "forbidden.b", "unlabelled.neighbor"],
          finalIds: ["forbidden.b", "unlabelled.neighbor"],
        },
        {
          id: "final-hit",
          candidateIds: ["core.d", "forbidden.c"],
          finalIds: ["core.d", "forbidden.c"],
        },
      ],
    });

    expect(score.cases[0]?.core[0]?.classification).toBe("candidate-miss");
    expect(score.cases[0]?.caseClassification.finalRankingPassed).toBe(false);
    expect(score.cases[1]?.core.map((item) => item.classification)).toEqual([
      "final-ranking-miss",
      "final-ranking-miss",
    ]);
    expect(score.cases[2]?.caseClassification.finalHitPassed).toBe(true);
    expect(score.cases[2]?.unlabelledFinalIds).toEqual([]);
    expect(score.cases[1]?.unlabelledFinalIds).toEqual(["unlabelled.neighbor"]);
    expect(score.cases[2]?.coreForbiddenOrder).toEqual([
      {
        coreId: "core.d",
        forbiddenId: "forbidden.c",
        coreRank: 1,
        forbiddenRank: 2,
        coreBeforeForbidden: true,
      },
    ]);
    expect(score.summary.candidateMissPracticeCount).toBe(1);
    expect(score.summary.finalRankingMissPracticeCount).toBe(2);
    expect(score.summary.scopeErrorCaseCount).toBe(3);
    expect(score.summary.unlabelledFinalIdCaseCount).toBe(1);
    expect(score.summary.candidateRecall.hits).toBe(3);
    expect(score.summary.finalHitAtK.hits).toBe(1);
  });

  test("rejects malformed successful observations before scoring", () => {
    expect(() => scoreRetrievalBatch({
      revision: "v1",
      candidateWidth: 20,
      resultLimit: 5,
      labels: labels.slice(0, 1),
      cases: [{
        id: "candidate-miss",
        candidateIds: ["core.a", "core.a"],
        finalIds: ["core.a"],
      }],
    })).toThrow("duplicate");
  });
});
