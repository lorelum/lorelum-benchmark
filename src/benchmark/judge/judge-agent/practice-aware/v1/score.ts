import { scoreCandidate as scoreCandidateOnce } from "../../generic/v2/score";

export {
  scoreCandidate,
  scorePromptText,
  scoreSystemPrompt,
  assertScoredCandidate,
} from "../../generic/v2/score";
export type { ScoredCriterion, ScoredCandidate } from "../../generic/v2/score";

/**
 * Practice-aware v1 wrapper for transient model-contract misses. It retries the
 * identical prompt when the scorer rejects a malformed response, and never
 * repairs or defaults the malformed score itself.
 */
export async function scoreCandidateWithContractRetry(
  input: Parameters<typeof scoreCandidateOnce>[0],
  attempts = 3,
): Promise<ReturnType<typeof scoreCandidateOnce>> {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("score contract retry attempts must be a positive integer");
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await scoreCandidateOnce(input);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !error.message.startsWith("Invalid judge score output: ")) throw error;
    }
  }
  throw lastError;
}
