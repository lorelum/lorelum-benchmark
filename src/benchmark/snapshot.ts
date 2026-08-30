import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { hash, materialize, registerMaterializer } from "./kernel/core/v1/core";
import { resolveCalibrationSets } from "./kernel/core/v1/calibration-fixtures";
import { isGeneratedOutput } from "./kernel/core/v1/types";
import { materializeNodeTs, materializeReactVite, nodeTsKind, reactViteKind } from "./kernel/materializers";
import { resolveInjectionCalibration as resolveInjectionCalibrationV1 } from "./kernel/profiles/injection-calibration/v1/runtime";
import { resolveInjectionCalibration as resolveInjectionCalibrationV2 } from "./kernel/profiles/injection-calibration/v2/runtime";
import { resolveSkillTrigger } from "./kernel/profiles/skill-trigger-orchestration/v1/runtime";
import { resolveTwoStageInjectionCalibration } from "./kernel/profiles/two-stage-injection-calibration/v1/runtime";
import { joinPath, listDirectories, pathExists, relativePath, sha256Directory, sha256File, sha256Text, workspaceRoot } from "./fs";
import { discoverTasks, type TaskLocation } from "./task-discovery";

type Snapshot = {
  version: 1;
  algorithm: "sha256";
  snapshot_id: string;
  files: Record<string, string>;
  resolved?: ResolvedSnapshot;
};

type SnapshotV2 = {
  version: 2;
  algorithm: "sha256-merkle";
  snapshot_id: string;
  resolved?: ResolvedSnapshot;
};

type KernelDeclaration = {
  core: "v1";
  profile: string;
  materializer_kind: string;
};

type ResolvedSnapshot = {
  core_version: string;
  core_hash: string;
  profile: string;
  materializer_kind: string;
  input_hash: string;
  materialized_output_hash: string;
  profile_input_hash?: string;
  calibration_sets_hash?: string;
};

type KernelResolution = {
  declaration: KernelDeclaration;
  declarationPath: string;
};

type CandidateLocation = {
  track: string;
  reference: string;
  path: string;
};

type SnapshotTarget =
  | { kind: "suite-task"; group: string; reference: string; path: string }
  | { kind: "incubator-candidate"; group: string; reference: string; path: string };

const argumentsList = Bun.argv.slice(2);
const writeMode = argumentsList.includes("--write");
const v2Mode = argumentsList.includes("--v2");
const incubatorMode = argumentsList.includes("--incubator");
const [group, reference] = argumentsList.filter((argument) => !argument.startsWith("--"));
const failures: string[] = [];

registerMaterializer({ kind: reactViteKind, materialize: materializeReactVite });
registerMaterializer({ kind: nodeTsKind, materialize: materializeNodeTs });

async function discoverCandidates(): Promise<CandidateLocation[]> {
  const candidates: CandidateLocation[] = [];
  for (const track of await listDirectories(joinPath(workspaceRoot, "incubator"))) {
    if (track === "calibration-bases") continue;
    const candidatesPath = joinPath(workspaceRoot, "incubator", track);
    for (const candidate of await listDirectories(candidatesPath)) {
      candidates.push({ track, reference: candidate, path: joinPath(candidatesPath, candidate) });
    }
  }
  return candidates.sort((left, right) => left.reference.localeCompare(right.reference));
}

async function listSnapshotFiles(path: string, relative = ""): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listSnapshotFiles(joinPath(path, entry.name), entryRelative));
    else if (entry.isFile()) files.push(entryRelative);
  }
  return files;
}

