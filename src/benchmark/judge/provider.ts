import type { JudgeResultV1 } from "../outcome/v1/contract";
import type { JudgeInput, PublicRunMaterial } from "./input";

export type JudgeContext = {
  judge: { id: string; version: string };
  prompt: string;
  prompt_hash: string;
  rubric_hash: string;
};

/** Optional task context passed to rubricText for per-task rubric generation. */
export type JudgeRubricContext = {
  task_md: string;
  /** Optional declared Practice text used by practice-aware rubric generation. */
  practice_text?: string;
  /** Candidate-declared fixed rubric text, verified by the runner/calibrator before this call. */
  fixed_rubric_text?: string;
  material?: PublicRunMaterial[];
};

export type JudgeProvider = {
  id: string;
  version: string;
  /**
   * The rubric text this provider scores against (used for input hashing).
   * Providers that generate the rubric per task MAY use the optional context;
   * static providers ignore it.
   */
  rubricText(input?: JudgeRubricContext): Promise<string>;
  score(input: JudgeInput, context: JudgeContext): Promise<JudgeResultV1>;
  /** Optional: provider-specific scoring prompt construction. Defaults to the runner static prompt when absent. */
  promptFor?(input: JudgeInput, rubric: string): Promise<string>;
};
