import type { JudgeContext, JudgeProvider } from "../../../provider";
import type { JudgeInput } from "../../../input";
import { judgeLlmEnv, httpJudgeCompletion } from "./llm";
import { generateRubricCached, parseRubricText } from "./rubric";
import { scoreCandidate, scorePromptText } from "./score";

/** Repo-level generic LLM JudgeAgent provider. Real LLM calls require LORELUM_JUDGE_REAL=1; otherwise it fails closed. */
export function createJudgeAgentProvider(
  env: Record<string, string | undefined> = Bun.env,
): JudgeProvider {
  return {
    id: "judge-agent/generic",
    version: "v1",
    async rubricText(input?) {
      if (!judgeLlmEnv(env).real) throw new Error("judge-agent/generic/v1 requires LORELUM_JUDGE_REAL=1");
      if (!input?.task_md) throw new Error("judge-agent/generic/v1 rubric generation requires task_md");
      const { text } = await generateRubricCached(input.task_md, httpJudgeCompletion(env));
      return text;
    },
    async promptFor(input: JudgeInput): Promise<string> {
      return scorePromptText(input.task_md, input.candidate_diff, input.rubric);
    },
    async score(input: JudgeInput, context: JudgeContext) {
      if (!judgeLlmEnv(env).real) throw new Error("judge-agent/generic/v1 requires LORELUM_JUDGE_REAL=1");
      const rubric = parseRubricText(input.rubric);
      return scoreCandidate({
        taskMd: input.task_md,
        candidateDiff: input.candidate_diff,
        rubric,
        rubricText: input.rubric,
        rubricHash: context.rubric_hash,
        inputHash: input.input_hash,
        judge: context.judge,
        complete: httpJudgeCompletion(env),
      });
    },
  };
}

export const judgeAgentGenericV1Provider: JudgeProvider = createJudgeAgentProvider();
