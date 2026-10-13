import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

import { sha256File, workspaceRoot } from "../../fs";
import { validateCorpusInventory, type CorpusInventory } from "../corpus/inventory";
import { HARNESS_CACHE_ROOT_ENV } from "../protocol-v1";
import type { RetrievalPracticeLabel } from "../scorer/v1";
import { validateRetrievalRankingSuite } from "../validate";
import { executeRetrievalBatch, type RetrievalCaseInput } from "./execute";

interface SuiteManifest {
  id: "retrieval-ranking";
  version: string;
  revision: string;
  corpus: string;
  cases: string;
  labels: string;
  scorer: string;
}

interface CaseFile {
  revision: string;
  cases: RetrievalCaseInput[];
}

interface LabelFile {
  revision: string;
  cases: RetrievalPracticeLabel[];
}

interface ScorerFile {
  revision: string;
  candidateWidth: number;
  resultLimit: number;
}

function option(args: Map<string, string>, name: string): string | undefined {
  return args.get(name);
}

function requiredOption(args: Map<string, string>, name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--") || token.length === 2) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    if (args.has(name)) throw new Error(`Duplicate option --${name}`);
    args.set(name, value);
    index += 1;
  }
  const allowed = new Set([
    "lorelum-root",
    "lorelum-commit",
    "store-root",
    "cache-root",
    "profile-id",
    "model-id",
    "model-version",
    "native-runtime",
    "artifact",
    "record",
    "run-id",
  ]);
  for (const name of args.keys()) {
    if (!allowed.has(name)) throw new Error(`Unknown option --${name}`);
  }
  return args;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text()) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAbsolute(name: string, value: string): string {
  if (!isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  return resolve(value);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const suiteRoot = join(workspaceRoot, "suites", "retrieval-ranking");
  const validationFailures = await validateRetrievalRankingSuite(suiteRoot);
  if (validationFailures.length > 0) throw new Error(`Retrieval suite is invalid:\n${validationFailures.join("\n")}`);

  const manifest = Bun.YAML.parse(await Bun.file(join(suiteRoot, "suite.yaml")).text()) as SuiteManifest;
  const corpusPath = join(suiteRoot, manifest.corpus);
  const casesPath = join(suiteRoot, manifest.cases);
  const labelsPath = join(suiteRoot, manifest.labels);
  const scorerPath = join(suiteRoot, manifest.scorer);
  const corpus = await readJson(corpusPath);
  const casesDocument = await readJson(casesPath);
  const labelsDocument = await readJson(labelsPath);
  const scorerDocument = await readJson(scorerPath);
  if (!validateCorpusInventory(corpus)) throw new Error("Pinned corpus inventory is invalid");
  if (!isRecord(casesDocument) || !Array.isArray(casesDocument.cases) || !isRecord(labelsDocument) || !Array.isArray(labelsDocument.cases) || !isRecord(scorerDocument)) {
    throw new Error("Retrieval revision files are invalid");
  }

  const candidateWidth = Number(scorerDocument.candidateWidth);
  const resultLimit = Number(scorerDocument.resultLimit);
  if (candidateWidth !== 20 || resultLimit !== 5) throw new Error("Retrieval v1 requires N=20 and K=5");
  const profileId = option(args, "profile-id") ?? "72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5";
  if (!/^[a-f0-9]{64}$/.test(profileId)) throw new Error("--profile-id must be a 64-character lowercase hex ID");

  const runId = option(args, "run-id") ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const artifactPath = assertAbsolute(
    "artifact",
    option(args, "artifact") ?? join(workspaceRoot, "artifacts", "retrieval-ranking", `${runId}.json`),
  );
  const recordPath = assertAbsolute(
    "record",
    option(args, "record") ?? join(workspaceRoot, "results", "records", `${runId}.json`),
  );
  const cacheRoot = assertAbsolute("cache-root", requiredOption(args, "cache-root"));

  const record = await executeRetrievalBatch({
    runId,
    startedAt: new Date().toISOString(),
    lorelumRepository: "lorelum/lorelum",
    lorelumRoot: assertAbsolute("lorelum-root", requiredOption(args, "lorelum-root")),
    lorelumCommit: requiredOption(args, "lorelum-commit"),
    storeRoot: assertAbsolute("store-root", requiredOption(args, "store-root")),
    cacheRoot,
    embeddingProfileId: profileId,
    candidateWidth,
    resultLimit,
    model: {
      id: requiredOption(args, "model-id"),
      version: requiredOption(args, "model-version"),
      nativeRuntime: requiredOption(args, "native-runtime"),
    },
    benchmark: {
      suiteId: manifest.id,
      suiteVersion: manifest.version,
      revision: manifest.revision,
      casesSha256: await sha256File(casesPath),
      labelsSha256: await sha256File(labelsPath),
      scorerSha256: await sha256File(scorerPath),
    },
    inventory: corpus as CorpusInventory,
    cases: (casesDocument as unknown as CaseFile).cases,
    labels: (labelsDocument as unknown as LabelFile).cases,
    artifactPath,
    recordPath,
    harnessEnvironment: {
      [HARNESS_CACHE_ROOT_ENV]: cacheRoot,
    },
  });

  console.log(JSON.stringify({
    runId: record.run_id,
    batchStatus: record.batch_status,
    retrievalScored: record.outcome.retrieval_scored,
    resultArtifact: record.result_artifact,
    outcome: record.outcome,
  }));
}

if (import.meta.main) await main();
