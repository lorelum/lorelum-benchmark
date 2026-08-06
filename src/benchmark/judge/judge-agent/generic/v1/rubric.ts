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

export function assertGeneratedRubric(value: unknown): GeneratedRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.dimensions) || root.dimensions.length < 1 || root.dimensions.length > 5) fail("dimensions must be an array of 1-5 entries");
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
    if (!Number.isInteger(d.max_points) || (d.max_points as number) < 1) fail(`dimension ${d.id} max_points must be a positive integer`);
    total += d.max_points as number;
    dimensions.push({ id: d.id, name: d.name, description: d.description, max_points: d.max_points as number });
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

export function rubricSystemPrompt(): string {
  return [
    "You are a benchmark rubric designer. Read the coding task and produce a scoring rubric.",
    "Return ONLY a JSON object with this exact shape:",
    '{"dimensions":[{"id":"kebab-case-id","name":"short name","description":"what quality this dimension measures and what observable behavior satisfies it","max_points":30}]}',
    "Rules: 1 to 5 dimensions; max_points are positive integers summing to 100; ids are kebab-case [a-z0-9-]; descriptions are concrete and observable, not tied to file names or private details.",
  ].join("\n");
}

export function rubricUserPrompt(taskMd: string): string {
  return `Coding task:\n\n${taskMd}`;
}

const rubricCache = new Map<string, Promise<{ rubric: GeneratedRubric; text: string; hash: string }>>();

export async function generateRubric(taskMd: string, complete: JudgeCompletion): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  const parsed = (await complete(rubricSystemPrompt(), rubricUserPrompt(taskMd))) as unknown;
  const rubric = assertGeneratedRubric(parsed);
  const text = serializeRubric(rubric);
  return { rubric, text, hash: await sha256Text(text) };
}

export async function generateRubricCached(taskMd: string, complete: JudgeCompletion): Promise<{ rubric: GeneratedRubric; text: string; hash: string }> {
  const key = await sha256Text(taskMd);
  let pending = rubricCache.get(key);
  if (!pending) {
    pending = generateRubric(taskMd, complete);
    rubricCache.set(key, pending);
  }
  return pending;
}
