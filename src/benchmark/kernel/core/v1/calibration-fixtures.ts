import { cp, lstat, mkdir, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isGeneratedOutput } from "./types";

type RecordValue = Record<string, unknown>;

type SourceReference = {
  ref: string;
  sha256: string;
};

type OverlayReference = {
  path: string;
  sha256: string;
};

type TreeDefinition = {
  base?: SourceReference;
  extends?: string;
  overlay?: OverlayReference;
};

type SetDefinition = {
  id: string;
  version: string;
  trees: Record<string, TreeDefinition>;
  fixtures: Record<string, string>;
};

type CalibrationSetDeclaration = {
  sets: SetDefinition[];
  profile: string;
  materializerKind: string;
};

type FileSource = {
  hash: string;
  sourcePath: string;
};

export type ResolvedCalibrationFixture = {
  id: string;
  treeHash: string;
  files: Record<string, FileSource>;
};

export type ResolvedCalibrationSet = {
  id: string;
  version: string;
  setHash: string;
  fixtures: Record<string, ResolvedCalibrationFixture>;
};

export type ResolvedCalibrationSets = {
  calibrationSetsHash: string;
  sets: Record<string, ResolvedCalibrationSet>;
};

export type StagedCalibrationSets = {
  rootPath: string;
  manifestPath: string;
};

const calibrationManifestPath = "private/calibration/sets.yaml";
const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report", ".vite", ".materialized", ".practice-runtime", ".run-workspaces", "logs"]);

function fail(message: string): never {
  throw new Error(`Invalid calibration fixture overlay: ${message}`);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: RecordValue, field: string): string {
  if (typeof value[field] !== "string" || value[field].length === 0) fail(`${field} must be a non-empty string`);
  return value[field] as string;
}

