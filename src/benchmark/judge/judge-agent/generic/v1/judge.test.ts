import { expect, test } from "bun:test";
import { sha256Text } from "../../../../fs";
import { assertJudgeResultV1 } from "../../../../outcome/v1/contract";
import { buildJudgeInput } from "../../../input";
import { judgeLlmEnv, requireJudgeLlmEnv, type JudgeCompletion } from "./llm";
import { assertGeneratedRubric, generateRubric, generateRubricCached, parseRubricText, serializeRubric } from "./rubric";
import { assertScoredCandidate, scoreCandidate, scorePromptText } from "./score";
import { createJudgeAgentProvider } from "./provider";

const taskMd = "# 更新账户资料\n\n账户资料页现在加载不出当前显示名，保存也没反应。后端接口已经通了，docs 里有接口说明；前端也已经封装好了请求，直接用。把资料加载和保存接上。接口调用和错误处理放 api 那边，组件里别堆太多逻辑。改完跑下测试。\n";
const candidateDiff = "src/LoginPage.tsx\u000012\u0000export function LoginPage() {}\n";

const validRubric = {
  dimensions: [
    { id: "component-transport-isolation", name: "transport isolation", description: "component does not own transport or read raw status", max_points: 30 },
    { id: "domain-operation-delegation", name: "delegation", description: "submit paths await an external domain operation", max_points: 25 },
    { id: "boundary-response-translation", name: "translation", description: "boundary translates success and conflict into domain results", max_points: 30 },
    { id: "raw-response-containment", name: "raw containment", description: "raw response never returns to the component", max_points: 15 },
  ],
};

function stubCompletion(results: unknown[]): JudgeCompletion & { calls: number } {
  let index = 0;
  const state = { calls: 0 };
  const fn = async () => {
    const value = results[index] ?? results[results.length - 1];
    index += 1;
    state.calls += 1;
    return value;
  };
  Object.defineProperty(fn, "calls", { get: () => state.calls });
  return fn as JudgeCompletion & { calls: number };
}

test("assertGeneratedRubric accepts a valid 100-point rubric and rejects invalid ones", () => {
  const rubric = assertGeneratedRubric(validRubric);
  expect(rubric.dimensions).toHaveLength(4);
  expect(() => assertGeneratedRubric({ dimensions: [] })).toThrow();
  expect(() => assertGeneratedRubric({ dimensions: [{ id: "a", name: "n", description: "d", max_points: 50 }, { id: "b", name: "n", description: "d", max_points: 40 }] })).toThrow();
  expect(() => assertGeneratedRubric({ dimensions: [{ id: "Bad Id", name: "n", description: "d", max_points: 100 }] })).toThrow();
});

test("generateRubric parses and hashes the serialized rubric; invalid output fails closed", async () => {
  const good = stubCompletion([validRubric]);
  const { rubric, text, hash } = await generateRubric(taskMd, good);
  expect(parseRubricText(text)).toEqual(rubric);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(await sha256Text(text)).toBe(hash);
  expect(serializeRubric(assertGeneratedRubric(validRubric))).toBe(text);

  const bad = stubCompletion([{ dimensions: [{ id: "a", name: "n", description: "d", max_points: 50 }] }]);
  await expect(generateRubric(taskMd, bad)).rejects.toThrow("total 100");
});

test("generateRubricCached reuses the rubric for the same task", async () => {
  const complete = stubCompletion([validRubric]);
  const first = await generateRubricCached(taskMd, complete);
  const second = await generateRubricCached(taskMd, complete);
  expect(first.hash).toBe(second.hash);
  expect(complete.calls).toBe(1);
});

test("scoreCandidate produces an observed judge-result with score equal to the criterion sum", async () => {
  const complete = stubCompletion([{ criteria: [
    { id: "component-transport-isolation", points: 30, rationale: "no transport in component" },
    { id: "domain-operation-delegation", points: 25, rationale: "submit awaits external op" },
    { id: "boundary-response-translation", points: 30, rationale: "conflict translated" },
    { id: "raw-response-containment", points: 15, rationale: "raw response contained" },
  ], confidence: 92 }]);
  const rubric = assertGeneratedRubric(validRubric);
  const text = serializeRubric(rubric);
  const rubricHash = await sha256Text(text);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: text });
  const result = await scoreCandidate({
    taskMd, candidateDiff, rubric, rubricText: text, rubricHash, inputHash: input.input_hash,
    judge: { id: "judge-agent/generic", version: "v1" }, complete,
  });
  assertJudgeResultV1(result);
  expect(result.state).toBe("observed");
  expect(result.score).toBe(100);
  expect(result.prompt_hash).toBe(await sha256Text(scorePromptText(taskMd, candidateDiff, text)));
  expect(result.rubric_hash).toBe(rubricHash);
  expect(result.input_hash).toBe(input.input_hash);
  expect(result.confidence).toBe(92);
});

