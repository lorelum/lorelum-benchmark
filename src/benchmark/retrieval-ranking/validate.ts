import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";

import { sha256File, workspaceRoot } from "../fs";
import { validateCorpusInventory, type CorpusInventory } from "./corpus/inventory";

const ajv = new Ajv2020({ allErrors: true });
const validators = new Map<string, ValidateFunction>();
const lifecycleStages = new Set(["candidate", "pilot", "frozen", "official", "published", "retired"]);
const frozenOrLater = new Set(["frozen", "official", "published", "retired"]);

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

interface SuiteRevision {
  revision: string;
  lifecycle_stage: string;
}

interface RetrievalSuiteManifest {
  id: string;
  version: string;
  track: "retrieval-ranking";
  lifecycle_stage: string;
  revision: string;
  revisions: SuiteRevision[];
  corpus: string;
  cases: string;
  labels: string;
  scorer: string;
  protocol: string;
}

interface CorpusIdentity {
  sourceRepository: string;
  snapshotCommit: string;
  practiceCount: number;
  corpusDigest: string;
  packs: Array<{
    name: string;
    releaseVersion: string;
    sourceCommit: string;
    artifactDigest?: string;
    practices: Array<{ id: string }>;
  }>;
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

async function readSuiteManifest(suitePath: string): Promise<{ manifest?: RetrievalSuiteManifest; failures: string[] }> {
  const failures: string[] = [];
  const suiteRelative = relative(workspaceRoot, suitePath).replaceAll("\\", "/");
  let suiteDocument: Record<string, unknown>;
  try {
    const parsed = Bun.YAML.parse(await Bun.file(join(suitePath, "suite.yaml")).text()) as unknown;
    if (!isRecord(parsed)) return { failures: [`Retrieval suite manifest must be an object: ${suiteRelative}/suite.yaml`] };
    suiteDocument = parsed;
  } catch (error) {
    return { failures: [`Invalid YAML in ${suiteRelative}/suite.yaml: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const suiteValidator = await validator("retrieval-suite.schema.json");
  if (!suiteValidator(suiteDocument)) {
    return { failures: schemaFailures("retrieval-suite.schema.json", suiteValidator.errors, join(suitePath, "suite.yaml")) };
  }

  const manifest = suiteDocument as unknown as RetrievalSuiteManifest;
  const revisions = new Set<string>();
  for (const entry of manifest.revisions) {
    if (revisions.has(entry.revision)) failures.push(`Duplicate retrieval suite revision: ${entry.revision}`);
    revisions.add(entry.revision);
    if (!lifecycleStages.has(entry.lifecycle_stage)) failures.push(`Invalid retrieval revision lifecycle stage: ${entry.revision}/${entry.lifecycle_stage}`);
  }
  if (!revisions.has(manifest.revision)) failures.push(`Active retrieval revision is not declared: ${manifest.revision}`);

  const activeRevision = manifest.revisions.find((entry) => entry.revision === manifest.revision);
  if (!activeRevision) {
    failures.push(`Active retrieval revision has no lifecycle declaration: ${manifest.revision}`);
  } else if (activeRevision.lifecycle_stage !== manifest.lifecycle_stage) {
    failures.push(`Active retrieval revision lifecycle does not match suite lifecycle: ${manifest.revision}`);
  }

  return { manifest, failures };
}

function revisionPaths(suitePath: string, revision: string) {
  const revisionRoot = resolve(suitePath, revision);
  const fromSuite = relative(resolve(suitePath), revisionRoot);
  if (fromSuite.startsWith("..") || isAbsolute(fromSuite)) throw new Error(`Retrieval revision escapes its suite directory: ${revision}`);
  return {
    corpusPath: join(revisionRoot, "corpus", "inventory.json"),
    casesPath: join(revisionRoot, "cases", "queries.json"),
    labelsPath: join(revisionRoot, "private", "labels.json"),
    scorerPath: join(revisionRoot, "private", "scorer.json"),
  };
}

function parseCorpusIdentity(value: unknown, label: string): { identity?: CorpusIdentity; failures: string[] } {
  const failures: string[] = [];
  if (!isRecord(value)) return { failures: [`${label} must be an object`] };

  const { corpusDigest, ...payload } = value;
  if (typeof corpusDigest !== "string" || !/^[a-f0-9]{64}$/.test(corpusDigest)) {
    failures.push(`${label} has an invalid corpusDigest`);
  } else {
    const recomputed = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    if (recomputed !== corpusDigest) failures.push(`${label} corpusDigest does not match its payload`);
  }

  const sourceRepository = payload.sourceRepository;
  const snapshotCommit = payload.snapshotCommit;
  const practiceCount = payload.practiceCount;
  if (typeof sourceRepository !== "string" || sourceRepository.length === 0) failures.push(`${label} has an invalid sourceRepository`);
  if (typeof snapshotCommit !== "string" || !/^[a-f0-9]{40}$/.test(snapshotCommit)) failures.push(`${label} has an invalid snapshotCommit`);
  if (!Number.isInteger(practiceCount) || Number(practiceCount) < 1) failures.push(`${label} has an invalid practiceCount`);
  if (!Array.isArray(payload.packs) || payload.packs.length === 0) {
    failures.push(`${label} has no packs`);
    return { failures };
  }

  const packs: CorpusIdentity["packs"] = [];
  let countedPractices = 0;
  for (const rawPack of payload.packs) {
    if (!isRecord(rawPack)) {
      failures.push(`${label} contains an invalid pack`);
      continue;
    }
    const name = rawPack.name;
    const releaseVersion = rawPack.releaseVersion;
    const sourceCommit = rawPack.sourceCommit;
    const artifactDigest = rawPack.artifactDigest;
    if (typeof name !== "string" || name.length === 0) failures.push(`${label} contains a pack without a name`);
    if (typeof releaseVersion !== "string" || releaseVersion.length === 0) failures.push(`${label}/${String(name)} has no releaseVersion`);
    if (typeof sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(sourceCommit)) failures.push(`${label}/${String(name)} has an invalid sourceCommit`);
    if (artifactDigest !== undefined && (typeof artifactDigest !== "string" || !/^[a-f0-9]{64}$/.test(artifactDigest))) {
      failures.push(`${label}/${String(name)} has an invalid artifactDigest`);
    }
    if (!Array.isArray(rawPack.practices) || rawPack.practices.length === 0) {
      failures.push(`${label}/${String(name)} has no practices`);
      continue;
    }
    const practices: Array<{ id: string }> = [];
    for (const rawPractice of rawPack.practices) {
      if (!isRecord(rawPractice) || typeof rawPractice.id !== "string" || rawPractice.id.length === 0) {
        failures.push(`${label}/${String(name)} contains an invalid Practice`);
        continue;
      }
      practices.push({ id: rawPractice.id });
      countedPractices += 1;
    }
    packs.push({
      name: String(name),
      releaseVersion: String(releaseVersion),
      sourceCommit: String(sourceCommit),
      ...(artifactDigest === undefined ? {} : { artifactDigest: String(artifactDigest) }),
      practices,
    });
  }
  if (Number(practiceCount) !== countedPractices) failures.push(`${label} practiceCount does not match its packs`);

  if (failures.length > 0) return { failures };
  return {
    identity: {
      sourceRepository: String(sourceRepository),
      snapshotCommit: String(snapshotCommit),
      practiceCount: Number(practiceCount),
      corpusDigest: String(corpusDigest),
      packs,
    },
    failures,
  };
}

async function validateRevision(suitePath: string, manifest: RetrievalSuiteManifest, revision: SuiteRevision): Promise<string[]> {
  const failures: string[] = [];
  const paths = revisionPaths(suitePath, revision.revision);
  const revisionLabel = `${manifest.id}/${revision.revision}`;

  let corpus: CorpusInventory | undefined;
  try {
    const parsed = await readJson(paths.corpusPath);
    const identity = parseCorpusIdentity(parsed, `${revisionLabel} corpus inventory`);
    failures.push(...identity.failures);
    if (revision.revision === manifest.revision) {
      if (!validateCorpusInventory(parsed)) failures.push(`Pinned corpus inventory is invalid: ${relative(workspaceRoot, paths.corpusPath)}`);
      else corpus = parsed;
    }
  } catch (error) {
    failures.push(`Invalid corpus inventory in ${relative(workspaceRoot, paths.corpusPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const casesValidator = await validator("retrieval-cases.schema.json");
  let cases: RetrievalCaseFile | undefined;
  try {
    const parsed = await readJson(paths.casesPath);
    if (!casesValidator(parsed)) failures.push(...schemaFailures("retrieval-cases.schema.json", casesValidator.errors, paths.casesPath));
    else cases = parsed as RetrievalCaseFile;
  } catch (error) {
    failures.push(`Invalid query cases in ${relative(workspaceRoot, paths.casesPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const labelsValidator = await validator("retrieval-labels.schema.json");
  let labels: LabelFile | undefined;
  try {
    const parsed = await readJson(paths.labelsPath);
    if (!labelsValidator(parsed)) failures.push(...schemaFailures("retrieval-labels.schema.json", labelsValidator.errors, paths.labelsPath));
    else labels = parsed as LabelFile;
  } catch (error) {
    failures.push(`Invalid gold labels in ${relative(workspaceRoot, paths.labelsPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const scorerValidator = await validator("retrieval-scorer-config.schema.json");
  let scorer: ScorerConfig | undefined;
  try {
    const parsed = await readJson(paths.scorerPath);
    if (!scorerValidator(parsed)) failures.push(...schemaFailures("retrieval-scorer-config.schema.json", scorerValidator.errors, paths.scorerPath));
    else scorer = parsed as ScorerConfig;
  } catch (error) {
    failures.push(`Invalid scorer config in ${relative(workspaceRoot, paths.scorerPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const [label, revisionValue] of [
    ["cases", cases?.revision],
    ["labels", labels?.revision],
    ["scorer", scorer?.revision],
  ] as const) {
    if (revisionValue !== undefined && revisionValue !== revision.revision) {
      failures.push(`Retrieval ${label} revision does not match suite revision ${revision.revision}`);
    }
  }

  let corpusIds = new Set<string>();
  if (corpus) corpusIds = new Set(corpus.packs.flatMap((pack) => pack.practices.map((practice) => practice.id)));
  else {
    try {
      const parsed = await readJson(paths.corpusPath);
      const identity = parseCorpusIdentity(parsed, `${revisionLabel} corpus inventory`);
      if (identity.identity) corpusIds = new Set(identity.identity.packs.flatMap((pack) => pack.practices.map((practice) => practice.id)));
    } catch {
      // The detailed read failure is already reported above.
    }
  }

  if (cases && labels) {
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
  }

  if (scorer) {
    if (scorer.resultLimit > scorer.candidateWidth) failures.push("Retrieval scorer resultLimit must not exceed candidateWidth");
    if (scorer.candidateWidth !== 20 || scorer.resultLimit !== 5) {
      failures.push("Retrieval first baseline revision is pinned to candidateWidth=20 and resultLimit=5");
    }
  }

  return failures;
}

export async function validateRetrievalRankingSuite(suitePath: string): Promise<string[]> {
  const { manifest, failures: manifestFailures } = await readSuiteManifest(suitePath);
  const failures = [...manifestFailures];
  if (!manifest) return failures;

  const activePaths = revisionPaths(suitePath, manifest.revision);
  const expectedPaths = {
    corpus: relative(suitePath, activePaths.corpusPath).replaceAll("\\", "/"),
    cases: relative(suitePath, activePaths.casesPath).replaceAll("\\", "/"),
    labels: relative(suitePath, activePaths.labelsPath).replaceAll("\\", "/"),
    scorer: relative(suitePath, activePaths.scorerPath).replaceAll("\\", "/"),
  };
  for (const key of ["corpus", "cases", "labels", "scorer"] as const) {
    if (manifest[key] !== expectedPaths[key]) failures.push(`Retrieval active ${key} path does not match revision ${manifest.revision}`);
  }

  for (const revision of manifest.revisions) {
    failures.push(...(await validateRevision(suitePath, manifest, revision)));
  }
  return failures;
}

export async function validateRetrievalRankingRecordBinding(record: unknown, suitePath: string): Promise<string[]> {
  const { manifest, failures: manifestFailures } = await readSuiteManifest(suitePath);
  const failures = [...manifestFailures];
  if (!manifest) return failures;
  if (!isRecord(record)) return [...failures, "Retrieval batch record must be an object"];

  const benchmark = record.benchmark;
  const corpus = record.corpus;
  const retrieval = record.retrieval;
  if (!isRecord(benchmark) || !isRecord(corpus) || !isRecord(retrieval)) {
    return [...failures, "Retrieval batch record is missing benchmark/corpus/retrieval identity"];
  }
  if (benchmark.suiteId !== manifest.id) failures.push(`Retrieval record suiteId does not match ${manifest.id}`);
  if (benchmark.suiteVersion !== manifest.version) failures.push(`Retrieval record suiteVersion does not match ${manifest.version}`);
  const revisionName = benchmark.revision;
  if (typeof revisionName !== "string") return [...failures, "Retrieval record revision is invalid"];

  const revision = manifest.revisions.find((entry) => entry.revision === revisionName);
  if (!revision) return [...failures, `Retrieval record revision is not declared: ${revisionName}`];
  if (!frozenOrLater.has(revision.lifecycle_stage)) {
    failures.push(`Retrieval record revision is not frozen or later: ${revisionName}`);
  }

  const paths = revisionPaths(suitePath, revisionName);
  for (const [label, path, expected] of [
    ["casesSha256", paths.casesPath, benchmark.casesSha256],
    ["labelsSha256", paths.labelsPath, benchmark.labelsSha256],
    ["scorerSha256", paths.scorerPath, benchmark.scorerSha256],
  ] as const) {
    if (typeof expected !== "string") {
      failures.push(`Retrieval record ${label} is invalid`);
      continue;
    }
    try {
      const actual = await sha256File(path);
      if (actual !== expected) failures.push(`Retrieval record ${label} does not match revision ${revisionName}`);
    } catch {
      failures.push(`Retrieval record ${label} cannot be read for revision ${revisionName}`);
    }
  }

  try {
    const scorer = (await readJson(paths.scorerPath)) as Record<string, unknown>;
    if (scorer.candidateWidth !== retrieval.candidate_width || scorer.resultLimit !== retrieval.result_limit) {
      failures.push(`Retrieval record N/K does not match revision ${revisionName}`);
    }
  } catch {
    failures.push(`Retrieval record scorer cannot be read for revision ${revisionName}`);
  }

  try {
    const identity = parseCorpusIdentity(await readJson(paths.corpusPath), `Retrieval record corpus ${revisionName}`);
    failures.push(...identity.failures);
    if (identity.identity) {
      if (corpus.corpus_digest !== identity.identity.corpusDigest) failures.push(`Retrieval record corpus digest does not match revision ${revisionName}`);
      if (corpus.source_repository !== identity.identity.sourceRepository) failures.push(`Retrieval record corpus repository does not match revision ${revisionName}`);
      if (corpus.snapshot_commit !== identity.identity.snapshotCommit) failures.push(`Retrieval record corpus snapshot does not match revision ${revisionName}`);
      if (corpus.practice_count !== identity.identity.practiceCount) failures.push(`Retrieval record Practice count does not match revision ${revisionName}`);

      const recordPacks = Array.isArray(corpus.pack_artifacts) ? corpus.pack_artifacts : [];
      for (const rawPack of recordPacks) {
        if (!isRecord(rawPack) || typeof rawPack.name !== "string") continue;
        const pinned = identity.identity.packs.find((pack) => pack.name === rawPack.name);
        if (!pinned) {
          failures.push(`Retrieval record Pack is not in revision ${revisionName}: ${rawPack.name}`);
          continue;
        }
        if (rawPack.releaseVersion !== pinned.releaseVersion) failures.push(`Retrieval record Pack version does not match revision ${revisionName}: ${rawPack.name}`);
        if (rawPack.sourceCommit !== pinned.sourceCommit) failures.push(`Retrieval record Pack commit does not match revision ${revisionName}: ${rawPack.name}`);
        if (pinned.artifactDigest !== undefined && rawPack.artifactDigest !== pinned.artifactDigest) {
          failures.push(`Retrieval record Pack artifact digest does not match revision ${revisionName}: ${rawPack.name}`);
        }
        const recordPracticeIds = Array.isArray(rawPack.practiceIds) ? [...rawPack.practiceIds].sort() : [];
        const pinnedPracticeIds = pinned.practices.map((practice) => practice.id).sort();
        if (JSON.stringify(recordPracticeIds) !== JSON.stringify(pinnedPracticeIds)) {
          failures.push(`Retrieval record Pack practices do not match revision ${revisionName}: ${rawPack.name}`);
        }
      }
      if (recordPacks.length !== identity.identity.packs.length) {
        failures.push(`Retrieval record Pack count does not match revision ${revisionName}`);
      }
    }
  } catch {
    failures.push(`Retrieval record corpus cannot be read for revision ${revisionName}`);
  }

  return failures;
}
