import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Text } from "../../../../fs";
import { assertJudgeResultV1 } from "../../../../outcome/v1/contract";
import { buildJudgeInput } from "../../../input";
import { resolveJudgeProvider } from "../../../providers";
import { rubricSystemPrompt, rubricUserPrompt, serializeRubric } from "../../generic/v2/rubric";
import { createPracticeAwareJudgeProvider } from "./provider";
import {
  assertPublicPracticeText,
  generatePracticeAwareRubric,
  generatePracticeAwareRubricCached,
  parsePracticeAwareRubricText,
  practiceAwareRubricSystemPrompt,
  practiceAwareRubricUserPrompt,
  serializePracticeAwareRubric,
} from "./rubric";
import { practiceAwareScoreSystemPrompt } from "./score";
import type { JudgeCompletion } from "./llm";
import { resolveDeclaredPracticeAwareMaterials } from "./declaration";
import { aggregateCalibrationSamples, hasPracticeStructureDimension, practiceAwareCalibrationChecks } from "./calibration-result";

const taskMd = "# Gateway task\n\nAdd Nebula, fallback, tenant budget, idempotency, and stream failure accounting.\n";
const practiceText = "# Provider gateway practice\n\n1. Keep transport in adapters and cross-cutting policy in one boundary module.\n2. Handlers only parse requests and delegate.\n";
const anchors = (full: string, partial: string, zero: string) => ({ full: [full], partial: [partial], zero: [zero] });
const validRubric = {
  dimensions: [
    { id: "policy-centralization", name: "policy centralization", description: "fallback retry budget idempotency and metering centralized", max_points: 40 },
    { id: "transport-isolation", name: "transport isolation", description: "handlers do not own provider transport", max_points: 20 },
    { id: "provider-protocol-mapping", name: "protocol mapping", description: "pseudo-compatible provider translated by wire contract", max_points: 20 },
    { id: "correctness", name: "correctness", description: "observable behaviors implemented", max_points: 20 },
  ],
};
const anchoredRubric = {
  dimensions: [
    {
      ...validRubric.dimensions[0]!,
      scoring_anchors: anchors(
        "The handler delegates every cross-request policy to a non-HTTP boundary.",
        "Some policies are extracted while handler or scattered modules retain ownership.",
        "The handler directly owns cross-request policy state.",
      ),
    },
    {
      ...validRubric.dimensions[1]!,
      scoring_anchors: anchors(
        "No handler directly calls transport or consumes raw wire values.",
        "A boundary exists but one handler path still reaches transport details.",
        "Transport is implemented directly in the handler.",
      ),
    },
    {
      ...validRubric.dimensions[2]!,
      scoring_anchors: anchors(
        "Pseudo-compatible providers use their actual wire protocol.",
        "A provider is reused by name despite a different protocol.",
        "No protocol mapping boundary exists.",
      ),
    },
    {
      ...validRubric.dimensions[3]!,
      scoring_anchors: anchors(
        "All observable task behaviors are implemented.",
        "A secondary observable behavior is missing or incorrect.",
        "The primary observable behavior is not implemented.",
      ),
    },
  ],
};

type Captured = { system: string; user: string; calls: number };
function stubCompletion(results: unknown[]): JudgeCompletion & { captured(): Captured[] } {
  let index = 0;
  const captured: Captured[] = [];
  const fn = async (system: string, user: string) => {
    captured.push({ system, user, calls: captured.length + 1 });
    const value = results[index] ?? results[results.length - 1];
    index += 1;
    return value;
  };
  return Object.assign(fn, { captured: () => captured });
}

test("practice-aware prompts include task, Practice structure, and binding anchors", () => {
  const user = practiceAwareRubricUserPrompt(taskMd, practiceText);
  expect(user).toContain(taskMd);
  expect(user).toContain("Practice text:");
  expect(user).toContain(practiceText);
  const system = practiceAwareRubricSystemPrompt();
  expect(system).toContain("MUST explicitly measure adherence to the structural disciplines");
  expect(system).toContain("scoring_anchors");
  expect(system).toContain("cap that dimension at half credit");
  expect(practiceAwareRubricUserPrompt(taskMd)).toBe(rubricUserPrompt(taskMd));
});

