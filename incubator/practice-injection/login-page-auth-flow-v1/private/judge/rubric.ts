import { resolve, join } from "node:path";
import { sha256Text } from "../../../../../src/benchmark/fs";

export type RubricDimension = {
  id: "api-page-boundary" | "state-handling" | "form-experience" | "ui-ux";
  max_points: number;
  description: string;
};

export type RubricDoc = {
  id: string;
  version: string;
  judge: { id: string; version: string };
  prompt: string;
  dimensions: RubricDimension[];
  repetition: { count: number; aggregate: "median" | "single" | "panel" };
  thresholds: {
    reference_min: number;
    equivalent_tolerance: number;
    anti_pattern_max: number;
    anti_pattern_gap: number;
    low_confidence: number;
    disagreement_spread: number;
  };
};

export const rubricFileName = "rubric-v1.yaml";
export const expectedDimensionIds = ["api-page-boundary", "state-handling", "form-experience", "ui-ux"] as const;

// Tokens that would bind scoring to concrete file paths, file names, or helper
// names. The rubric MUST NOT reference them; the check is a hard conformance gate.
const bindingTokens = [".tsx", ".ts", ".jsx", "/", "\\", "LoginPage", "http.ts", "session.ts", "authApi", "apiClient"];

function fail(message: string): never {
  throw new Error(`Invalid login-page rubric: ${message}`);
}

export function assertRubric(value: unknown): RubricDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("rubric root must be an object");
  const doc = value as Record<string, unknown>;
  if (typeof doc.id !== "string" || !doc.id) fail("id is required");
  if (typeof doc.version !== "string" || !doc.version) fail("version is required");
  if (!doc.judge || typeof doc.judge !== "object" || typeof (doc.judge as { id?: unknown }).id !== "string" || typeof (doc.judge as { version?: unknown }).version !== "string") fail("judge identity is required");
  if (typeof doc.prompt !== "string" || !doc.prompt) fail("prompt is required");

  if (!Array.isArray(doc.dimensions) || doc.dimensions.length === 0) fail("dimensions are required");
  const dimensionIds = new Set<string>();
  let maxPointsTotal = 0;
  for (const dimension of doc.dimensions) {
    if (!dimension || typeof dimension !== "object") fail("each dimension must be an object");
    const entry = dimension as Record<string, unknown>;
    if (typeof entry.id !== "string" || !expectedDimensionIds.includes(entry.id as RubricDimension["id"])) fail(`dimension id is invalid: ${String(entry.id)}`);
    if (dimensionIds.has(entry.id)) fail(`duplicate dimension: ${entry.id}`);
    dimensionIds.add(entry.id);
    if (!Number.isInteger(entry.max_points) || (entry.max_points as number) < 1) fail(`dimension ${entry.id} max_points must be a positive integer`);
    maxPointsTotal += entry.max_points as number;
    if (typeof entry.description !== "string" || !entry.description) fail(`dimension ${entry.id} description is required`);
    for (const token of bindingTokens) {
      if (entry.description.includes(token)) fail(`dimension ${entry.id} description binds to implementation detail: ${token}`);
    }
  }
  if (dimensionIds.size !== expectedDimensionIds.length) fail(`dimensions must cover exactly: ${expectedDimensionIds.join(", ")}`);
  if (maxPointsTotal !== 100) fail(`dimension max_points must total 100, received ${maxPointsTotal}`);

  if (!doc.repetition || typeof doc.repetition !== "object") fail("repetition policy is required");
  const repetition = doc.repetition as Record<string, unknown>;
  if (!Number.isInteger(repetition.count) || (repetition.count as number) < 1) fail("repetition.count must be a positive integer");
  if (!["median", "single", "panel"].includes(String(repetition.aggregate))) fail("repetition.aggregate must be median, single, or panel");

  if (!doc.thresholds || typeof doc.thresholds !== "object") fail("thresholds are required");
  const thresholds = doc.thresholds as Record<string, unknown>;
  for (const key of ["reference_min", "equivalent_tolerance", "anti_pattern_max", "anti_pattern_gap", "low_confidence", "disagreement_spread"]) {
    if (!Number.isInteger(thresholds[key]) || (thresholds[key] as number) < 0) fail(`thresholds.${key} must be a non-negative integer`);
  }
  if ((thresholds.reference_min as number) <= (thresholds.anti_pattern_max as number)) fail("reference_min must exceed anti_pattern_max");

  return {
    id: doc.id as string,
    version: doc.version as string,
    judge: { id: (doc.judge as { id: string }).id, version: (doc.judge as { version: string }).version },
    prompt: doc.prompt as string,
    dimensions: doc.dimensions as RubricDimension[],
    repetition: repetition as RubricDoc["repetition"],
    thresholds: thresholds as RubricDoc["thresholds"],
  };
}

export async function loadRubric(rootDir = import.meta.dirname): Promise<{ text: string; doc: RubricDoc }> {
  const file = join(rootDir, rubricFileName);
  const text = await Bun.file(file).text();
  const parsed = Bun.YAML.parse(text);
  return { text, doc: assertRubric(parsed) };
}

export async function rubricHash(text: string): Promise<string> {
  return sha256Text(text);
}

export function assertNoPathBinding(text: string): void {
  for (const token of bindingTokens) {
    if (text.includes(token)) fail(`rubric binds to implementation detail: ${token}`);
  }
}
