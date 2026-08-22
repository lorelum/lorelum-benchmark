import { sha256Text } from "../../../../fs";
import { looksPrivate, redactedReason } from "../../../input";
import {
  assertGeneratedRubric,
  fixedRubricText,
  parseRubricText,
  rubricUserPrompt,
  generateRubric as generateGenericRubric,
  generateRubricCached as generateGenericRubricCached,
  serializeRubric,
  type GeneratedRubric,
} from "../../generic/v2/rubric";
import type { JudgeCompletion } from "../../generic/v2/llm";

export { assertGeneratedRubric, fixedRubricText, parseRubricText, rubricUserPrompt, serializeRubric };
export type { GeneratedRubric, GeneratedRubricDimension } from "../../generic/v2/rubric";

/**
 * Practice-aware rubric designer system prompt. When a Practice text is
 * provided the rubric MUST explicitly measure adherence to the structural
 * disciplines the Practice declares, in addition to observable task behavior.
 */
export function practiceAwareRubricSystemPrompt(): string {
  return [
    "You are a benchmark rubric designer. Read the coding task and, when provided, the Practice text.",
    "When Practice text is provided, the rubric MUST explicitly measure adherence to the structural disciplines the Practice declares (for example transport-isolation, boundary-translation, raw-response-containment, domain-delegation, policy-centralization, budget-atomicity), selecting the ones that actually apply to this task. The rubric must distinguish a candidate that only implements observable behavior from one that follows the Practice structure, so functional completeness alone cannot earn full points.",
    "When no Practice text is provided, behave exactly like the generic rubric designer for the coding task alone.",
    "Return ONLY a JSON object with this exact shape:",
    '{"dimensions":[{"id":"kebab-case-id","name":"short name","description":"what quality this dimension measures and what concrete observable evidence satisfies it","max_points":30}]}',
    "Rules: 1 to 6 dimensions; max_points are positive integers summing to 100; ids are kebab-case [a-z0-9-]; descriptions are concrete and evidence-based, not tied to file names or private details; do not copy instructions verbatim - adapt them to this task.",
  ].join("\n");
}

export function practiceAwareRubricUserPrompt(taskMd: string, practiceText?: string): string {
  if (!practiceText?.trim()) return rubricUserPrompt(taskMd);
  return `Coding task:\n\n${taskMd}\n\nPractice text:\n\n${practiceText}`;
}

/** Practice text must pass the same public/private guard as buildJudgeInput. */
export function assertPublicPracticeText(practiceText: string): void {
  if (looksPrivate(practiceText)) {
    throw new Error(redactedReason("practice_text contains known private markers"));
  }
}

export async function generatePracticeAwareRubric(
  taskMd: string,
  practiceText: string | undefined,
  complete: JudgeCompletion,
): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  if (!practiceText?.trim()) return generateGenericRubric(taskMd, complete);
  const parsed = (await complete(practiceAwareRubricSystemPrompt(), practiceAwareRubricUserPrompt(taskMd, practiceText))) as unknown;
  const rubric = assertGeneratedRubric(parsed);
  const text = serializeRubric(rubric);
  return { rubric, text, hash: await sha256Text(text) };
}

const practiceRubricCache = new Map<string, Promise<{ rubric: GeneratedRubric; text: string; hash: string }>>();

export async function generatePracticeAwareRubricCached(
  taskMd: string,
  practiceText: string | undefined,
  complete: JudgeCompletion,
  env: Record<string, string | undefined> = Bun.env,
): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  const fixed = fixedRubricText(env);
  if (!fixed && !practiceText?.trim()) return generateGenericRubricCached(taskMd, complete, env);
  const key = await sha256Text(fixed ? `${taskMd}\0${fixed}` : `${taskMd}\0${practiceText ?? ""}`);
  let pending = practiceRubricCache.get(key);
  if (!pending) {
    pending = fixed
      ? (async () => {
          const rubric = parseRubricText(fixed);
          const text = serializeRubric(rubric);
          return { rubric, text, hash: await sha256Text(text) };
        })()
      : generatePracticeAwareRubric(taskMd, practiceText, complete);
    practiceRubricCache.set(key, pending);
  }
  return pending;
}