async function snapshotFiles(target: SnapshotTarget, profile?: string): Promise<Record<string, string>> {
  const files = await listSnapshotFiles(target.path);
  const included = files.filter((file) => {
    if (file === "private/snapshot.json") return false;
    const segments = file.split("/");
    if (isGeneratedOutput(segments)) return false;
    if ((profile === "injection-calibration/v1" || profile === "injection-calibration/v2" || profile === "two-stage-injection-calibration/v1") && file.startsWith("private/practices/")) return false;
    // 证据索引在候选输入执行后才写入，不得使该输入对应的快照失效。
    return target.kind !== "incubator-candidate" || !file.startsWith("private/evidence-index/");
  }).sort();
  return Object.fromEntries(await Promise.all(included.map(async (file) => [file, await sha256File(joinPath(target.path, file))])));
}

async function snapshotId(files: Record<string, string>): Promise<string> {
  const content = new TextEncoder().encode(JSON.stringify(files));
  const digest = await crypto.subtle.digest("SHA-256", content);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}


function assertCanonicalPath(file: string, label: string): void {
  const normalized = file.replaceAll("\\", "/");
  if (isAbsolute(normalized)) throw new Error(`${label} must be relative: ${file}`);
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") throw new Error(`${label} must be normalized: ${file}`);
  }
}

