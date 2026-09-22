import { join } from "node:path";
import { sha256Text } from "../../../fs";
import { canonicalJson } from "./canonical";
import type { ReplanRubric } from "./types";

const rubricPath = join(import.meta.dir, "rubric.yaml");

function assertRubric(value: unknown): ReplanRubric {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("async-report rubric must be an object");
  const root = value as Record<string, unknown>;
  if (root.schema_version !== "async-report-replan-rubric/v1" || root.id !== "async-report-replan-rubric" || root.version !== "v1" || !Array.isArray(root.dimensions)) throw new Error("async-report rubric identity is invalid");
  const dimensions = root.dimensions.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("async-report rubric dimension is invalid");
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) || typeof item.name !== "string" || typeof item.description !== "string" || !Number.isInteger(item.max_points) || item.max_points < 1) throw new Error("async-report rubric dimension is invalid");
    return { id: item.id, name: item.name, description: item.description, max_points: item.max_points };
  });
  if (dimensions.length !== 5 || dimensions.reduce((sum, item) => sum + item.max_points, 0) !== 100) throw new Error("async-report rubric must contain five dimensions totaling 100");
  const ids = dimensions.map((item) => item.id);
  const expected = ["assumption-invalidation", "plan-revision", "implementation-scope-adjustment", "verification-evidence-update", "risk-and-uncertainty-honesty"];
  const expectedPoints = [20, 20, 25, 20, 15];
  if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error("async-report rubric dimensions are not the frozen v1 order");
  if (JSON.stringify(dimensions.map((item) => item.max_points)) !== JSON.stringify(expectedPoints)) throw new Error("async-report rubric weights are not the frozen v1 weights");
  return { schema_version: "async-report-replan-rubric/v1", id: "async-report-replan-rubric", version: "v1", dimensions };
}

let cached: Promise<ReplanRubric> | undefined;

export async function loadRubric(): Promise<ReplanRubric> {
  cached ??= Bun.file(rubricPath).text().then((text) => assertRubric(Bun.YAML.parse(text)));
  return cached;
}

export async function rubricText(): Promise<string> {
  return canonicalJson(await loadRubric());
}

export async function rubricHash(): Promise<string> {
  return sha256Text(await rubricText());
}

export { assertRubric };
