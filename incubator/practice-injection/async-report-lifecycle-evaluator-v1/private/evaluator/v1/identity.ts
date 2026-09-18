import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import {
  CANDIDATE_ID,
  CANDIDATE_SNAPSHOT_ID,
  CANDIDATE_SOURCE_COMMIT,
  CHECK_IDS,
  EVALUATOR_SCHEMA_VERSION,
  EVALUATOR_VERSION,
  type CheckId,
  type CheckStatus,
} from "./result";
import { listRelativeFiles } from "./files";

type Snapshot = {
  version: 1;
  algorithm: "sha256";
  snapshot_id: string;
  files: Record<string, string>;
};

export type FixtureDefinition = {
  parent: string | null;
  overlay: string | null;
  files: Record<string, string>;
};

export type FixtureManifest = {
  version: 1;
  base: {
    candidate_id: string;
    source_commit: string;
    snapshot_id: string;
    public_starter: string;
  };
  fixtures: Record<string, FixtureDefinition>;
};

export type Oracle = {
  version: 1;
  checks: Record<CheckId, { public_requirement: string; failure_reason: string }>;
  fixtures: Record<string, Record<CheckId, CheckStatus>>;
};

export type EvaluatorIdentity = {
  root: string;
  candidateRoot: string;
  baseAppRoot: string;
  fixtures: FixtureManifest;
  oracle: Oracle;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid evaluator identity: ${message}`);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPath(path: string): boolean {
  return path === path.replaceAll("\\", "/")
    && !isAbsolute(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export async function collectEvaluatorFiles(root: string): Promise<string[]> {
  return (await listRelativeFiles(root)).filter((file) => file !== "snapshot.json" && !file.endsWith(".test.ts"));
}

async function hashFiles(root: string, files: string[]): Promise<Record<string, string>> {
  const entries: Array<[string, string]> = [];
  for (const file of files) {
    if (!canonicalPath(file)) fail(`snapshot path is not canonical: ${file}`);
    entries.push([file, await sha256File(join(root, file))]);
  }
  return Object.fromEntries(entries.sort(([left], [right]) => compareCodePoints(left, right)));
}

function snapshotId(files: Record<string, string>): string {
  const sorted = Object.entries(files).sort(([left], [right]) => compareCodePoints(left, right));
  return sha256Text(JSON.stringify(Object.fromEntries(sorted)));
}

async function parseSnapshot(path: string): Promise<Snapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    fail(`snapshot is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed) || parsed.version !== 1 || parsed.algorithm !== "sha256" || typeof parsed.snapshot_id !== "string" || !isRecord(parsed.files)) {
    fail("snapshot must be a v1 sha256 file snapshot");
  }
  const files: Record<string, string> = {};
  for (const [file, digest] of Object.entries(parsed.files)) {
    if (!canonicalPath(file) || typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) fail(`snapshot entry is invalid: ${file}`);
    files[file] = digest;
  }
  return { version: 1, algorithm: "sha256", snapshot_id: parsed.snapshot_id, files };
}

async function verifySnapshotFiles(root: string, snapshot: Snapshot, expectedId?: string): Promise<void> {
  if (expectedId && snapshot.snapshot_id !== expectedId) fail("snapshot_id does not match the expected anchor");
  const actual = await hashFiles(root, Object.keys(snapshot.files));
  for (const [file, expected] of Object.entries(snapshot.files)) {
    if (actual[file] !== expected) fail(`snapshot leaf does not match: ${file}`);
  }
  if (snapshotId(snapshot.files) !== snapshot.snapshot_id) fail("snapshot_id does not match its file map");
}

export async function verifyEvaluatorSourceSnapshot(root: string, snapshotPath = join(root, "snapshot.json")): Promise<void> {
  const snapshot = await parseSnapshot(snapshotPath);
  const expectedFiles = await collectEvaluatorFiles(root);
  const actualFiles = Object.keys(snapshot.files).sort();
  if (expectedFiles.length !== actualFiles.length || expectedFiles.some((file, index) => file !== actualFiles[index])) {
    fail("evaluator source file set does not match snapshot.json");
  }
  await verifySnapshotFiles(root, snapshot);
}

