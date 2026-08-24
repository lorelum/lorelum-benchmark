import type { JudgeContext, JudgeProvider } from "../../../provider";
import type { JudgeInput } from "../../../input";
import { judgeLlmEnv, httpJudgeCompletion, type JudgeCompletion } from "./llm";
import {
  scoreGenericWithContractRetry,
  scorePracticeAwareWithContractRetry,
  scorePromptText,
} from "./score";
import {
  assertGeneratedRubric,
  assertPracticeAwareRubric,
  assertPublicPracticeText,
  fixedRubricText,
  generatePracticeAwareRubricCached,
  type MaybePracticeAwareRubric,
} from "./rubric";

function parseScoreRubric(text: string): MaybePracticeAwareRubric {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid practice-aware rubric JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("practice-aware rubric must be an object");
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.dimensions) || root.dimensions.length === 0) throw new Error("practice-aware rubric requires dimensions");
  const anchored = root.dimensions.map((dimension) =>
    Boolean(dimension) && typeof dimension === "object" && !Array.isArray(dimension) &&
    Boolean((dimension as Record<string, unknown>).scoring_anchors),
  );
  if (anchored.every(Boolean)) return assertPracticeAwareRubric(parsed);
  if (anchored.some(Boolean)) throw new Error("practice-aware rubric cannot mix anchored and unanchored dimensions");
  return assertGeneratedRubric(parsed);
}

/**
 * Practice-aware LLM JudgeAgent provider v1. Generic behavior remains available
 * when no Practice input produced the rubric; a Practice/fixed rubric carries
 * binding full/partial/zero anchors and is scored by the stricter v1 contract.
 */
export function createPracticeAwareJudgeProvider(
  env: Record<string, string | undefined> = Bun.env,
  deps?: { complete?: JudgeCompletion },
): JudgeProvider {
  return {
    id: "judge-agent/practice-aware",
    version: "v1",
    async rubricText(input?) {
      const practiceText = input?.practice_text?.trim() ? input.practice_text : undefined;
      if (practiceText) assertPublicPracticeText(practiceText);
      const declaredFixed = input?.fixed_rubric_text;
      if (declaredFixed !== undefined && typeof declaredFixed !== "string") throw new Error("fixed_rubric_text must be text");
      const fixed = declaredFixed ?? fixedRubricText(env);
      if (!fixed && !judgeLlmEnv(env).real) throw new Error("judge-agent/practice-aware/v1 requires LORELUM_JUDGE_REAL=1 or LORELUM_JUDGE_RUBRIC_TEXT");
      if (!input?.task_md) throw new Error("judge-agent/practice-aware/v1 rubric generation requires task_md");
      const complete = fixed
        ? (async () => {
            throw new Error("fixed rubric does not call the LLM");
          }) as ReturnType<typeof httpJudgeCompletion>
        : deps?.complete ?? httpJudgeCompletion(env);
      const { text } = await generatePracticeAwareRubricCached(input.task_md, practiceText, complete, env);
      return text;
    },
    async promptFor(input: JudgeInput): Promise<string> {
      return scorePromptText(input.task_md, input.candidate_diff, input.rubric);
    },
    async score(input: JudgeInput, context: JudgeContext) {
      if (!judgeLlmEnv(env).real) throw new Error("judge-agent/practice-aware/v1 requires LORELUM_JUDGE_REAL=1");
      const rubric = parseScoreRubric(input.rubric);
      const shared = {
        taskMd: input.task_md,
        candidateDiff: input.candidate_diff,
        rubricText: input.rubric,
        rubricHash: context.rubric_hash,
        inputHash: input.input_hash,
        judge: context.judge,
        complete: deps?.complete ?? httpJudgeCompletion(env),
      };
      if (rubric.dimensions.some((dimension) => "scoring_anchors" in dimension)) return scorePracticeAwareWithContractRetry({ ...shared, rubric: rubric });
      return scoreGenericWithContractRetry({ ...shared, rubric });
    },
  };
}

export const judgeAgentPracticeAwareV1Provider: JudgeProvider = createPracticeAwareJudgeProvider();
