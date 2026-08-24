import { sha256Text } from "../../../../fs";
import { looksPrivate, redactedReason } from "../../../input";
import {
  assertGeneratedRubric,
  fixedRubricText,
  rubricUserPrompt,
  generateRubric as generateGenericRubric,
  generateRubricCached as generateGenericRubricCached,
  serializeRubric,
  type GeneratedRubric,
} from "../../generic/v2/rubric";
import type { JudgeCompletion } from "../../generic/v2/llm";

export { assertGeneratedRubric, fixedRubricText, rubricUserPrompt, serializeRubric };
export type { GeneratedRubric, GeneratedRubricDimension } from "../../generic/v2/rubric";

export type PracticeAwareScoringAnchors = {
  full: string[];
  partial: string[];
  zero: string[];
};

export type PracticeAwareRubricDimension = GeneratedRubricDimension & {
  scoring_anchors: PracticeAwareScoringAnchors;
};

export type PracticeAwareRubric = {
  dimensions: PracticeAwareRubricDimension[];
};

export type MaybePracticeAwareRubric = GeneratedRubric | PracticeAwareRubric;

function fail(message: string): never {
  throw new Error(`Invalid practice-aware judge rubric: ${message}`);
}

function requiredAnchorList(value: unknown, dimensionId: string, kind: keyof PracticeAwareScoringAnchors): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    fail(`dimension ${dimensionId} scoring_anchors.${kind} must contain 1-6 entries`);
  }
  const anchors: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || raw.trim().length < 8 || raw.length > 500) {
      fail(`dimension ${dimensionId} scoring_anchors.${kind} entries must be 8-500 character strings`);
    }
    const anchor = raw.trim();
    if (seen.has(anchor)) fail(`dimension ${dimensionId} has a duplicate ${kind} anchor`);
    seen.add(anchor);
    anchors.push(anchor);
  }
  return anchors;
}

/** Parses and validates the practice-aware extension without changing generic/v2. */
export function assertPracticeAwareRubric(value: unknown): PracticeAwareRubric {
  const base = assertGeneratedRubric(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const rawRoot = value as Record<string, unknown>;
  if (!Array.isArray(rawRoot.dimensions)) fail("dimensions must be an array");
  const dimensions = base.dimensions.map((dimension, index) => {
    const raw = rawRoot.dimensions[index] as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`dimension ${dimension.id} must be an object`);
    const rawAnchors = raw.scoring_anchors;
    if (!rawAnchors || typeof rawAnchors !== "object" || Array.isArray(rawAnchors)) {
      fail(`dimension ${dimension.id} requires scoring_anchors`);
    }
    const anchors = rawAnchors as Record<string, unknown>;
    return {
      ...dimension,
      scoring_anchors: {
        full: requiredAnchorList(anchors.full, dimension.id, "full"),
        partial: requiredAnchorList(anchors.partial, dimension.id, "partial"),
        zero: requiredAnchorList(anchors.zero, dimension.id, "zero"),
      },
    };
  });
  return { dimensions };
}

/** Canonical anchor-inclusive serialization used for hashes and scorer prompts. */
export function serializePracticeAwareRubric(rubric: PracticeAwareRubric): string {
  return JSON.stringify({
    dimensions: rubric.dimensions.map((dimension) => ({
      id: dimension.id,
      name: dimension.name,
      description: dimension.description,
      max_points: dimension.max_points,
      scoring_anchors: {
        full: dimension.scoring_anchors.full,
        partial: dimension.scoring_anchors.partial,
        zero: dimension.scoring_anchors.zero,
      },
    })),
  });
}

export function parsePracticeAwareRubricText(text: string): PracticeAwareRubric {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return assertPracticeAwareRubric(parsed);
}

/**
 * Practice-aware rubric designer system prompt. Structural dimensions must
 * carry explicit full/partial/zero anchors so functional completeness cannot
 * be mistaken for structural ownership.
 */
