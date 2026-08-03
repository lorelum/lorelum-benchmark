import { sha256Text } from "../fs";
import { assertJudgeResultV1, type JudgeResultV1 } from "../outcome/v1/contract";
import type { JudgeContext, JudgeProvider } from "./provider";
import type { JudgeInput } from "./input";

function digest(input: string): number {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function stableScore(input: JudgeInput, rubric: string): { points: number; max_points: number; rationale: string }[] {
  const base = digest(`${input.input_hash}\0${rubric}`);
  const layering = base % 61;
  const boundary = (base >>> 4) % 41;
  return [
    { id: "layering", points: layering, max_points: 60, rationale: "mock layering score" },
    { id: "error-boundary", points: boundary, max_points: 40, rationale: "mock error-boundary score" }
  ];
}

export const mockJudgeProvider: JudgeProvider = {
  id: "mock-judge",
  version: "0.1.0",
  async score(input: JudgeInput, context: JudgeContext): Promise<JudgeResultV1> {
    const criteria = stableScore(input, input.rubric);
    const score = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
    const confidence = 90;
    return assertJudgeResultV1({
      schema_version: "judge-result/v1",
      judge_version: 1,
      judge: { id: context.judge.id, version: context.judge.version },
      state: "observed",
      score,
      criteria,
      prompt_hash: context.prompt_hash,
      rubric_hash: context.rubric_hash,
      input_hash: input.input_hash,
      confidence
    });
  }
};

export async function mockContext(input: JudgeInput): Promise<JudgeContext> {
  const prompt = "Score candidate quality against the rubric. Return structured results only.";
  return {
    judge: { id: "mock-judge", version: "0.1.0" },
    prompt,
    prompt_hash: await sha256Text(prompt),
    rubric_hash: await sha256Text(input.rubric)
  };
}