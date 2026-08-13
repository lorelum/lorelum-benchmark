import type { JudgeResultV1 } from "../outcome/v1/contract";
import type { JudgeContext, JudgeProvider } from "./provider";
import type { JudgeInput } from "./input";
import { mockJudgeProvider } from "./mock";
import { judgeAgentGenericV1Provider } from "./judge-agent/generic/v1/provider";
import { judgeAgentGenericV2Provider } from "./judge-agent/generic/v2/provider";
import { loadRubric } from "./practice-layered-api/v2/rubric";
import { scoreSourceV2 } from "./practice-layered-api/v2/score";
import { sourceMapFromDiff } from "./source-map";

/** login Practice judge v2 as a deterministic local judge provider. */
export const practiceLayeredApiV2Provider: JudgeProvider = {
  id: "practice-layered-api",
  version: "2.0.0",
  async rubricText(): Promise<string> {
    return (await loadRubric()).text;
  },
  async score(input: JudgeInput, context: JudgeContext): Promise<JudgeResultV1> {
    const files = sourceMapFromDiff(input.candidate_diff);
    const { text: rubricText, doc } = await loadRubric();
    return scoreSourceV2({
      files,
      taskMd: input.task_md,
      candidateDiff: input.candidate_diff,
      rubricText,
      doc,
      inputHash: input.input_hash,
    });
  },
};

export const judgeProviders: Record<string, JudgeProvider> = {
  "mock-judge": mockJudgeProvider,
  "practice-layered-api/v2": practiceLayeredApiV2Provider,
  "judge-agent/generic/v1": judgeAgentGenericV1Provider,
  "judge-agent/generic/v2": judgeAgentGenericV2Provider,
};

export function resolveJudgeProvider(id: string): JudgeProvider | undefined {
  return judgeProviders[id];
}
