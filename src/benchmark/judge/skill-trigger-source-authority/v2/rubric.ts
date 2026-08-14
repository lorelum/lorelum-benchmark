import { join } from "node:path";
import { sha256Text } from "../../../fs";

export type SourceAuthorityDimensionId =
  | "foreground-authority"
  | "background-window-authority"
  | "superseded-foreground"
  | "state-feedback-preserved";

export type SourceAuthorityDimension = {
  id: SourceAuthorityDimensionId;
  max_points: number;
  description: string;
};

export type SourceAuthorityRubric = {
  id: string;
  version: string;
  judge: { id: string; version: string };
  prompt: string;
  dimensions: SourceAuthorityDimension[];
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

export const expectedDimensionIds: SourceAuthorityDimensionId[] = [
  "foreground-authority",
  "background-window-authority",
  "superseded-foreground",
  "state-feedback-preserved",
];

const dimensionMaxPoints: Record<SourceAuthorityDimensionId, number> = {
  "foreground-authority": 30,
  "background-window-authority": 30,
  "superseded-foreground": 25,
  "state-feedback-preserved": 15,
};

function fail(message: string): never {
  throw new Error(`Invalid skill-trigger source-authority rubric v2: ${message}`);
}

export function assertRubric(value: unknown): SourceAuthorityRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("root must be an object");
  const doc = value as Record<string, unknown>;
  if (typeof doc.id !== "string" || !doc.id) fail("id is required");
  if (doc.version !== "v2") fail("version must be v2");
  if (!doc.judge || typeof doc.judge !== "object") fail("judge identity is required");
  const judge = doc.judge as Record<string, unknown>;
  if (typeof judge.id !== "string" || typeof judge.version !== "string") fail("judge identity is invalid");
  if (typeof doc.prompt !== "string" || !doc.prompt) fail("prompt is required");
  if (!Array.isArray(doc.dimensions) || doc.dimensions.length !== expectedDimensionIds.length) fail("dimensions must cover the four source-authority criteria");
  const seen = new Set<string>();
  for (const raw of doc.dimensions) {
    if (!raw || typeof raw !== "object") fail("dimension must be an object");
    const dimension = raw as Record<string, unknown>;
    if (typeof dimension.id !== "string" || !expectedDimensionIds.includes(dimension.id as SourceAuthorityDimensionId)) fail(`invalid dimension ${String(dimension.id)}`);
    if (seen.has(dimension.id)) fail(`duplicate dimension ${dimension.id}`);
    seen.add(dimension.id);
    if (!Number.isInteger(dimension.max_points) || (dimension.max_points as number) < 1) fail(`${dimension.id} max_points must be positive`);
    if (typeof dimension.description !== "string" || !dimension.description) fail(`${dimension.id} description is required`);
    if ((dimension.max_points as number) !== dimensionMaxPoints[dimension.id as SourceAuthorityDimensionId]) fail(`${dimension.id} max_points must be ${dimensionMaxPoints[dimension.id as SourceAuthorityDimensionId]}`);
  }
  if (seen.size !== expectedDimensionIds.length) fail("dimensions must cover every criterion");
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
    dimensions: (doc.dimensions as Array<Record<string, unknown>>).map((dimension) => ({
      id: dimension.id as SourceAuthorityDimensionId,
      max_points: dimension.max_points as number,
      description: dimension.description as string,
    })),
    repetition: { count: repetition.count as number, aggregate: repetition.aggregate as "single" | "median" },
    thresholds: {
      reference_min: thresholds.reference_min as number,
      equivalent_tolerance: thresholds.equivalent_tolerance as number,
      anti_pattern_max: thresholds.anti_pattern_max as number,
      anti_pattern_gap: thresholds.anti_pattern_gap as number,
      low_confidence: thresholds.low_confidence as number,
      disagreement_spread: thresholds.disagreement_spread as number,
    },
  };
}

/** Canonical rubric text used for hashing and as the scoring rubric. */
export function serializeRubricText(doc: SourceAuthorityRubric): string {
  const dimensions = doc.dimensions.map((dimension) => `- ${dimension.id} (${dimension.max_points}): ${dimension.description}`).join("\n");
  return [
    doc.prompt,
    "",
    "Result authority rules (project policy PX-47):",
    "- foreground-authority: navigation and manual reload own the view result for their scope.",
    "- background-window-authority: background reconciliation is non-authoritative and must not change the foreground view even if started later or settling later.",
    "- superseded-foreground: a foreground operation superseded by a newer foreground operation must not settle on success or failure.",
    "- state-feedback-preserved: existing loading/success/error/reload/reconciliation experiences remain intact.",
    "",
    "Scoring dimensions:",
    dimensions,
  ].join("\n");
}

export async function loadRubric(): Promise<{ text: string; doc: SourceAuthorityRubric }> {
  const file = Bun.file(join(import.meta.dir, "rubric.yaml"));
  const doc = assertRubric(Bun.YAML.parse(await file.text()));
  return { text: serializeRubricText(doc), doc };
}

export async function rubricHash(): Promise<string> {
  return sha256Text((await loadRubric()).text);
}