async function assertNoSymlinks(targetPath: string, relative = ""): Promise<void> {
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${entryRelative}`);
    const entryPath = joinPath(targetPath, entry.name);
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath, entryRelative);
    }
  }
}

async function canonicalTreeRoot(files: Record<string, string>): Promise<string> {
  const sorted = Object.keys(files).sort();
  if (sorted.length === 0) return sha256Text("");
  const leaves = await Promise.all(sorted.map(async (path) => {
    assertCanonicalPath(path, "canonical tree path");
    return `${path}\0${files[path]}`;
  }));
  const layer = await Promise.all(leaves.map((leaf) => sha256Text(leaf)));
  return combineTreeLayer(layer);
}

async function combineTreeLayer(layer: string[]): Promise<string> {
  if (layer.length === 1) return layer[0];
  const next: string[] = [];
  for (let index = 0; index < layer.length; index += 2) {
    const left = layer[index];
    const right = index + 1 < layer.length ? layer[index + 1] : left;
    next.push(await sha256Text(`${left}\0${right}`));
  }
  return combineTreeLayer(next);
}

function declarationPath(target: SnapshotTarget): string {
  return target.kind === "incubator-candidate"
    ? joinPath(target.path, "private", "candidate.yaml")
    : joinPath(target.path, "public", "task.yaml");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readKernelDeclaration(target: SnapshotTarget): Promise<KernelResolution | null> {
  const manifestPath = declarationPath(target);
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) return null;
  let doc: Record<string, unknown>;
  try {
    const parsed = Bun.YAML.parse(await file.text());
    if (!isRecord(parsed)) throw new Error("declaration must be a YAML object");
    doc = parsed;
  } catch (error) {
    throw new Error(`Invalid declaration ${relativePath(manifestPath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!("kernel" in doc)) return null;
  if (!isRecord(doc.kernel)) throw new Error(`Invalid kernel declaration in ${relativePath(manifestPath)}`);
  const kernel = doc.kernel;
  if (kernel.core !== "v1") throw new Error(`Unsupported kernel core in ${relativePath(manifestPath)}: ${String(kernel.core)}`);
  if (kernel.profile !== "injection-calibration/v1" && kernel.profile !== "injection-calibration/v2" && kernel.profile !== "treatment-comparison/v1" && kernel.profile !== "skill-trigger-orchestration/v1" && kernel.profile !== "two-stage-injection-calibration/v1") throw new Error(`Unsupported kernel profile in ${relativePath(manifestPath)}: ${String(kernel.profile)}`);
  if (kernel.materializer_kind !== reactViteKind && kernel.materializer_kind !== nodeTsKind) throw new Error(`Unsupported materializer_kind in ${relativePath(manifestPath)}: ${String(kernel.materializer_kind)}`);
  return {
    declaration: { core: "v1", profile: kernel.profile, materializer_kind: kernel.materializer_kind },
    declarationPath: manifestPath,
  };
}

async function computeResolvedSnapshot(target: SnapshotTarget, resolution: KernelResolution): Promise<ResolvedSnapshot> {
  const { declaration, declarationPath: kernelDeclarationPath } = resolution;
  const publicTaskPath = joinPath(target.path, "public", "task.md");
  const publicStarterPath = joinPath(target.path, "public", "starter");
  const outputPath = await mkdtemp(join(tmpdir(), "lorelum-resolved-workspace-"));
  try {
    const calibrationSets = await resolveCalibrationSets(target.path);
    await materialize({
      candidatePath: target.path,
      publicTaskPath,
      publicStarterPath,
      outputPath,
      materializerKind: declaration.materializer_kind,
    });
    const coreHash = await sha256Directory(join(import.meta.dir, "kernel", "core", "v1"));
    const resolved = await hash({
      candidatePath: target.path,
      declarationPath: kernelDeclarationPath,
      publicTaskPath,
      publicStarterPath,
      coreVersion: declaration.core,
      coreHash,
      profile: declaration.profile,
      materializerKind: declaration.materializer_kind,
      workspacePath: outputPath,
      ...(calibrationSets ? { calibrationSetsHash: calibrationSets.calibrationSetsHash } : {}),
    });
    const profileInputHash = declaration.profile === "injection-calibration/v1" || declaration.profile === "injection-calibration/v2"
      ? (await (declaration.profile === "injection-calibration/v2" ? resolveInjectionCalibrationV2 : resolveInjectionCalibrationV1)(target.path)).profile_input_hash
      : declaration.profile === "skill-trigger-orchestration/v1"
        ? (await resolveSkillTrigger(target.path)).profile_input_hash
        : declaration.profile === "two-stage-injection-calibration/v1"
          ? (await resolveTwoStageInjectionCalibration(target.path)).profile_input_hash
          : undefined;
    return {
      core_version: resolved.coreVersion,
      core_hash: resolved.coreHash,
      profile: resolved.profile,
      materializer_kind: resolved.materializerKind,
      input_hash: resolved.inputHash,
      materialized_output_hash: resolved.materializedOutputHash,
      ...(profileInputHash ? { profile_input_hash: profileInputHash } : {}),
      ...(resolved.calibrationSetsHash ? { calibration_sets_hash: resolved.calibrationSetsHash } : {}),
    };
  } finally {
    await rm(outputPath, { force: true, recursive: true });
  }
}

const allTasks: SnapshotTarget[] = (await discoverTasks()).map((task: TaskLocation) => ({
  kind: "suite-task",
  group: task.suite,
  reference: task.reference,
  path: task.path,
}));
const allCandidates: SnapshotTarget[] = (await discoverCandidates()).map((candidate) => ({
  kind: "incubator-candidate",
  group: candidate.track,
  reference: candidate.reference,
  path: candidate.path,
}));
const availableTargets = incubatorMode ? allCandidates : (group || reference ? allTasks : [...allTasks, ...allCandidates]);
const selectedTargets = availableTargets.filter((target) => (!group || target.group === group) && (!reference || target.reference === reference));
if ((group || reference) && selectedTargets.length === 0) {
  failures.push(`${incubatorMode ? "Candidate" : "Task"} not found: ${group ?? "*"} ${reference ?? "*"}`);
}

for (const target of selectedTargets) {
  const snapshotPath = joinPath(target.path, "private", "snapshot.json");
  let files: Record<string, string>;
  let resolved: ResolvedSnapshot | undefined;
  let treeRoot: string | undefined;
  try {
    const declaration = await readKernelDeclaration(target);
    files = await snapshotFiles(target, declaration?.declaration.profile);
    resolved = declaration ? await computeResolvedSnapshot(target, declaration) : undefined;
    if (v2Mode && writeMode) {
      await assertNoSymlinks(target.path);
      treeRoot = await canonicalTreeRoot(files);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }
  if (v2Mode && writeMode) {
    const document: SnapshotV2 = { version: 2, algorithm: "sha256-merkle", snapshot_id: treeRoot!, ...(resolved ? { resolved } : {}) };
    await Bun.write(snapshotPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`Wrote ${relativePath(snapshotPath)}`);
    continue;
  }

  const document: Snapshot = { version: 1, algorithm: "sha256", snapshot_id: await snapshotId(files), files, ...(resolved ? { resolved } : {}) };

  if (writeMode) {
    await Bun.write(snapshotPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`Wrote ${relativePath(snapshotPath)}`);
    continue;
  }

  if (!(await pathExists(snapshotPath))) {
    failures.push(`Missing snapshot: ${relativePath(snapshotPath)}`);
    continue;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await Bun.file(snapshotPath).text()) as Record<string, unknown>;
  } catch (error) {
    failures.push(`Invalid snapshot ${relativePath(snapshotPath)}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  if (parsed.version === 2) {
    if (parsed.algorithm !== "sha256-merkle" || typeof parsed.snapshot_id !== "string") {
      failures.push(`Unsupported snapshot format: ${relativePath(snapshotPath)}`);
      continue;
    }
    try {
      await assertNoSymlinks(target.path);
      const expectedTreeRoot = await canonicalTreeRoot(files);
      if (parsed.snapshot_id !== expectedTreeRoot) {
        failures.push(`Snapshot mismatch: ${relativePath(snapshotPath)}/snapshot_id (expected ${parsed.snapshot_id}, recomputed ${expectedTreeRoot})`);
        for (const [path, hash] of Object.entries(files).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
          failures.push(`  tree-leaf ${relativePath(target.path)}/${path}=${hash}`);
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    const expectedResolved = isRecord(parsed.resolved) ? parsed.resolved as ResolvedSnapshot : undefined;
    if (resolved && expectedResolved) {
      for (const key of ["core_version", "core_hash", "profile", "materializer_kind", "input_hash", "materialized_output_hash", "profile_input_hash", "calibration_sets_hash"] as const) {
        if (expectedResolved[key] !== resolved[key]) failures.push(`Resolved snapshot mismatch: ${relativePath(snapshotPath)}/${key}`);
      }
    } else if (resolved && !expectedResolved) {
      failures.push(`Missing resolved snapshot: ${relativePath(snapshotPath)}`);
    } else if (!resolved && expectedResolved) {
      failures.push(`Unexpected resolved snapshot: ${relativePath(snapshotPath)}`);
    }
    continue;
  }

  if (parsed.version !== 1 || parsed.algorithm !== "sha256") {
    failures.push(`Unsupported snapshot format: ${relativePath(snapshotPath)}`);
    continue;
  }
  const expected = parsed as Snapshot;
  if (expected.snapshot_id !== document.snapshot_id) failures.push(`Snapshot mismatch: ${relativePath(snapshotPath)}/snapshot_id`);

  const expectedFiles = expected.files ?? {};
  const allFiles = new Set([...Object.keys(expectedFiles), ...Object.keys(files)]);
  for (const file of [...allFiles].sort()) {
    if (expectedFiles[file] !== files[file]) failures.push(`Snapshot mismatch: ${relativePath(target.path)}/${file}`);
  }
  if (resolved && expected.resolved) {
    for (const key of ["core_version", "core_hash", "profile", "materializer_kind", "input_hash", "materialized_output_hash", "profile_input_hash", "calibration_sets_hash"] as const) {
      if (expected.resolved[key] !== resolved[key]) failures.push(`Resolved snapshot mismatch: ${relativePath(snapshotPath)}/${key}`);
    }
  } else if (resolved && !expected.resolved) {
    failures.push(`Missing resolved snapshot: ${relativePath(snapshotPath)}`);
  } else if (!resolved && expected.resolved) {
    failures.push(`Unexpected resolved snapshot: ${relativePath(snapshotPath)}`);
  }
}

if (failures.length > 0) {
  console.error("Snapshot verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!writeMode) console.log("Snapshots are intact.");
