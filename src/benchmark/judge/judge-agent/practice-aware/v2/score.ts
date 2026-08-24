import { sha256Text } from "../../../../fs";
import { assertJudgeResultV1, type JudgeResultV1 } from "../../../../outcome/v1/contract";
import { buildJudgeInput } from "../../../input";
import type { JudgeCompletion } from "../v1/llm";
import type { PracticeAwareRubric } from "../v1/rubric";
import {
  assertStructureFactExtraction,
  deriveDimensionLabels,
  labelCriteria,
  structureFactSystemPrompt,
  structureFactUserPrompt,
  type DimensionId,
  type DimensionLabel,
  type StructureFactExtraction,
} from "./structure-facts";

export type StructureAwareScoreInput = {
  taskMd: string;
  candidateDiff: string;
  rubric: PracticeAwareRubric;
  rubricText: string;
  rubricHash: string;
  inputHash: string;
  judge: { id: string; version: string };
  complete: JudgeCompletion;
};

export type StructureAwareScore = {
  result: JudgeResultV1;
  extraction: StructureFactExtraction;
  dimension_labels: Record<DimensionId, DimensionLabel>;
};

export async function scoreStructureAwareCandidate(input: StructureAwareScoreInput): Promise<StructureAwareScore> {
  const system = structureFactSystemPrompt();
  const prompt = structureFactUserPrompt(input.taskMd, input.candidateDiff);
  const parsed = (await input.complete(system, prompt)) as unknown;
  const extraction = assertStructureFactExtraction(parsed, input.candidateDiff);
  const labels = deriveDimensionLabels(extraction);
  const criteria = labelCriteria(labels, extraction, input.rubric);
  const result = await assertJudgeResultV1({
    schema_version: "judge-result/v1",
    judge_version: 1,
    judge: input.judge,
    state: "observed",
    score: criteria.reduce((sum, criterion) => sum + criterion.points, 0),
    criteria,
    prompt_hash: await sha256Text(system + "\n" + prompt),
    rubric_hash: input.rubricHash,
    input_hash: input.inputHash,
    confidence: extraction.confidence,
  });
  return { result, extraction, dimension_labels: labels };
}

export async function scoreStructureAwareWithRetry(input: StructureAwareScoreInput, attempts = 3): Promise<StructureAwareScore> {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("structure-aware score retry attempts must be a positive integer");
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await scoreStructureAwareCandidate(input);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !error.message.startsWith("Invalid structure fact output: ")) throw error;
    }
  }
  throw lastError;
}

export { buildJudgeInput };
