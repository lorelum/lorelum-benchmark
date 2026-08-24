import { expect, test } from "bun:test";
import { resolveJudgeProvider } from "../../../providers";
import { buildJudgeInput } from "../../../input";
import { assertJudgeResultV1 } from "../../../../outcome/v1/contract";
import { createPracticeAwareJudgeProviderV2 } from "./provider";
import type { JudgeCompletion } from "../v1/llm";
import {
  assertStructureFactExtraction,
  deriveDimensionLabels,
  derivedLabelPoints,
  providerGatewayStructureFactSchema,
  structureFactSchemaHash,
  structureFactSystemPrompt,
  structureFactUserPrompt,
  type DimensionId,
  type DimensionLabel,
  type StructureFactExtraction,
  type StructureFactId,
} from "./structure-facts";
import { scoreStructureAwareWithRetry } from "./score";
import {
  dimensionConfusion,
  dimensionLabelChecks,
  expectedDimensionLabels,
  practiceAwareStructureCalibrationChecks,
  type CalibrationFixtureResult,
} from "./calibration-result";
import { assertBlindedPairwiseVerdict, evaluateBlindedPairwiseVerdict } from "./pairwise";

const taskMd = "# Gateway task\n\nAdd providers, fallback, budgets, idempotency, streaming, and usage queries.\n";
const candidateDiff = [
  "src/server.ts\0" + "export const handler = 'source';\n".length + "\0" + "export const handler = 'source';\n",
  "src/policy.ts\0" + "export const policy = 'boundary';\n".length + "\0" + "export const policy = 'boundary';\n",
].join("\n");
const rubric = {
  dimensions: [
    { id: "contract-normalization", name: "contract", description: "normalized contract", max_points: 20, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
    { id: "adapter-isolation", name: "adapter", description: "isolated adapters", max_points: 20, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
    { id: "policy-centralization", name: "policy", description: "central policy", max_points: 20, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
    { id: "single-billing-atomicity", name: "billing", description: "atomic billing", max_points: 20, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
    { id: "streaming-accounting", name: "streaming", description: "stream accounting", max_points: 10, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
    { id: "query-and-error-contract", name: "query", description: "query and errors", max_points: 10, scoring_anchors: { full: ["full structural condition"], partial: ["partial structural condition"], zero: ["zero structural condition"] } },
  ],
};

type Captured = { system: string; user: string };
function stubCompletion(results: unknown[]): JudgeCompletion & { captured(): Captured[] } {
  let index = 0;
  const captured: Captured[] = [];
  const fn = async (system: string, user: string) => {
    captured.push({ system, user });
    const value = results[index] ?? results[results.length - 1];
    index += 1;
    return value;
  };
  return Object.assign(fn, { captured: () => captured });
}

function facts(overrides: Partial<Record<StructureFactId, boolean>> = {}): StructureFactExtraction {
  return {
    schema_version: "practice-aware-structure-facts/v1",
    confidence: 91,
    facts: providerGatewayStructureFactSchema.map((definition) => ({
      fact_id: definition.fact_id,
      value: overrides[definition.fact_id] ?? definition.role !== "forbidden",
      evidence: `Concrete evidence for ${definition.fact_id} in src/server.ts.`,
      source_references: ["src/server.ts"],
    })),
  };
}

function fixtureResult(labels: Record<DimensionId, DimensionLabel>, score: number): CalibrationFixtureResult {
  return {
    state: "observed",
    score,
    sample_states: ["observed", "observed", "observed"],
    rubric_hash: "a".repeat(64),
    input_hash: "b".repeat(64),
    tree_hash: "c".repeat(64),
    samples: [0, 1, 2].map(() => ({ state: "observed" as const, score, criteria: [], confidence: 91, dimension_labels: labels })),
  };
}

const antiLabels = { ...expectedDimensionLabels["anti-pattern"]! };
const baselineLabels = { ...expectedDimensionLabels["baseline-policy-scatter"]! };
const starterLabels = { ...expectedDimensionLabels["public-starter"]! };

test("structure-fact schema is exhaustive, hash-stable, and forbids adjudication fields", async () => {
  expect(providerGatewayStructureFactSchema).toHaveLength(25);
  expect(new Set(providerGatewayStructureFactSchema.map((fact) => fact.fact_id)).size).toBe(25);
  expect(await structureFactSchemaHash()).toBe(await structureFactSchemaHash());
  const system = structureFactSystemPrompt();
  expect(system).toContain("Do not return full/partial/zero labels");
  expect(system).toContain("Documentation, tests, fixture names, expected labels");
  expect(structureFactUserPrompt(taskMd, candidateDiff)).toContain("Candidate source (canonical diff):");
  const validated = assertStructureFactExtraction(facts(), candidateDiff);
  expect(validated.facts).toHaveLength(25);
});

test("deterministic labels reproduce the expected fixture matrix", () => {
  expect(deriveDimensionLabels(facts())).toEqual(expectedDimensionLabels.reference);
  expect(deriveDimensionLabels(facts({
    isolated_protocol_adapters: false,
    dispatch_by_protocol_or_config: false,
    provider_name_dispatch_in_interface: true,
    handler_directly_owns_cross_request_policy: true,
  }))).toEqual(antiLabels);
  expect(deriveDimensionLabels(facts({
    policy_owns_retry_fallback: false,
    policy_or_ledger_owns_budget_idempotency_metering: false,
    handler_or_scattered_modules_own_cross_request_policy: true,
    billing_ownership_scattered: false,
    stream_policy_or_ledger_ownership: false,
  }))).toEqual(baselineLabels);
  const starterOverrides = Object.fromEntries(providerGatewayStructureFactSchema.map((definition) => [
    definition.fact_id,
    definition.role === "forbidden" ? false : false,
  ])) as Partial<Record<StructureFactId, boolean>>;
  expect(deriveDimensionLabels(facts(starterOverrides))).toEqual(starterLabels);
});

test("source-fact scoring derives points and preserves fact evidence", async () => {
  const complete = stubCompletion([facts()]);
  const scored = await scoreStructureAwareWithRetry({
    taskMd,
    candidateDiff,
    rubric,
    rubricText: JSON.stringify(rubric),
    rubricHash: "a".repeat(64),
    inputHash: "b".repeat(64),
    judge: { id: "judge-agent/practice-aware", version: "v2" },
    complete,
  });
  expect(scored.result.score).toBe(100);
  expect(scored.result.criteria.map((criterion) => criterion.points)).toEqual([20, 20, 20, 20, 10, 10]);
  expect(scored.result.criteria[0]?.rationale).toContain("label=full");
  expect(scored.result.criteria[0]?.rationale).toContain("unified_interface_contract=true");
  expect(complete.captured()).toHaveLength(1);

  const partial = await scoreStructureAwareWithRetry({
    taskMd,
    candidateDiff,
    rubric,
    rubricText: JSON.stringify(rubric),
    rubricHash: "a".repeat(64),
    inputHash: "b".repeat(64),
    judge: { id: "judge-agent/practice-aware", version: "v2" },
    complete: stubCompletion([facts({ handler_directly_owns_cross_request_policy: true })]),
  });
  expect(partial.dimension_labels["policy-centralization"]).toBe("zero");
  expect(partial.result.criteria[2]?.points).toBe(0);
  expect(derivedLabelPoints("partial", 20)).toBe(10);
});

test("malformed, ambiguous, or unverifiable facts fail closed after identical retries", async () => {
  const missing = { ...facts(), facts: facts().facts.slice(1) };
  const labeled = { ...facts(), dimension_label: "full" } as unknown;
  const badSource = {
    ...facts(),
    facts: facts().facts.map((fact, index) => index === 0 ? { ...fact, source_references: ["private/oracle.md"] } : fact),
  };
  for (const output of [missing, labeled, badSource]) {
    const complete = stubCompletion([output]);
    await expect(scoreStructureAwareWithRetry({
      taskMd,
      candidateDiff,
      rubric,
      rubricText: JSON.stringify(rubric),
      rubricHash: "a".repeat(64),
      inputHash: "b".repeat(64),
      judge: { id: "judge-agent/practice-aware", version: "v2" },
      complete,
    })).rejects.toThrow("Invalid structure fact output:");
    expect(complete.captured()).toHaveLength(3);
    expect(new Set(complete.captured().map((call) => call.user)).size).toBe(1);
  }
});

function resultsWithAntiPredictedReference() {
  return {
    reference: fixtureResult(expectedDimensionLabels.reference!, 100),
    equivalent: fixtureResult(expectedDimensionLabels.equivalent!, 100),
    "anti-pattern": fixtureResult(expectedDimensionLabels.reference!, 100),
    "docs-present": fixtureResult(expectedDimensionLabels["docs-present"]!, 60),
    "baseline-policy-scatter": fixtureResult(expectedDimensionLabels["baseline-policy-scatter"]!, 55),
  };
}

test("dimension confusion matrix blocks total-only false positives", () => {
  const results = resultsWithAntiPredictedReference();
  const labels = dimensionLabelChecks({ results, fixtures: Object.keys(results) });
  const confusion = dimensionConfusion({ results, fixtures: Object.keys(results) });
  expect(labels.filter((check) => !check.correct)).toHaveLength(2);
  expect(confusion["adapter-isolation"].zero.full).toBe(1);
  expect(confusion["policy-centralization"].zero.full).toBe(1);
  const checks = practiceAwareStructureCalibrationChecks({
    results,
    rubricHash: "a".repeat(64),
    thresholds: { referenceMin: 80, equivalentTolerance: 10, antiPatternMax: 70, antiPatternGap: 10, docsPresentMax: 70, docsPresentGap: 10 },
  });
  expect(checks.anti_pattern_separated).toBe(false);
  expect(checks.all_dimension_labels_match).toBe(false);
  expect(Object.values(checks).every(Boolean)).toBe(false);
});

test("blinded pairwise is fail-closed and cannot repair label confusion", () => {
  const verdict = assertBlindedPairwiseVerdict({
    preference: "left",
    confidence: 88,
    dimension_preferences: rubric.dimensions.map((dimension, index) => ({
      id: dimension.id as DimensionId,
      preference: index === 2 ? "tie" : "left",
      evidence: `Concrete comparison evidence for ${dimension.id}.`,
    })),
  });
  const evaluation = evaluateBlindedPairwiseVerdict(verdict, "left");
  expect(evaluation.overall_correct).toBe(true);
  expect(evaluation.dimension_correct).toBe(5);
  expect(evaluation.dimension_majority).toBe(true);
  expect(evaluation.passed).toBe(true);
  expect(() => assertBlindedPairwiseVerdict({ ...verdict, fixture: "reference" })).toThrow("root fields");
  expect(() => assertBlindedPairwiseVerdict({ ...verdict, preference: "tie" })).not.toThrow();

  const results = resultsWithAntiPredictedReference();
  const checks = practiceAwareStructureCalibrationChecks({
    results,
    rubricHash: "a".repeat(64),
    thresholds: { referenceMin: 80, equivalentTolerance: 10, antiPatternMax: 70, antiPatternGap: 10, docsPresentMax: 70, docsPresentGap: 10 },
    pairwise: [{ verdict, positiveSide: "left" }],
  });
  expect(checks.pairwise_discriminability).toBe(true);
  expect(checks.all_dimension_labels_match).toBe(false);
  expect(Object.values(checks).every(Boolean)).toBe(false);
});

test("provider v2 scores fixed anchored rubrics through source-fact extraction", async () => {
  const rubricText = JSON.stringify(rubric);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: rubricText });
  const provider = createPracticeAwareJudgeProviderV2({ LORELUM_JUDGE_REAL: "1" }, { complete: stubCompletion([facts()]) });
  const result = await provider.score(input, {
    judge: { id: provider.id, version: provider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: "c".repeat(64),
  });
  assertJudgeResultV1(result);
  expect(result.judge.version).toBe("v2");
  expect(result.score).toBe(100);
  await expect(provider.promptFor(input)).resolves.toContain("Candidate source (canonical diff):");
});

test("registry adds practice-aware v2 without replacing v1 or generic v2", () => {
  const practiceV1 = resolveJudgeProvider("judge-agent/practice-aware/v1");
  const practiceV2 = resolveJudgeProvider("judge-agent/practice-aware/v2");
  const generic = resolveJudgeProvider("judge-agent/generic/v2");
  expect(practiceV1?.version).toBe("v1");
  expect(practiceV2?.version).toBe("v2");
  expect(generic?.version).toBe("v2");
});
