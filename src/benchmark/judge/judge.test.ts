import { expect, test } from "bun:test";
import { sha256Text } from "../fs";
import { assertJudgeResultV1 } from "../outcome/v1/contract";
import { buildJudgeInput, isAllowedPublicPath, looksPrivate, redactedReason } from "./input";
import { mockJudgeProvider, mockContext } from "./mock";
import { classifyProviderResult, notRun, unavailable } from "./classify";

const publicTask = "Login page shows a welcome message after a successful login.\n";
const candidateDiff = "diff --git a/src/App.tsx b/src/App.tsx\n+export function App() { return <div>welcome</div>; }\n";
const rubric = "Layering: components must not own transport. Error handling: domain errors at the boundary.\n";

test("public-only input builds a valid allowlisted bundle", async () => {
  const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric });
  expect(input.input_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(looksPrivate(input.task_md)).toBe(false);
});

test("legitimate public text mentioning Oracle Database is allowed", async () => {
  const input = await buildJudgeInput({
    task_md: "The service persists data in Oracle Database and exposes a public REST API.\n",
    candidate_diff: candidateDiff,
    rubric
  });
  expect(input.input_hash).toMatch(/^[a-f0-9]{64}$/);
});

test("known private markers in string fields are rejected", async () => {
  for (const bad of [
    "private/evaluator/evaluate.ts",
    "condition_id: oracle-practice",
    "practice payload: layered design",
    "private/calibration/fixtures.yaml",
    "oracle/oracle.yaml"
  ]) {
    await expect(buildJudgeInput({ task_md: publicTask, candidate_diff: bad, rubric })).rejects.toThrow("judge input rejected");
    await expect(buildJudgeInput({ task_md: bad, candidate_diff: candidateDiff, rubric })).rejects.toThrow("judge input rejected");
  }
});

test("material must resolve inside a public root and exist", async () => {
  // A private path inside the workspace but not under public/ is rejected.
  await expect(buildJudgeInput({
    task_md: publicTask,
    candidate_diff: candidateDiff,
    rubric,
    material: [{ path: "private/evaluator", kind: "candidate-source" }]
  })).rejects.toThrow("judge input rejected");
  // A path escaping the workspace is rejected.
  await expect(buildJudgeInput({
    task_md: publicTask,
    candidate_diff: candidateDiff,
    rubric,
    material: [{ path: "../../private/oracle.yaml", kind: "declared-public" }]
  })).rejects.toThrow("judge input rejected");
  // A declared-public marker still requires an allowlisted path.
  await expect(buildJudgeInput({
    task_md: publicTask,
    candidate_diff: candidateDiff,
    rubric,
    material: [{ path: "private/oracle.yaml", kind: "declared-public" }]
  })).rejects.toThrow("judge input rejected");
  // A real file under an existing public root is allowed and hashed.
  const input = await buildJudgeInput({
    task_md: publicTask,
    candidate_diff: candidateDiff,
    rubric,
    material: [{ path: "src/benchmark/kernel/fixtures/neutral/public/starter/src/index.ts", kind: "candidate-source" }]
  });
  expect(input.material[0].content).toBeTruthy();
  const input2 = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric });
  expect(input.input_hash).not.toBe(input2.input_hash);
});

test("isAllowedPublicPath enforces the workspace boundary", () => {
  expect(isAllowedPublicPath("src/benchmark/kernel/fixtures/neutral/public/starter/src/index.ts").allowed).toBe(true);
  expect(isAllowedPublicPath("private/evaluator").allowed).toBe(false);
  expect(isAllowedPublicPath("../../etc/passwd").allowed).toBe(false);
});

test("redaction hides the matched token while keeping the reason readable", () => {
  const reason = redactedReason("material outside allowlist: private/evaluator path");
  expect(reason).toContain("[redacted]");
  expect(reason).not.toContain("private/evaluator");
  expect(reason).toContain("material outside allowlist");
});

test("mock provider returns a provenance-complete, schema-conforming result", async () => {
  const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric });
  const context = await mockContext(input);
  const result = await mockJudgeProvider.score(input, context);
  expect(assertJudgeResultV1(result).state).toBe("observed");
  expect(result.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.rubric_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.input_hash).toBe(input.input_hash);
  expect(result.judge).toEqual({ id: "mock-judge", version: "0.1.0" });
  expect(result.criteria.reduce((sum, c) => sum + c.points, 0)).toBe(result.score);
  expect(result.criteria.every((c) => c.rationale && c.rationale.length > 0)).toBe(true);
});

test("mock provider is deterministic for the same input", async () => {
  const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric });
  const context = await mockContext(input);
  const first = await mockJudgeProvider.score(input, context);
  const second = await mockJudgeProvider.score(input, context);
  expect(first.score).toBe(second.score);
  expect(first.criteria.map((c) => c.points)).toEqual(second.criteria.map((c) => c.points));
});

test("mock score is driven by the rubric text", async () => {
  const inputA = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric: "Rubric A\n" });
  const inputB = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric: "Rubric B completely different\n" });
  const contextA = await mockContext(inputA);
  const contextB = await mockContext(inputB);
  const scoreA = (await mockJudgeProvider.score(inputA, contextA)).score;
  const scoreB = (await mockJudgeProvider.score(inputB, contextB)).score;
  expect(scoreA).not.toBe(scoreB);
});

test("missing hashes fail closed instead of fabricating a low score", async () => {
  const result = classifyProviderResult({ schema_version: "judge-result/v1", judge_version: 1, judge: { id: "mock", version: "1" }, state: "observed", score: 0, criteria: [], confidence: 10 });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.state).toBe("judge-unavailable");
    expect(result.reason).toContain("provenance hash is missing or invalid");
  }
});

test("invalid structured output fails closed", async () => {
  const result = classifyProviderResult("not json");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.state).toBe("judge-unavailable");
});

test("unavailable and not-run preserve audit reasons without fabricating a score", () => {
  const unavailableOutcome = unavailable("provider timeout");
  expect(unavailableOutcome.ok).toBe(false);
  if (!unavailableOutcome.ok) {
    expect(unavailableOutcome.state).toBe("judge-unavailable");
    expect(unavailableOutcome.reason).toBe("provider timeout");
  }
  const notRunOutcome = notRun("judge disabled for this run");
  expect(notRunOutcome.ok).toBe(false);
  if (!notRunOutcome.ok) {
    expect(notRunOutcome.state).toBe("not-run");
    expect(notRunOutcome.reason).toBe("judge disabled for this run");
  }
});

test("low judge score is a soft signal separate from semantic completion", async () => {
  const input = await buildJudgeInput({ task_md: publicTask, candidate_diff: candidateDiff, rubric });
  const context = await mockContext(input);
  const result = await mockJudgeProvider.score(input, context);
  expect(result.state).toBe("observed");
  expect(typeof result.score).toBe("number");
  // A judge score never carries a semantic hard-gate field.
  expect("semantic" in result).toBe(false);
});

test("hashes can be derived from rubric text", async () => {
  const hash = await sha256Text(rubric);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
});