test("generatePracticeAwareRubric validates anchors, serializes, hashes, and fails closed", async () => {
  const good = stubCompletion([anchoredRubric]);
  const result = await generatePracticeAwareRubric(taskMd, practiceText, good);
  expect(result.rubric.dimensions).toHaveLength(4);
  expect(result.hash).toBe(await sha256Text(result.text));
  expect(result.text).toContain("scoring_anchors");
  expect(good.captured()[0]?.user).toContain(practiceText);

  const missingAnchors = stubCompletion([validRubric]);
  await expect(generatePracticeAwareRubric(taskMd, practiceText, missingAnchors)).rejects.toThrow("requires scoring_anchors");
  const bad = stubCompletion([{ dimensions: [{ id: "a", name: "n", description: "d", max_points: 40 }] }]);
  await expect(generatePracticeAwareRubric(taskMd, practiceText, bad)).rejects.toThrow("total 100");
});

test("practice rubric generation caches per task and Practice input; no Practice reuses generic behavior", async () => {
  const complete = stubCompletion([anchoredRubric]);
  const first = await generatePracticeAwareRubricCached(`${taskMd} cache-a`, practiceText, complete, {});
  const second = await generatePracticeAwareRubricCached(`${taskMd} cache-a`, practiceText, complete, {});
  expect(first.hash).toBe(second.hash);
  expect(complete.captured()).toHaveLength(1);

  const changed = await generatePracticeAwareRubricCached(`${taskMd} cache-a`, `${practiceText} changed`, complete, {});
  expect(changed.hash).toBe(first.hash); // same stub rubric; the separate Practice input still invoked the completion
  expect(complete.captured()[1]?.user).toContain("changed");
  expect(complete.captured()).toHaveLength(2);

  const noPractice = stubCompletion([validRubric]);
  const genericEquivalent = await generatePracticeAwareRubricCached(`${taskMd} cache-b`, undefined, noPractice, {});
  expect(genericEquivalent.text).toBe(serializeRubric(validRubric));
  expect(noPractice.captured()[0]?.system).toBe(rubricSystemPrompt());
  expect(noPractice.captured()[0]?.user).toBe(rubricUserPrompt(`${taskMd} cache-b`));
});

test("provider passes Practice text to rubric generation and validates anchors", async () => {
  const complete = stubCompletion([anchoredRubric]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  const text = await provider.rubricText({ task_md: `${taskMd} provider-a`, practice_text: practiceText });
  expect(text).toBe(serializePracticeAwareRubric(anchoredRubric));
  expect(complete.captured()[0]?.user).toContain(practiceText);

  const genericComplete = stubCompletion([validRubric]);
  const genericProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete: genericComplete });
  await genericProvider.rubricText({ task_md: `${taskMd} provider-b` });
  expect(genericComplete.captured()[0]?.system).toBe(rubricSystemPrompt());
  expect(genericComplete.captured()[0]?.user).toBe(rubricUserPrompt(`${taskMd} provider-b`));
});

test("provider supports fixed anchor-aware rubrics and fails closed without task context or opt-in", async () => {
  const fixed = serializePracticeAwareRubric(anchoredRubric);
  const fixedProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_RUBRIC_TEXT: fixed });
  expect(await fixedProvider.rubricText({ task_md: taskMd, practice_text: practiceText })).toBe(fixed);
  expect(() => parsePracticeAwareRubricText(fixed)).not.toThrow();

  const provider = createPracticeAwareJudgeProvider({});
  await expect(provider.rubricText({ task_md: taskMd })).rejects.toThrow("LORELUM_JUDGE_REAL");
  const real = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" });
  await expect(real.rubricText({ practice_text: practiceText })).rejects.toThrow("task_md");
});

