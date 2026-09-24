import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { isAbsolute, join, relative, resolve } from "node:path";

import { workspaceRoot } from "../fs";
import { validateCorpusInventory, type CorpusInventory } from "./corpus/inventory";

const ajv = new Ajv2020({ allErrors: true });
const validators = new Map<string, ValidateFunction>();

interface RetrievalCase {
  id: string;
  query: string;
}

interface RetrievalCaseFile {
  schemaVersion: 1;
  revision: string;
  cases: RetrievalCase[];
}

interface LabelCase {
  id: string;
  coreIds: string[];
  forbiddenIds: string[];
  coverage: string[];
  rationale: string;
}

interface LabelFile {
  schemaVersion: 1;
  revision: string;
  cases: LabelCase[];
}

interface ScorerConfig {
  schemaVersion: 1;
  revision: string;
  candidateWidth: number;
  resultLimit: number;
  metrics: string[];
}

const requiredCoverage = [
  "direct",
  "paraphrase",
  "near-miss",
  "adjacent-stage",
  "scope-conflict",
  "cross-language",
  "mixed-constraints",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function validator(schemaName: string): Promise<ValidateFunction> {
  const existing = validators.get(schemaName);
  if (existing) return existing;
  const schemaPath = join(workspaceRoot, "schemas", schemaName);
  const compiled = ajv.compile(JSON.parse(await Bun.file(schemaPath).text()) as unknown);
  validators.set(schemaName, compiled);
  return compiled;
}

function schemaFailures(schemaName: string, errors: ErrorObject[] | null | undefined, path: string): string[] {
  return (errors ?? []).map((error) => {
    const location = error.instancePath || "/";
    return `Schema violation in ${relative(workspaceRoot, path)} at ${location}: ${error.message ?? error.keyword}`;
  });
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text()) as unknown;
}

export async function validateRetrievalRankingSuite(suitePath: string): Promise<string[]> {
  const failures: string[] = [];
  const suiteRelative = relative(workspaceRoot, suitePath).replaceAll("\\", "/");

  let suiteDocument: Record<string, unknown>;
  try {
    const parsed = Bun.YAML.parse(await Bun.file(join(suitePath, "suite.yaml")).text()) as unknown;
    if (!isRecord(parsed)) return [`Retrieval suite manifest must be an object: ${suiteRelative}/suite.yaml`];
    suiteDocument = parsed;
  } catch (error) {
    return [`Invalid YAML in ${suiteRelative}/suite.yaml: ${error instanceof Error ? error.message : String(error)}`];
  }

  const suiteValidator = await validator("retrieval-suite.schema.json");
  if (!suiteValidator(suiteDocument)) {
    failures.push(...schemaFailures("retrieval-suite.schema.json", suiteValidator.errors, join(suitePath, "suite.yaml")));
    return failures;
  }

  const revision = suiteDocument.revision as string;
  const revisionPath = resolve(suitePath, revision);
  const revisionRelative = relative(resolve(suitePath), revisionPath);
  if (revisionRelative.startsWith("..") || isAbsolute(revisionRelative)) {
    return [`Retrieval revision escapes its suite directory: ${revision}`];
  }

  const corpusPath = resolve(suitePath, suiteDocument.corpus as string);
  const casesPath = resolve(suitePath, suiteDocument.cases as string);
  const labelsPath = resolve(suitePath, suiteDocument.labels as string);
  const scorerPath = resolve(suitePath, suiteDocument.scorer as string);

  let corpus: CorpusInventory;
  try {
    const parsed = await readJson(corpusPath);
    if (!validateCorpusInventory(parsed)) {
      failures.push(`Pinned corpus inventory is invalid: ${relative(workspaceRoot, corpusPath)}`);
      return failures;
    }
    corpus = parsed;
  } catch (error) {
    failures.push(`Invalid corpus inventory in ${relative(workspaceRoot, corpusPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }

  const casesValidator = await validator("retrieval-cases.schema.json");
  let cases: RetrievalCaseFile;
  try {
    const parsed = await readJson(casesPath);
    if (!casesValidator(parsed)) {
      failures.push(...schemaFailures("retrieval-cases.schema.json", casesValidator.errors, casesPath));
      return failures;
    }
    cases = parsed as RetrievalCaseFile;
  } catch (error) {
    failures.push(`Invalid query cases in ${relative(workspaceRoot, casesPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }

  const labelsValidator = await validator("retrieval-labels.schema.json");
  let labels: LabelFile;
  try {
    const parsed = await readJson(labelsPath);
    if (!labelsValidator(parsed)) {
      failures.push(...schemaFailures("retrieval-labels.schema.json", labelsValidator.errors, labelsPath));
      return failures;
    }
    labels = parsed as LabelFile;
  } catch (error) {
    failures.push(`Invalid gold labels in ${relative(workspaceRoot, labelsPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }

  const scorerValidator = await validator("retrieval-scorer-config.schema.json");
  let scorer: ScorerConfig;
  try {
    const parsed = await readJson(scorerPath);
    if (!scorerValidator(parsed)) {
      failures.push(...schemaFailures("retrieval-scorer-config.schema.json", scorerValidator.errors, scorerPath));
      return failures;
    }
    scorer = parsed as ScorerConfig;
  } catch (error) {
    failures.push(`Invalid scorer config in ${relative(workspaceRoot, scorerPath)}: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }

  for (const [label, revisionValue] of [
    ["cases", cases.revision],
    ["labels", labels.revision],
    ["scorer", scorer.revision],
  ] as const) {
    if (revisionValue !== revision) failures.push(`Retrieval ${label} revision does not match suite revision ${revision}`);
  }

  const corpusIds = new Set(corpus.packs.flatMap((pack) => pack.practices.map((practice) => practice.id)));
  const caseIds = new Set<string>();
  for (const testCase of cases.cases) {
    if (caseIds.has(testCase.id)) failures.push(`Duplicate retrieval case id: ${testCase.id}`);
    caseIds.add(testCase.id);
  }

  const labelIds = new Set<string>();
  const coverage = new Set<string>();
  for (const label of labels.cases) {
    if (labelIds.has(label.id)) failures.push(`Duplicate retrieval label id: ${label.id}`);
    labelIds.add(label.id);
    for (const metric of label.coverage) coverage.add(metric);
    for (const practiceId of label.coreIds) {
      if (!corpusIds.has(practiceId)) failures.push(`Retrieval core Practice is outside the pinned corpus: ${label.id}/${practiceId}`);
      if (label.forbiddenIds.includes(practiceId)) failures.push(`Retrieval Practice is both core and forbidden: ${label.id}/${practiceId}`);
    }
    for (const practiceId of label.forbiddenIds) {
      if (!corpusIds.has(practiceId)) failures.push(`Retrieval forbidden Practice is outside the pinned corpus: ${label.id}/${practiceId}`);
    }
  }

  for (const id of caseIds) if (!labelIds.has(id)) failures.push(`Retrieval case has no gold label: ${id}`);
  for (const id of labelIds) if (!caseIds.has(id)) failures.push(`Retrieval label has no query case: ${id}`);
  for (const metric of requiredCoverage) if (!coverage.has(metric)) failures.push(`Retrieval case set is missing coverage: ${metric}`);
  if (scorer.resultLimit > scorer.candidateWidth) failures.push("Retrieval scorer resultLimit must not exceed candidateWidth");
  if (scorer.candidateWidth !== 20 || scorer.resultLimit !== 5) {
    failures.push("Retrieval v1 is pinned to candidateWidth=20 and resultLimit=5");
  }

  return failures;
}
