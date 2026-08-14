import { sha256Text } from "../../../../fs";
import type { JudgeCompletion } from "./llm";

export type GeneratedRubricDimension = {
  id: string;
  name: string;
  description: string;
  max_points: number;
};

export type GeneratedRubric = {
  dimensions: GeneratedRubricDimension[];
};

function fail(message: string): never {
  throw new Error(`Invalid generated judge rubric: ${message}`);
}

function normalizedInteger(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) fail(`${label} must be numeric`);
  return Math.round(number);
}

export function assertGeneratedRubric(value: unknown): GeneratedRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.dimensions) || root.dimensions.length < 1 || root.dimensions.length > 6) fail("dimensions must be an array of 1-6 entries");
  const seen = new Set<string>();
  let total = 0;
  const dimensions: GeneratedRubricDimension[] = [];
  for (const raw of root.dimensions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("dimension must be an object");
    const d = raw as Record<string, unknown>;
    if (typeof d.id !== "string" || !/^[a-z0-9-]+$/.test(d.id)) fail(`dimension id must be kebab-case: ${String(d.id)}`);
    if (seen.has(d.id)) fail(`duplicate dimension id: ${d.id}`);
    seen.add(d.id);
    if (typeof d.name !== "string" || !d.name) fail(`dimension ${d.id} name is required`);
    if (typeof d.description !== "string" || !d.description) fail(`dimension ${d.id} description is required`);
    const maxPoints = normalizedInteger(d.max_points, `dimension ${d.id} max_points`);
    if (maxPoints < 1) fail(`dimension ${d.id} max_points must be a positive integer`);
    total += maxPoints;
    dimensions.push({ id: d.id, name: d.name, description: d.description, max_points: maxPoints });
  }
  if (total !== 100) fail(`dimension max_points must total 100, got ${total}`);
  return { dimensions };
}

/** Canonical serialization (stable key order) used for hashing and prompts. */
export function serializeRubric(rubric: GeneratedRubric): string {
  return JSON.stringify({
    dimensions: rubric.dimensions.map((d) => ({ id: d.id, name: d.name, description: d.description, max_points: d.max_points })),
  });
}

export function parseRubricText(text: string): GeneratedRubric {
  return assertGeneratedRubric(JSON.parse(text) as unknown);
}

/**
 * Engineering-quality guideline the rubric designer must reason with.
 * This encodes the same careful review standards the repository previously
 * hand-wrote per candidate (transport isolation, domain delegation, boundary
 * translation, raw-response containment), so the LLM generates rubrics with
 * the same discrimination power for any task.
 */
export const rubricQualityGuideline = `Scoring guideline - reason carefully with these engineering quality dimensions and select the ones that matter for THIS task (not all apply to every task):

1. transport-isolation: the UI/component layer must not directly call HTTP clients (fetch/axios/adapters), read raw HTTP status codes, or consume raw response bodies; request/response handling belongs in a boundary (api/service) module.
2. domain-delegation: event handlers and page logic await operations delegated to a module outside the component; the component does not implement request/response plumbing inline.
3. boundary-translation: the boundary module owns the actual transport call and translates expected transport outcomes (success, auth/conflict/not-found/unavailable failures) into domain-shaped results or explicit resource states (e.g. ready/empty/failed); components consume domain results, not status codes.
4. raw-response-containment: raw transport response/body values must not flow back into component state, return values, or the component-facing contract.
5. state-and-feedback: loading, empty, error, success, and retry states are handled explicitly and correctly; duplicate submissions are prevented; validation is correct and reflected in the UI.
6. correctness: the task's stated observable behaviors are all implemented.
7. policy-centralization: fallback, retry, tenant budget, idempotency, and metering are owned by a single boundary policy/ledger layer, not duplicated across route handlers or provider adapters; handlers delegate instead of implementing cross-cutting plumbing inline.
8. transport-accounting: every logical request produces one accounting record; retry/fallback are transport details and must not double-bill; streamed failures record only usage actually reported upstream; logs carry tenant/provider/model/trace/retry/status attribution.
9. provider-protocol-mapping: OpenAI-compatible providers are configuration-only reuse, while protocol-different and pseudo-compatible providers get their own wire translation; a provider is never reused by name when its auth/fields/stream shape differ.
10. budget-atomicity: tenant budget reservation and settlement are atomic under concurrency; an insufficient-budget request is rejected before any provider call and never overspends.

For each dimension you select, write a description that names concrete observable evidence a reviewer can check in code (for example "the component reads response.status directly" or "a boundary module translates 409 into a domain conflict result").`;

export function rubricSystemPrompt(): string {
  return [
    "You are a benchmark rubric designer. Read the coding task and produce a scoring rubric.",
    rubricQualityGuideline,
    "Return ONLY a JSON object with this exact shape:",
    '{"dimensions":[{"id":"kebab-case-id","name":"short name","description":"what quality this dimension measures and what concrete observable evidence satisfies it","max_points":30}]}',
    "Rules: 1 to 6 dimensions; max_points are positive integers summing to 100; ids are kebab-case [a-z0-9-]; descriptions are concrete and evidence-based, not tied to file names or private details; do not copy the guideline verbatim - adapt it to this task.",
  ].join("\n");
}

export function rubricUserPrompt(taskMd: string): string {
  return `Coding task:\n\n${taskMd}`;
}

const rubricCache = new Map<string, Promise<{ rubric: GeneratedRubric; text: string; hash: string }>>();

export function fixedRubricText(env: Record<string, string | undefined> = Bun.env): string | undefined {
  const value = env.LORELUM_JUDGE_RUBRIC_TEXT;
  return value && value.trim() ? value.trim() : undefined;
}

export async function generateRubric(taskMd: string, complete: JudgeCompletion): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  const parsed = (await complete(rubricSystemPrompt(), rubricUserPrompt(taskMd))) as unknown;
  const rubric = assertGeneratedRubric(parsed);
  const text = serializeRubric(rubric);
  return { rubric, text, hash: await sha256Text(text) };
}

export async function generateRubricCached(taskMd: string, complete: JudgeCompletion, env: Record<string, string | undefined> = Bun.env): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  const fixed = fixedRubricText(env);
  const key = await sha256Text(fixed ? `${taskMd}\0${fixed}` : taskMd);
  let pending = rubricCache.get(key);
  if (!pending) {
    pending = fixed
      ? (async () => {
          const rubric = parseRubricText(fixed);
          const text = serializeRubric(rubric);
          return { rubric, text, hash: await sha256Text(text) };
        })()
      : generateRubric(taskMd, complete);
    rubricCache.set(key, pending);
  }
  return pending;
}
