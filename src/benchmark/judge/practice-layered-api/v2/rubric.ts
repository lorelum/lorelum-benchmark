import { join } from "node:path";
import { sha256Text } from "../../../fs";

export type PracticeDimensionId =
  | "component-transport-isolation"
  | "domain-operation-delegation"
  | "boundary-response-translation"
  | "raw-response-containment";

export type PracticeDimension = {
  id: PracticeDimensionId;
  max_points: number;
  description: string;
};

export type PracticeRubric = {
  id: string;
  version: string;
  judge: { id: string; version: string };
  prompt: string;
  dimensions: PracticeDimension[];
  repetition: { count: number; aggregate: "single" | "median" };
  thresholds: {
    reference_min: number;
    equivalent_tolerance: number;
    anti_pattern_max: number;
    anti_pattern_gap: number;
    low_confidence: number;
    disagreement_spread: number;
  };
};

export const rubricFileName = "rubric-v2.yaml";
export const expectedDimensionIds: PracticeDimensionId[] = [
  "component-transport-isolation",
  "domain-operation-delegation",
  "boundary-response-translation",
  "raw-response-containment",
];

function fail(message: string): never {
  throw new Error(`Invalid login Practice rubric v2: ${message}`);
}

export function assertRubric(value: unknown): PracticeRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const doc = value as Record<string, unknown>;
  if (typeof doc.id !== "string" || !doc.id) fail("id is required");
  if (doc.version !== "v2") fail("version must be v2");
  if (!doc.judge || typeof doc.judge !== "object") fail("judge identity is required");
  const judge = doc.judge as Record<string, unknown>;
  if (typeof judge.id !== "string" || typeof judge.version !== "string") fail("judge identity is invalid");
  if (typeof doc.prompt !== "string" || !doc.prompt) fail("prompt is required");
  if (!Array.isArray(doc.dimensions) || doc.dimensions.length !== expectedDimensionIds.length) fail("dimensions must cover the four v2 criteria");
  const seen = new Set<string>();
  let total = 0;
  for (const raw of doc.dimensions) {
    if (!raw || typeof raw !== "object") fail("dimension must be an object");
    const dimension = raw as Record<string, unknown>;
    if (typeof dimension.id !== "string" || !expectedDimensionIds.includes(dimension.id as PracticeDimensionId)) fail(`invalid dimension ${String(dimension.id)}`);
    if (seen.has(dimension.id)) fail(`duplicate dimension ${dimension.id}`);
    seen.add(dimension.id);
    if (!Number.isInteger(dimension.max_points) || (dimension.max_points as number) < 1) fail(`${dimension.id} max_points must be positive`);
    if (typeof dimension.description !== "string" || !dimension.description) fail(`${dimension.id} description is required`);
    total += dimension.max_points as number;
  }
  if (total !== 100 || seen.size !== expectedDimensionIds.length) fail("dimension maximums must total 100 and cover every criterion");
  if (!doc.repetition || typeof doc.repetition !== "object") fail("repetition is required");
  const repetition = doc.repetition as Record<string, unknown>;
  if (!Number.isInteger(repetition.count) || (repetition.count as number) < 1 || !["single", "median"].includes(String(repetition.aggregate))) fail("invalid repetition policy");
  if (!doc.thresholds || typeof doc.thresholds !== "object") fail("thresholds are required");
  const thresholds = doc.thresholds as Record<string, unknown>;
  for (const key of ["reference_min", "equivalent_tolerance", "anti_pattern_max", "anti_pattern_gap", "low_confidence", "disagreement_spread"]) {
    if (!Number.isInteger(thresholds[key]) || (thresholds[key] as number) < 0) fail(`thresholds.${key} must be non-negative integers`);
  }
  if ((thresholds.reference_min as number) <= (thresholds.anti_pattern_max as number)) fail("reference_min must exceed anti_pattern_max");
  return {
    id: doc.id as string,
    version: doc.version as string,
    judge: { id: judge.id as string, version: judge.version as string },
    prompt: doc.prompt as string,
    dimensions: doc.dimensions as PracticeDimension[],
    repetition: { count: repetition.count as number, aggregate: repetition.aggregate as "single" | "median" },
    thresholds: thresholds as PracticeRubric["thresholds"],
  };
}

export async function loadRubric(rootDir = import.meta.dirname): Promise<{ text: string; doc: PracticeRubric }> {
  const text = await Bun.file(join(rootDir, rubricFileName)).text();
  return { text, doc: assertRubric(Bun.YAML.parse(text)) };
}

export function rubricHash(text: string): Promise<string> {
  return sha256Text(text);
}
