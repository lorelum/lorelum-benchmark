import { relative, resolve } from "node:path";
import { sha256Text } from "../../../../fs";
import { assertPublicPracticeText } from "./rubric";

export type DeclaredPracticeAwareMaterials = {
  oracle_practice: {
    condition_id: "oracle-practice";
    path: string;
    sha256: string;
    text: string;
  };
  rubric: {
    path: string;
    sha256: string;
    text: string;
  };
};

type PracticeDeclaration = {
  path?: unknown;
  sha256?: unknown;
};

type ConditionsDeclaration = {
  shared_execution?: {
    judge?: {
      provider?: unknown;
      rubric?: PracticeDeclaration;
    };
  };
  conditions?: Array<{ id?: unknown; status?: unknown; practice?: unknown }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedRelative(value: string): string {
  return value.replaceAll("\\", "/");
}

function requiredRelativePath(value: unknown, label: string, root: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${label} path must be a non-empty relative path`);
  const normalized = normalizedRelative(value);
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    fail(`${label} path must stay inside the candidate declaration`);
  }
  const resolved = resolve(root, normalized);
  const inside = normalizedRelative(relative(resolve(root), resolved));
  if (inside === "" || inside === ".." || inside.startsWith("../") || /^[a-zA-Z]:/.test(inside)) fail(`${label} path escapes the candidate declaration`);
  return normalized;
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} sha256 must be 64 lowercase hex characters`);
  return value;
}

async function readConditions(root: string): Promise<ConditionsDeclaration> {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(await Bun.file(resolve(root, "private", "conditions.yaml")).text());
  } catch (error) {
    fail(`invalid private/conditions.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) fail("private/conditions.yaml must contain an object");
  return parsed as ConditionsDeclaration;
}

/**
 * Resolves only the candidate-declared oracle Practice and fixed rubric. The
 * optional requested path is accepted only when it is exactly the declaration;
 * callers cannot substitute an arbitrary private file.
 */
export async function resolveDeclaredPracticeAwareMaterials(
  candidateRoot: string,
  requestedPracticePath?: string,
): Promise<DeclaredPracticeAwareMaterials> {
  const root = resolve(candidateRoot);
  const conditions = await readConditions(root);
  const judge = conditions.shared_execution?.judge;
  if (judge?.provider !== "judge-agent/practice-aware/v1") {
    fail("practice-aware calibration requires shared_execution.judge.provider=judge-agent/practice-aware/v1");
  }
  const oracleCondition = conditions.conditions?.find((condition) => condition.id === "oracle-practice" && condition.status === "declared");
  const practice = oracleCondition?.practice;
  if (!isRecord(practice)) fail("private/conditions.yaml must declare the oracle-practice payload");
  const declaredPracticePath = requiredRelativePath(practice.path, "oracle Practice", root);
  if (requestedPracticePath !== undefined) {
    const requestedRelative = normalizedRelative(relative(root, resolve(root, requestedPracticePath)));
    if (requestedRelative !== declaredPracticePath) fail("requested Practice path does not match the candidate declaration");
  }
  const practiceHash = requiredHash(practice.sha256, "oracle Practice");
  const resolvedPracticePath = resolve(root, declaredPracticePath);
  let practiceText: string;
  try {
    practiceText = await Bun.file(resolvedPracticePath).text();
  } catch {
    fail("declared oracle Practice file is unavailable");
  }
  if (await sha256Text(practiceText) !== practiceHash) fail("declared oracle Practice sha256 mismatch");
  assertPublicPracticeText(practiceText);

  const declaredRubricPath = requiredRelativePath(judge.rubric?.path, "practice-aware rubric", root);
  if (!declaredRubricPath.startsWith("private/calibration/")) fail("practice-aware rubric must live under private/calibration/");
  const rubricHash = requiredHash(judge.rubric?.sha256, "practice-aware rubric");
  const resolvedRubricPath = resolve(root, declaredRubricPath);
  let rubricText: string;
  try {
    rubricText = await Bun.file(resolvedRubricPath).text();
  } catch {
    fail("declared practice-aware rubric file is unavailable");
  }
  if (await sha256Text(rubricText) !== rubricHash) fail("declared practice-aware rubric sha256 mismatch");

  return {
    oracle_practice: { condition_id: "oracle-practice", path: declaredPracticePath, sha256: practiceHash, text: practiceText },
    rubric: { path: declaredRubricPath, sha256: rubricHash, text: rubricText },
  };
}