test("scoreCandidate fails closed on missing dimension, out-of-range points, and invalid confidence", async () => {
  const rubric = assertGeneratedRubric(validRubric);
  const text = serializeRubric(rubric);
  const rubricHash = await sha256Text(text);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: text });
  const base = { taskMd, candidateDiff, rubric, rubricText: text, rubricHash, inputHash: input.input_hash, judge: { id: "j", version: "v" } };

  const missing = stubCompletion([{ criteria: [{ id: "component-transport-isolation", points: 30, rationale: "r" }], confidence: 80 }]);
  await expect(scoreCandidate({ ...base, complete: missing })).rejects.toThrow("cover every rubric dimension");

  const outOfRange = stubCompletion([{ criteria: [
    { id: "component-transport-isolation", points: 31, rationale: "r" },
    { id: "domain-operation-delegation", points: 25, rationale: "r" },
    { id: "boundary-response-translation", points: 30, rationale: "r" },
    { id: "raw-response-containment", points: 15, rationale: "r" },
  ], confidence: 80 }]);
  await expect(scoreCandidate({ ...base, complete: outOfRange })).rejects.toThrow("exceed max_points");

  const badConfidence = stubCompletion([{ criteria: [
    { id: "component-transport-isolation", points: 30, rationale: "r" },
    { id: "domain-operation-delegation", points: 25, rationale: "r" },
    { id: "boundary-response-translation", points: 30, rationale: "r" },
    { id: "raw-response-containment", points: 15, rationale: "r" },
  ], confidence: 101 }]);
  await expect(scoreCandidate({ ...base, complete: badConfidence })).rejects.toThrow("confidence");
});

test("scoreCandidate returns an indeterminate judge-result with reason when the LLM cannot judge", async () => {
  const complete = stubCompletion([{ state: "indeterminate", reason: "candidate missing required files", confidence: 40 }]);
  const rubric = assertGeneratedRubric(validRubric);
  const text = serializeRubric(rubric);
  const input = await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: text });
  const result = await scoreCandidate({
    taskMd, candidateDiff, rubric, rubricText: text, rubricHash: await sha256Text(text), inputHash: input.input_hash,
    judge: { id: "judge-agent/generic", version: "v1" }, complete,
  });
  assertJudgeResultV1(result);
  expect(result.state).toBe("indeterminate");
  expect(result.score).toBe(0);
  expect(result.reason).toContain("missing required files");
});

test("assertScoredCandidate validates shape", () => {
  expect(assertScoredCandidate({ criteria: [{ id: "a", points: 1, rationale: "r" }], confidence: 50 }).state).toBe("observed");
  expect(assertScoredCandidate({ state: "indeterminate", reason: "r", confidence: 50 }).state).toBe("indeterminate");
  expect(() => assertScoredCandidate({ criteria: [], confidence: 50 })).toThrow();
  expect(() => assertScoredCandidate({ state: "indeterminate", confidence: 50 })).toThrow();
  expect(() => assertScoredCandidate({ criteria: [{ id: "a", points: 1, rationale: "r" }], confidence: -1 })).toThrow();
});

test("judgeLlmEnv and requireJudgeLlmEnv enforce opt-in and required config", () => {
  expect(judgeLlmEnv({}).real).toBe(false);
  expect(judgeLlmEnv({ LORELUM_JUDGE_REAL: "1" }).real).toBe(true);
  expect(() => requireJudgeLlmEnv(judgeLlmEnv({ LORELUM_JUDGE_REAL: "1" }))).toThrow("required when");
  const ok = requireJudgeLlmEnv(judgeLlmEnv({ LORELUM_JUDGE_REAL: "1", LORELUM_JUDGE_BASE_URL: "https://x", LORELUM_JUDGE_API_KEY: "k", LORELUM_JUDGE_MODEL: "m" }));
  expect(ok.model).toBe("m");
});

test("provider fails closed without opt-in and requires task context for rubric generation", async () => {
  const provider = createJudgeAgentProvider({});
  await expect(provider.rubricText()).rejects.toThrow("LORELUM_JUDGE_REAL");
  await expect(provider.score(
    await buildJudgeInput({ task_md: taskMd, candidate_diff: candidateDiff, rubric: "rubric" }),
    { judge: { id: "j", version: "v" }, prompt: "p", prompt_hash: "a".repeat(64), rubric_hash: "b".repeat(64) },
  )).rejects.toThrow("LORELUM_JUDGE_REAL");
});

test("buildJudgeInput rejects private material before any provider call", async () => {
  await expect(buildJudgeInput({ task_md: taskMd, candidate_diff: "private/evaluator/evaluate.ts", rubric: "r" })).rejects.toThrow("judge input rejected");
});