async function verifyCandidateSnapshot(candidateRoot: string): Promise<void> {
  await verifySnapshotFiles(candidateRoot, await parseSnapshot(join(candidateRoot, "private", "snapshot.json")), CANDIDATE_SNAPSHOT_ID);
}

function parseFixtureManifest(value: unknown): FixtureManifest {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.base) || !isRecord(value.fixtures)) fail("fixture manifest is invalid");
  const base = value.base;
  if (
    base.candidate_id !== CANDIDATE_ID
    || base.source_commit !== CANDIDATE_SOURCE_COMMIT
    || base.snapshot_id !== CANDIDATE_SNAPSHOT_ID
    || typeof base.public_starter !== "string"
  ) fail("fixture base does not match the candidate anchor");
  const fixtures: Record<string, FixtureDefinition> = {};
  for (const [id, raw] of Object.entries(value.fixtures)) {
    if (!isRecord(raw) || (raw.parent !== null && typeof raw.parent !== "string") || (raw.overlay !== null && typeof raw.overlay !== "string") || !isRecord(raw.files)) {
      fail(`fixture is invalid: ${id}`);
    }
    const files: Record<string, string> = {};
    for (const [file, digest] of Object.entries(raw.files)) {
      if (!canonicalPath(file) || typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) fail(`fixture file is invalid: ${id}/${file}`);
      files[file] = digest;
    }
    fixtures[id] = { parent: raw.parent, overlay: raw.overlay, files };
  }
  return {
    version: 1,
    base: {
      candidate_id: CANDIDATE_ID,
      source_commit: CANDIDATE_SOURCE_COMMIT,
      snapshot_id: CANDIDATE_SNAPSHOT_ID,
      public_starter: base.public_starter,
    },
    fixtures,
  };
}

function parseOracle(value: unknown): Oracle {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.checks) || !isRecord(value.fixtures)) fail("oracle is invalid");
  const checks: Partial<Oracle["checks"]> = {};
  for (const id of CHECK_IDS) {
    const raw = value.checks[id];
    if (
      !isRecord(raw)
      || typeof raw.public_requirement !== "string"
      || typeof raw.failure_reason !== "string"
      || !/^[a-z0-9][a-z0-9-]*$/.test(raw.failure_reason)
    ) fail(`oracle check is invalid: ${id}`);
    checks[id] = { public_requirement: raw.public_requirement, failure_reason: raw.failure_reason };
  }
  const fixtures: Oracle["fixtures"] = {};
  for (const [id, raw] of Object.entries(value.fixtures)) {
    if (!isRecord(raw)) fail(`oracle fixture is invalid: ${id}`);
    const matrix: Partial<Record<CheckId, CheckStatus>> = {};
    for (const checkId of CHECK_IDS) {
      const status = raw[checkId];
      if (status !== "pass" && status !== "fail" && status !== "indeterminate") fail(`oracle fixture status is invalid: ${id}/${checkId}`);
      matrix[checkId] = status;
    }
    fixtures[id] = matrix as Record<CheckId, CheckStatus>;
  }
  return { version: 1, checks: checks as Oracle["checks"], fixtures };
}

