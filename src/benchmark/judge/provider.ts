import type { JudgeResultV1 } from "../outcome/v1/contract";
import type { JudgeInput } from "./input";

export type JudgeContext = {
  judge: { id: string; version: string };
  prompt: string;
  prompt_hash: string;
  rubric_hash: string;
};

export type JudgeProvider = {
  id: string;
  version: string;
  /** The rubric text this provider scores against (used for input hashing). */
  rubricText(): Promise<string>;
  score(input: JudgeInput, context: JudgeContext): Promise<JudgeResultV1>;
};