export function practiceAwareRubricSystemPrompt(): string {
  return [
    "You are a benchmark rubric designer. Read the coding task and, when provided, the Practice text.",
    "When Practice text is provided, every rubric MUST explicitly measure adherence to the structural disciplines the Practice declares (for example transport-isolation, boundary-translation, raw-response-containment, domain-delegation, policy-centralization, budget-atomicity), selecting the ones that actually apply to this task.",
    "Each dimension MUST contain concrete scoring_anchors. Full anchors are jointly required for full points. Partial anchors describe a major structural omission or scattered ownership and must cap that dimension at half credit. Zero anchors describe missing or contrary structure and require zero credit. Functional tests cannot satisfy an unmet structural anchor.",
    "For a cross-request backend policy dimension, full ownership means the HTTP handler only parses/validates requests, delegates to non-HTTP policy/ledger boundaries, and serializes responses; retry/fallback, budget, idempotency, and metering ownership must not remain in the handler or transport adapter. Extracting only retry/fallback while handler/config/store/executor split the remaining cross-request policy ownership is partial, not full.",
    "When no Practice text is provided, behave exactly like the generic rubric designer for the coding task alone.",
    "Return ONLY a JSON object with this exact shape:",
    '{"dimensions":[{"id":"kebab-case-id","name":"short name","description":"what quality this dimension measures and what concrete observable evidence satisfies it","max_points":30,"scoring_anchors":{"full":["jointly required condition"],"partial":["major structural omission"],"zero":["missing or contrary structure"]}}]}',
    "Rules: 1 to 6 dimensions; max_points are positive integers summing to 100; ids are kebab-case [a-z0-9-]; descriptions and anchors are concrete, evidence-based, and not tied to private paths; each anchor list has 1-6 nonempty entries; do not copy instructions verbatim - adapt them to this task.",
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
): Promise<{ rubric: MaybePracticeAwareRubric; text: string; hash: string }> {
  if (!practiceText?.trim()) return generateGenericRubric(taskMd, complete);
  const parsed = (await complete(practiceAwareRubricSystemPrompt(), practiceAwareRubricUserPrompt(taskMd, practiceText))) as unknown;
  const rubric = assertPracticeAwareRubric(parsed);
  const text = serializePracticeAwareRubric(rubric);
  return { rubric, text, hash: await sha256Text(text) };
}

const practiceRubricCache = new Map<string, Promise<{ rubric: MaybePracticeAwareRubric; text: string; hash: string }>>();

export async function generatePracticeAwareRubricCached(
  taskMd: string,
  practiceText: string | undefined,
  complete: JudgeCompletion,
  env: Record<string, string | undefined> = Bun.env,
): Promise<{ rubric: MaybePracticeAwareRubric; text: string; hash: string }> {
  const fixed = fixedRubricText(env);
  if (!fixed && !practiceText?.trim()) return generateGenericRubricCached(taskMd, complete, env);
  if (fixed && !practiceText?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fixed);
    } catch (error) {
      fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("root must be an object");
    const root = parsed as Record<string, unknown>;
    if (!Array.isArray(root.dimensions)) fail("dimensions must be an array");
    const anchored = root.dimensions.map((dimension) =>
      Boolean(dimension) && typeof dimension === "object" && !Array.isArray(dimension) &&
      Boolean((dimension as Record<string, unknown>).scoring_anchors),
    );
    if (anchored.every(Boolean)) {
      const rubric = assertPracticeAwareRubric(parsed);
      const text = serializePracticeAwareRubric(rubric);
      return { rubric, text, hash: await sha256Text(text) };
    }
    if (anchored.some(Boolean)) fail("cannot mix anchored and unanchored dimensions");
    const rubric = assertGeneratedRubric(parsed);
    const text = serializeRubric(rubric);
    return { rubric, text, hash: await sha256Text(text) };
  }
  const key = await sha256Text(fixed ? `${taskMd}\0${fixed}` : `${taskMd}\0${practiceText ?? ""}`);
  let pending = practiceRubricCache.get(key);
  if (!pending) {
    pending = fixed
      ? (async () => {
          const rubric = parsePracticeAwareRubricText(fixed);
          const text = serializePracticeAwareRubric(rubric);
          return { rubric, text, hash: await sha256Text(text) };
        })()
      : generatePracticeAwareRubric(taskMd, practiceText, complete);
    practiceRubricCache.set(key, pending);
  }
  return pending;
}
