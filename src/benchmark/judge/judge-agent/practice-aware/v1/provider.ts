import type { JudgeContext, JudgeProvider } from "../../../provider";
import type { JudgeInput } from "../../../input";
import { judgeLlmEnv, httpJudgeCompletion, type JudgeCompletion } from "./llm";
import { scoreCandidate, scorePromptText } from "./score";
import {
  assertPublicPracticeText,
  fixedRubricText,
  generatePracticeAwareRubricCached,
  parseRubricText,
} from "./rubric";

/**
 * Practice-aware LLM JudgeAgent provider v1: same fail-closed LLM rubric and
 * scoring pipeline as judge-agent/generic/v2, but rubric generation also
 * receives the candidate's declared oracle Practice text so dimensions
 * explicitly measure Practice structural discipline. The Practice text is
 * validated against the same public/private guard as buildJudgeInput.
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
      const fixed = fixedRubricText(env);
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
      const rubric = parseRubricText(input.rubric);
      return scoreCandidate({
        taskMd: input.task_md,
        candidateDiff: input.candidate_diff,
        rubric,
        rubricText: input.rubric,
        rubricHash: context.rubric_hash,
        inputHash: input.input_hash,
        judge: context.judge,
        complete: deps?.complete ?? httpJudgeCompletion(env),
      });
    },
  };
}

export const judgeAgentPracticeAwareV1Provider: JudgeProvider = createPracticeAwareJudgeProvider();