function hashField(value: RecordValue, field: string): string {
  const hash = stringField(value, field);
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${field} must be a SHA-256 hash`);
  return hash;
}

function identifier(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(value)) fail(`${label} is invalid: ${value}`);
  return value;
}

function version(value: string, label: string): string {
  if (!/^v[1-9][0-9]*$/.test(value)) fail(`${label} must use vN: ${value}`);
  return value;
}

function safeRelativePath(value: string, label: string): string {
  if (isAbsolute(value)) fail(`${label} must be relative`);
  const normalized = value.replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(`${label} must be normalized`);
  }
  return normalized;
}

function pathInside(root: string, value: string, label: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, value);
  const pathRelative = relative(resolvedRoot, resolvedPath);
  if (pathRelative === "" || pathRelative === ".." || pathRelative.startsWith(`..${"/"}`) || pathRelative.startsWith(`..${"\\"}`) || isAbsolute(pathRelative)) {
    fail(`${label} escapes its permitted root`);
  }
  return resolvedPath;
}

function parseSourceReference(value: unknown): SourceReference {
  if (!isRecord(value)) fail("tree base must be an object");
  const ref = safeRelativePath(stringField(value, "ref"), "tree base ref");
  if (!ref.startsWith("incubator/calibration-bases/")) fail("tree base ref must be inside incubator/calibration-bases");
  if (isGeneratedOutput(ref.split("/"))) fail("tree base ref must not enter a generated-output directory");
  return { ref, sha256: hashField(value, "sha256") };
}

function parseOverlayReference(value: unknown): OverlayReference {
  if (!isRecord(value)) fail("tree overlay must be an object");
  const path = safeRelativePath(stringField(value, "path"), "tree overlay path");
  if (!path.startsWith("private/calibration/") || path.startsWith("private/calibration/../") || path.includes("/practices/")) {
    fail("tree overlay path must be inside private/calibration and outside practices");
  }
  if (isGeneratedOutput(path.split("/"))) fail("tree overlay path must not enter a generated-output directory");
  return { path, sha256: hashField(value, "sha256") };
}

function parseTreeDefinition(value: unknown, name: string): TreeDefinition {
  if (!isRecord(value)) fail(`tree ${name} must be an object`);
  const base = value.base === undefined ? undefined : parseSourceReference(value.base);
  const extendsName = value.extends === undefined ? undefined : identifier(stringField(value, "extends"), `tree ${name}.extends`);
  if ((base === undefined) === (extendsName === undefined)) fail(`tree ${name} must declare exactly one of base or extends`);
  return {
    ...(base ? { base } : {}),
    ...(extendsName ? { extends: extendsName } : {}),
    ...(value.overlay === undefined ? {} : { overlay: parseOverlayReference(value.overlay) }),
  };
}

function parseSetDefinition(value: unknown): SetDefinition {
  if (!isRecord(value)) fail("calibration set must be an object");
  const id = identifier(stringField(value, "id"), "calibration set id");
  const setVersion = version(stringField(value, "version"), "calibration set version");
  if (!isRecord(value.trees)) fail(`calibration set ${id}/${setVersion} trees must be an object`);
  if (!isRecord(value.fixtures)) fail(`calibration set ${id}/${setVersion} fixtures must be an object`);
  const trees: Record<string, TreeDefinition> = {};
  for (const [treeName, tree] of Object.entries(value.trees)) {
    trees[identifier(treeName, "tree name")] = parseTreeDefinition(tree, treeName);
  }
  const fixtures: Record<string, string> = {};
  for (const [fixtureName, treeName] of Object.entries(value.fixtures)) {
    fixtures[identifier(fixtureName, "fixture name")] = identifier(String(treeName), `fixture ${fixtureName} tree`);
  }
  if (Object.keys(trees).length === 0 || Object.keys(fixtures).length === 0) fail(`calibration set ${id}/${setVersion} must declare trees and fixtures`);
  return { id, version: setVersion, trees, fixtures };
}

async function readDefinitions(candidatePath: string): Promise<CalibrationSetDeclaration | null> {
  const candidateDeclaration = join(candidatePath, "private", "candidate.yaml");
  if (!(await Bun.file(candidateDeclaration).exists())) return null;
  let candidateDocument: unknown;
  try {
    candidateDocument = Bun.YAML.parse(await Bun.file(candidateDeclaration).text());
  } catch (error) {
    fail(`candidate declaration is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(candidateDocument) || candidateDocument.calibration_sets === undefined) {
    if (await Bun.file(join(candidatePath, calibrationManifestPath)).exists()) fail("calibration set manifest is not declared by private/candidate.yaml");
    return null;
  }
  if (!isRecord(candidateDocument.kernel) || typeof candidateDocument.kernel.profile !== "string" || typeof candidateDocument.kernel.materializer_kind !== "string") {
    fail("calibration_sets requires a kernel profile and materializer_kind");
  }
  if (!isRecord(candidateDocument.calibration_sets)) fail("calibration_sets must be an object");
  const declaredManifestPath = safeRelativePath(stringField(candidateDocument.calibration_sets, "manifest"), "calibration_sets manifest");
  if (declaredManifestPath !== calibrationManifestPath) fail(`calibration_sets manifest must be ${calibrationManifestPath}`);
  const manifest = join(candidatePath, declaredManifestPath);
  if (!(await Bun.file(manifest).exists())) fail("calibration set manifest is missing");
  let document: unknown;
  try {
    document = Bun.YAML.parse(await Bun.file(manifest).text());
  } catch (error) {
    fail(`calibration set manifest is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(document) || document.version !== 1 || !Array.isArray(document.sets)) fail("calibration set manifest must declare version: 1 and sets");
  const sets = document.sets.map(parseSetDefinition);
  const keys = new Set<string>();
  for (const set of sets) {
    const key = `${set.id}/${set.version}`;
    if (keys.has(key)) fail(`calibration set is duplicated: ${key}`);
    keys.add(key);
  }
  return { sets, profile: candidateDocument.kernel.profile, materializerKind: candidateDocument.kernel.materializer_kind };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256File(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function collectSourceFiles(root: string, relativePath = ""): Promise<Record<string, FileSource>> {
  const stat = await lstat(root).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(`source directory is missing or unsafe: ${root}`);
  const files: Record<string, FileSource> = {};
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => compare(left.name, right.name))) {
    if (generatedDirectories.has(entry.name) || isGeneratedOutput([entry.name])) continue;
    const childPath = join(root, entry.name);
    const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const childStat = await lstat(childPath);
    if (childStat.isSymbolicLink()) fail(`symbolic link is not allowed: ${childRelative}`);
    if (childStat.isDirectory()) {
      Object.assign(files, await collectSourceFiles(childPath, childRelative));
      continue;
    }
    if (!childStat.isFile()) fail(`source entry is not a regular file: ${childRelative}`);
    files[childRelative] = { hash: await sha256File(childPath), sourcePath: childPath };
  }
  return files;
}

async function treeHash(files: Record<string, FileSource>): Promise<string> {
  const entries = Object.entries(files).sort(([left], [right]) => compare(left, right)).map(([path, source]) => `${path}\0${source.hash}`);
  return sha256Text(entries.join("\n"));
}

async function directoryHash(path: string): Promise<{ hash: string; files: Record<string, FileSource> }> {
  const files = await collectSourceFiles(path);
  return { hash: await treeHash(files), files };
}

/** Source-directory identity used by base and overlay declarations. */
export async function hashCalibrationFixtureSource(path: string): Promise<string> {
  return (await directoryHash(resolve(path))).hash;
}

function canonicalTreeDefinition(name: string, definition: TreeDefinition): string {
  return JSON.stringify({
    name,
    ...(definition.base ? { base: definition.base } : {}),
    ...(definition.extends ? { extends: definition.extends } : {}),
    ...(definition.overlay ? { overlay: definition.overlay } : {}),
  });
}

async function resolveSet(candidatePath: string, calibrationBaseRoot: string, profile: string, materializerKind: string, definition: SetDefinition): Promise<ResolvedCalibrationSet> {
  const visiting = new Set<string>();
  const resolvedTrees = new Map<string, Record<string, FileSource>>();
  const treeDefinitions = definition.trees;

  const resolveTree = async (name: string): Promise<Record<string, FileSource>> => {
    const existing = resolvedTrees.get(name);
    if (existing) return existing;
    if (visiting.has(name)) fail(`tree inheritance cycle: ${[...visiting, name].join(" -> ")}`);
    const tree = treeDefinitions[name];
    if (!tree) fail(`tree is missing: ${definition.id}/${definition.version}/${name}`);
    visiting.add(name);
    let files: Record<string, FileSource>;
    if (tree.base) {
      const basePath = pathInside(calibrationBaseRoot, tree.base.ref.slice("incubator/calibration-bases/".length), "tree base ref");
      const metadataPath = join(dirname(basePath), "base.yaml");
      let metadata: unknown;
      try {
        metadata = Bun.YAML.parse(await Bun.file(metadataPath).text());
      } catch (error) {
        fail(`base metadata is missing or invalid: ${tree.base.ref} (${error instanceof Error ? error.message : String(error)})`);
      }
      if (!isRecord(metadata) || metadata.profile !== profile || metadata.materializer_kind !== materializerKind || metadata.source !== "source") {
        fail(`base is incompatible with ${profile}/${materializerKind}: ${tree.base.ref}`);
      }
      const hashedBase = await directoryHash(basePath);
      if (hashedBase.hash !== tree.base.sha256) fail(`base digest does not match: ${tree.base.ref} (expected ${tree.base.sha256}, received ${hashedBase.hash})`);
      files = { ...hashedBase.files };
    } else {
      files = { ...await resolveTree(tree.extends!) };
    }
    if (tree.overlay) {
      const overlayPath = pathInside(candidatePath, tree.overlay.path, "tree overlay path");
      const hashedOverlay = await directoryHash(overlayPath);
      if (hashedOverlay.hash !== tree.overlay.sha256) fail(`overlay digest does not match: ${tree.overlay.path} (expected ${tree.overlay.sha256}, received ${hashedOverlay.hash})`);
      files = { ...files, ...hashedOverlay.files };
    }
    visiting.delete(name);
    resolvedTrees.set(name, files);
    return files;
  };

  const fixtures: Record<string, ResolvedCalibrationFixture> = {};
  for (const fixtureName of Object.keys(definition.fixtures).sort(compare)) {
    const files = await resolveTree(definition.fixtures[fixtureName]);
    fixtures[fixtureName] = { id: fixtureName, files, treeHash: await treeHash(files) };
  }
  const canonicalTrees = Object.keys(definition.trees).sort(compare).map((name) => canonicalTreeDefinition(name, definition.trees[name]));
  const canonicalFixtures = Object.keys(fixtures).sort(compare).map((name) => `${name}\0${fixtures[name].treeHash}`);
  const setHash = await sha256Text([definition.id, definition.version, ...canonicalTrees, ...canonicalFixtures].join("\n"));
  return { id: definition.id, version: definition.version, setHash, fixtures };
}

export async function resolveCalibrationSets(candidatePath: string, options: { repositoryRoot?: string } = {}): Promise<ResolvedCalibrationSets | null> {
  const resolvedCandidate = resolve(candidatePath);
  const repositoryRoot = options.repositoryRoot ?? resolve(resolvedCandidate, "..", "..", "..");
  const calibrationBaseRoot = resolve(repositoryRoot, "incubator", "calibration-bases");
  const declaration = await readDefinitions(resolvedCandidate);
  if (!declaration) return null;
  const resolvedSets: Record<string, ResolvedCalibrationSet> = {};
  for (const definition of declaration.sets.sort((left, right) => compare(`${left.id}/${left.version}`, `${right.id}/${right.version}`))) {
    const resolvedSet = await resolveSet(resolvedCandidate, calibrationBaseRoot, declaration.profile, declaration.materializerKind, definition);
    resolvedSets[`${resolvedSet.id}/${resolvedSet.version}`] = resolvedSet;
  }
  const calibrationSetsHash = await sha256Text(Object.entries(resolvedSets).sort(([left], [right]) => compare(left, right)).map(([key, set]) => `${key}\0${set.setHash}`).join("\n"));
  return { calibrationSetsHash, sets: resolvedSets };
}

export async function stageCalibrationSets(resolved: ResolvedCalibrationSets, outputPath: string): Promise<StagedCalibrationSets> {
  const rootPath = resolve(outputPath);
  const stagePrivatePath = join(rootPath, "private", "calibration", "sets");
  await mkdir(stagePrivatePath, { recursive: true });
  const manifest: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }> = {};
  for (const [setKey, set] of Object.entries(resolved.sets).sort(([left], [right]) => compare(left, right))) {
    const fixtures: Record<string, { path: string; tree_hash: string }> = {};
    for (const [fixtureName, fixture] of Object.entries(set.fixtures).sort(([left], [right]) => compare(left, right))) {
      const fixturePath = join(stagePrivatePath, set.id, set.version, fixtureName);
      for (const [relativeFile, source] of Object.entries(fixture.files)) {
        const destination = pathInside(fixturePath, relativeFile, "staged fixture file");
        await mkdir(dirname(destination), { recursive: true });
        await cp(source.sourcePath, destination);
      }
      fixtures[fixtureName] = { path: fixturePath, tree_hash: fixture.treeHash };
    }
    manifest[setKey] = { fixtures };
  }
  const manifestPath = join(rootPath, "private", "calibration", "sets-manifest.json");
  await Bun.write(manifestPath, `${JSON.stringify({ calibration_sets_hash: resolved.calibrationSetsHash, sets: manifest }, null, 2)}\n`);
  return { rootPath, manifestPath };
}
