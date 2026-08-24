import { expect, test } from "bun:test";
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
  practiceAwareRubricSystemPrompt,
  practiceAwareRubricUserPrompt,
} from "./rubric";
import type { JudgeCompletion } from "./llm";

const taskMd = "# Gateway task\n\nAdd Nebula, fallback, tenant budget, idempotency, and stream failure accounting.\n";
const practiceText = "# Provider gateway practice\n\n1. Keep transport in adapters and cross-cutting policy in one boundary module.\n2. Handlers only parse requests and delegate.\n";
const validRubric = {
  dimensions: [
    { id: "policy-centralization", name: "policy centralization", description: "fallback retry budget idempotency and metering centralized", max_points: 40 },
    { id: "transport-isolation", name: "transport isolation", description: "handlers do not own provider transport", max_points: 20 },
    { id: "provider-protocol-mapping", name: "protocol mapping", description: "pseudo-compatible provider translated by wire contract", max_points: 20 },
    { id: "correctness", name: "correctness", description: "observable behaviors implemented", max_points: 20 },
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

test("practice-aware prompts include task and Practice structure requirements", () => {
  const user = practiceAwareRubricUserPrompt(taskMd, practiceText);
  expect(user).toContain(taskMd);
  expect(user).toContain("Practice text:");
  expect(user).toContain(practiceText);
  expect(practiceAwareRubricSystemPrompt()).toContain("MUST explicitly measure adherence to the structural disciplines");
  expect(practiceAwareRubricUserPrompt(taskMd)).toBe(rubricUserPrompt(taskMd));
});

test("generatePracticeAwareRubric validates, serializes, hashes, and fails closed", async () => {
  const good = stubCompletion([validRubric]);
  const result = await generatePracticeAwareRubric(taskMd, practiceText, good);
  expect(result.rubric.dimensions).toHaveLength(4);
  expect(result.hash).toBe(await sha256Text(result.text));
  expect(good.captured()[0]?.user).toContain(practiceText);

  const bad = stubCompletion([{ dimensions: [{ id: "a", name: "n", description: "d", max_points: 40 }] }]);
  await expect(generatePracticeAwareRubric(taskMd, practiceText, bad)).rejects.toThrow("total 100");
});

test("practice rubric generation caches per task and Practice input; no Practice reuses generic behavior", async () => {
  const complete = stubCompletion([validRubric]);
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

test("provider passes Practice text to rubric generation and validates structure", async () => {
  const complete = stubCompletion([validRubric]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  const text = await provider.rubricText({ task_md: `${taskMd} provider-a`, practice_text: practiceText });
  expect(text).toBe(serializeRubric(validRubric));
  expect(complete.captured()[0]?.user).toContain(practiceText);

  const genericComplete = stubCompletion([validRubric]);
  const genericProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete: genericComplete });
  await genericProvider.rubricText({ task_md: `${taskMd} provider-b` });
  expect(genericComplete.captured()[0]?.system).toBe(rubricSystemPrompt());
  expect(genericComplete.captured()[0]?.user).toBe(rubricUserPrompt(`${taskMd} provider-b`));
});

test("provider supports fixed rubrics and fails closed without task context or opt-in", async () => {
  const fixed = serializeRubric(validRubric);
  const fixedProvider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_RUBRIC_TEXT: fixed });
  expect(await fixedProvider.rubricText({ task_md: taskMd, practice_text: practiceText })).toBe(fixed);

  const provider = createPracticeAwareJudgeProvider({});
  await expect(provider.rubricText({ task_md: taskMd })).rejects.toThrow("LORELUM_JUDGE_REAL");
  const real = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" });
  await expect(real.rubricText({ practice_text: practiceText })).rejects.toThrow("task_md");
});

test("private Practice input is rejected before any completion call", async () => {
  const complete = stubCompletion([validRubric]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  await expect(provider.rubricText({ task_md: taskMd, practice_text: "see oracle/ and private/evaluator/" })).rejects.toThrow("judge input rejected");
  expect(complete.captured()).toHaveLength(0);
  expect(() => assertPublicPracticeText("condition_id: oracle-practice")).toThrow("judge input rejected");
});

test("provider scores through the shared v2 pipeline with judge-result/v1 output", async () => {
  const rubricText = serializeRubric(validRubric);
  const input = await buildJudgeInput({
    task_md: taskMd,
    candidate_diff: "src/server.ts\016\export const handler = 'delegates';\n",
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

test("score retries an identical prompt after a malformed model contract response", async () => {
  const rubricText = serializeRubric(validRubric);
  const valid = {
    criteria: validRubric.dimensions.map((dimension) => ({ id: dimension.id, points: dimension.max_points, rationale: "concrete evidence" })),
    confidence: 91,
  };
  const complete = stubCompletion([{ criteria: valid.criteria }, valid]);
  const provider = createPracticeAwareJudgeProvider({ LORELUM_JUDGE_REAL: "1" }, { complete });
  const result = await provider.score({
    task_md: taskMd,
    candidate_diff: "src/server.ts\016\export const handler = 'delegates';\n",
    rubric: rubricText,
    input_hash: "b".repeat(64),
  }, {
    judge: { id: provider.id, version: provider.version },
    prompt: "prompt",
    prompt_hash: "a".repeat(64),
    rubric_hash: await sha256Text(rubricText),
  });
  expect(result.score).toBe(100);
  const [first, second] = complete.captured();
  expect(second?.system).toBe(first?.system);
  expect(second?.user).toBe(first?.user);
  expect(complete.captured()).toHaveLength(2);
});

test("registry resolves practice-aware v1 without replacing generic v2", () => {
  const practice = resolveJudgeProvider("judge-agent/practice-aware/v1");
  const generic = resolveJudgeProvider("judge-agent/generic/v2");
  expect(practice?.id).toBe("judge-agent/practice-aware");
  expect(practice?.version).toBe("v1");
  expect(generic?.id).toBe("judge-agent/generic");
  expect(generic?.version).toBe("v2");
});