test("private Practice input is rejected before any completion call", async () => {
  const complete = stubCompletion([anchoredRubric]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  await expect(provider.rubricText({ task_md: taskMd, practice_text: "see oracle/ and private/evaluator/" })).rejects.toThrow("judge input rejected");
  expect(complete.captured()).toHaveLength(0);
  expect(() => assertPublicPracticeText("condition_id: oracle-practice")).toThrow("judge input rejected");
});

test("provider scores an unanchored no-Practice rubric through the generic-compatible pipeline", async () => {
  const rubricText = serializeRubric(validRubric);
  const input = await buildJudgeInput({
    task_md: taskMd,
    candidate_diff: "src/server.ts\u000eexport const handler = 'delegates';\n",
    rubric: rubricText,
  });
  const complete = stubCompletion([{
    criteria: validRubric.dimensions.map((dimension) => ({ id: dimension.id, points: dimension.max_points, rationale: "concrete evidence" })),
    confidence: 91,
  }]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  const result = await provider.score(input, {
    judge: { id: provider.id, version: provider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: await sha256Text(rubricText),
  });
  assertJudgeResultV1(result);
  expect(result.state).toBe("observed");
  expect(result.score).toBe(100);
  expect(result.judge).toEqual({ id: "judge-agent/practice-aware", version: "v1" });
});

function anchorResults(dimension: (typeof anchoredRubric.dimensions)[number], satisfied: "full" | "partial" | "zero") {
  return [
    ...dimension.scoring_anchors.full.map((anchor) => ({ kind: "full" as const, anchor })),
    ...dimension.scoring_anchors.partial.map((anchor) => ({ kind: "partial" as const, anchor })),
    ...dimension.scoring_anchors.zero.map((anchor) => ({ kind: "zero" as const, anchor })),
  ].map((result) => ({
    ...result,
    satisfied: result.kind === satisfied,
    evidence: `${result.kind} source evidence`,
  }));
}

test("anchor-aware scoring derives the partial cap and preserves anchor evidence", async () => {
  const rubricText = serializePracticeAwareRubric(anchoredRubric);
  const input = await buildJudgeInput({
    task_md: taskMd,
    candidate_diff: "src/server.ts\u000eexport const handler = 'delegates';\n",
    rubric: rubricText,
  });
  const accepted = anchoredRubric.dimensions.map((dimension, index) => ({
    id: dimension.id,
    rationale: "concrete overall evidence",
    anchor_results: anchorResults(dimension, index === 0 ? "partial" : "full"),
  }));
  const complete = stubCompletion([{ criteria: accepted, confidence: 91 }]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  const result = await provider.score(input, {
    judge: { id: provider.id, version: provider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: await sha256Text(rubricText),
  });
  expect(result.score).toBe(80);
  expect(result.criteria[0]?.points).toBe(20);
  expect(result.criteria[0]?.rationale).toContain("partial#2=satisfied");
  const [first] = complete.captured();
  expect(first?.system).toBe(practiceAwareScoreSystemPrompt());
  expect(first?.system).toContain("treat that diff as the complete, authoritative source evidence");
  expect(first?.system).toContain("Do not return indeterminate merely because the candidate is diff-shaped");
  expect(first?.system).toContain("its anchor_results length is exactly F+P+Z");
  expect(first?.system).toContain("includes unsatisfied anchors with satisfied=false");
  expect(first?.system).toContain("Do not output criterion points");
  expect(first?.user).toContain("Candidate source (canonical diff):");
  expect(complete.captured()).toHaveLength(1);
});

test("anchor-aware scoring derives zero points and rejects model-provided points", async () => {
  const rubricText = serializePracticeAwareRubric(anchoredRubric);
  const input = await buildJudgeInput({
    task_md: taskMd,
    candidate_diff: "src/server.ts\u000eexport const handler = 'owns policy';\n",
    rubric: rubricText,
  });
  const accepted = anchoredRubric.dimensions.map((dimension, index) => ({
    id: dimension.id,
    rationale: "concrete overall evidence",
    anchor_results: anchorResults(dimension, index === 0 ? "zero" : "full"),
  }));
  const acceptedComplete = stubCompletion([{ criteria: accepted, confidence: 80 }]);
  const acceptedProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete: acceptedComplete });
  const result = await acceptedProvider.score(input, {
    judge: { id: acceptedProvider.id, version: acceptedProvider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: await sha256Text(rubricText),
  });
  expect(result.score).toBe(60);
  expect(result.criteria[0]?.points).toBe(0);

  const withPoints = accepted.map((criterion, index) => ({ ...criterion, points: index === 0 ? 1 : criterion ? 20 : 0 }));
  const rejectedComplete = stubCompletion([{ criteria: withPoints, confidence: 80 }]);
  const rejectedProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete: rejectedComplete });
  await expect(rejectedProvider.score(input, {
    judge: { id: rejectedProvider.id, version: rejectedProvider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: await sha256Text(rubricText),
  })).rejects.toThrow("points must be derived from anchor_results");
  expect(rejectedComplete.captured()).toHaveLength(3);
});


test("declared Practice and rubric inputs are hash-bound and reject arbitrary paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-practice-declared-"));
  try {
    const practices = join(root, "private", "practices");
    const calibration = join(root, "private", "calibration");
    await mkdir(practices, { recursive: true });
    await mkdir(calibration, { recursive: true });
    const practice = "# Gateway practice\n\nKeep policy in one boundary module.\n";
    const rubric = serializePracticeAwareRubric(anchoredRubric);
    const practicePath = join(practices, "provider-gateway.md");
    const rubricPath = join(calibration, "rubric.json");
    await writeFile(practicePath, practice);
    await writeFile(rubricPath, rubric);
    const conditions = [
      "shared_execution:",
      "  judge:",
      "    provider: judge-agent/practice-aware/v1",
      `    rubric: { path: private/calibration/rubric.json, sha256: ${await sha256Text(rubric)} }`,
      "conditions:",
      "  - { id: baseline, status: declared, practice: none }",
      "  - id: oracle-practice",
      "    status: declared",
      `    practice: { path: private/practices/provider-gateway.md, sha256: ${await sha256Text(practice)} }`,
    ].join("\n");
    await writeFile(join(root, "private", "conditions.yaml"), `${conditions}\n`);
    const resolved = await resolveDeclaredPracticeAwareMaterials(root, practicePath);
    expect(resolved.oracle_practice.text).toBe(practice);
    expect(resolved.rubric.text).toBe(rubric);
    await expect(resolveDeclaredPracticeAwareMaterials(root, join(root, "private", "practices", "other.md"))).rejects.toThrow("does not match");

    await writeFile(practicePath, `${practice}changed\n`);
    await expect(resolveDeclaredPracticeAwareMaterials(root)).rejects.toThrow("oracle Practice sha256 mismatch");
    await writeFile(practicePath, practice);
    await writeFile(rubricPath, `${rubric}\n`);
    await expect(resolveDeclaredPracticeAwareMaterials(root)).rejects.toThrow("rubric sha256 mismatch");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("calibration aggregation and checks do not turn indeterminate results into low scores", () => {
  expect(hasPracticeStructureDimension({ dimensions: [{ id: "correctness", name: "correctness", description: "all behavior", max_points: 100 }] })).toBe(false);
  expect(hasPracticeStructureDimension(validRubric)).toBe(true);
  const indeterminate = aggregateCalibrationSamples({
    samples: [
      { state: "indeterminate", score: 0, criteria: [], confidence: 50, reason: "incomplete scaffold" },
      { state: "indeterminate", score: 0, criteria: [], confidence: 50, reason: "incomplete scaffold" },
    ],
    rubricHash: "a".repeat(64),
    inputHash: "b".repeat(64),
    treeHash: "c".repeat(64),
  });
  expect(indeterminate.state).toBe("indeterminate");
  expect(indeterminate.score).toBeNull();
  expect(indeterminate.sample_states).toEqual(["indeterminate", "indeterminate"]);

  const results = { "public-starter": indeterminate };
  const checks = practiceAwareCalibrationChecks({
    results,
    rubricHash: "a".repeat(64),
    rubric: validRubric,
    thresholds: { referenceMin: 80, equivalentTolerance: 10, antiPatternMax: 70, antiPatternGap: 10, docsPresentMax: 70, docsPresentGap: 10 },
  });
  expect(checks.baseline_below_reference).toBe(false);
  expect(Object.values(checks).every(Boolean)).toBe(false);
});

test("registry resolves practice-aware v1 without replacing generic v2", () => {
  const practice = resolveJudgeProvider("judge-agent/practice-aware/v1");
  const generic = resolveJudgeProvider("judge-agent/generic/v2");
  expect(practice?.id).toBe("judge-agent/practice-aware");
  expect(practice?.version).toBe("v1");
  expect(generic?.id).toBe("judge-agent/generic");
  expect(generic?.version).toBe("v2");
});