async function verifyFixtureManifest(root: string, manifest: FixtureManifest): Promise<void> {
  const fixtureIds = Object.keys(manifest.fixtures);
  for (const id of ["public-starter", "reference", "equivalent", ...CHECK_IDS.map((checkId) => `negative/${checkId}`)]) {
    if (!fixtureIds.includes(id)) fail(`fixture is missing: ${id}`);
  }
  for (const [id, fixture] of Object.entries(manifest.fixtures)) {
    if (fixture.parent === id) fail(`fixture cannot parent itself: ${id}`);
    if (fixture.parent && !manifest.fixtures[fixture.parent]) fail(`fixture parent is missing: ${id}`);
    if (fixture.overlay) {
      const overlayRoot = resolve(root, fixture.overlay);
      const actual = await listRelativeFiles(overlayRoot);
      const expected = Object.keys(fixture.files).sort();
      if (actual.length !== expected.length || actual.some((file, index) => file !== expected[index])) fail(`fixture overlay file set does not match: ${id}`);
      const hashes = await hashFiles(overlayRoot, actual);
      for (const [file, digest] of Object.entries(hashes)) {
        if (fixture.files[file] !== digest) fail(`fixture overlay leaf does not match: ${id}/${file}`);
      }
    } else if (Object.keys(fixture.files).length !== 0) {
      fail(`fixture without overlay must not declare files: ${id}`);
    }
  }
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail(`fixture parent cycle detected: ${id}`);
    if (seen.has(id)) return;
    visiting.add(id);
    const parent = manifest.fixtures[id]?.parent;
    if (parent) visit(parent);
    visiting.delete(id);
    seen.add(id);
  };
  for (const id of fixtureIds) visit(id);
}

export async function loadEvaluatorIdentity(root = import.meta.dirname): Promise<EvaluatorIdentity> {
  const evaluatorPath = join(root, "evaluator.yaml");
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(await readFile(evaluatorPath, "utf8")) as unknown;
  } catch (error) {
    fail(`evaluator manifest cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(raw) || raw.schema_version !== EVALUATOR_SCHEMA_VERSION || raw.evaluator_version !== EVALUATOR_VERSION || !isRecord(raw.candidate)) {
    fail("evaluator manifest schema is invalid");
  }
  const candidate = raw.candidate;
  if (
    candidate.id !== CANDIDATE_ID
    || candidate.source_commit !== CANDIDATE_SOURCE_COMMIT
    || candidate.snapshot_id !== CANDIDATE_SNAPSHOT_ID
    || raw.oracle !== "oracle.yaml"
    || raw.fixtures !== "fixtures/manifest.yaml"
    || raw.snapshot !== "snapshot.json"
    || !Array.isArray(raw.checks)
    || raw.checks.length !== CHECK_IDS.length
    || raw.checks.some((value, index) => value !== CHECK_IDS[index])
  ) fail("evaluator anchor is invalid");

  await verifyEvaluatorSourceSnapshot(root);
  const candidateRoot = resolve(root, "../../../../async-report-lifecycle-v1");
  await verifyCandidateSnapshot(candidateRoot);
  const fixtureRaw = Bun.YAML.parse(await readFile(join(root, raw.fixtures), "utf8")) as unknown;
  const fixtures = parseFixtureManifest(fixtureRaw);
  await verifyFixtureManifest(root, fixtures);
  const oracleRaw = Bun.YAML.parse(await readFile(join(root, raw.oracle), "utf8")) as unknown;
  const oracle = parseOracle(oracleRaw);
  for (const [id, matrix] of Object.entries(oracle.fixtures)) {
    if (!fixtures.fixtures[id]) fail(`oracle fixture is missing from manifest: ${id}`);
    if (Object.keys(matrix).length !== CHECK_IDS.length) fail(`oracle matrix is incomplete: ${id}`);
  }
  for (const id of Object.keys(fixtures.fixtures)) {
    if (!oracle.fixtures[id]) fail(`fixture has no oracle matrix: ${id}`);
  }
  return {
    root,
    candidateRoot,
    baseAppRoot: resolve(root, fixtures.base.public_starter),
    fixtures,
    oracle,
  };
}

export async function writeEvaluatorSnapshot(root = import.meta.dirname): Promise<void> {
  const files = await collectEvaluatorFiles(root);
  const snapshot: Snapshot = {
    version: 1,
    algorithm: "sha256",
    snapshot_id: "",
    files: await hashFiles(root, files),
  };
  snapshot.snapshot_id = snapshotId(snapshot.files);
  await writeFile(join(root, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
