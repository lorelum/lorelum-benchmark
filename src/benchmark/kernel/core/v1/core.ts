import { cp, lstat, mkdir, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { isGeneratedOutput, type CalibrateInput, type CalibrateResult, type CalibrationRole, type HashInput, type IsolateInput, type IsolationAudit, type MaterializeInput, type MaterializationResult, type Materializer, type ResolvedHashes } from "./types";
import { listFiles, sha256File, sha256Text } from "../../../fs";

const materializers = new Map<string, Materializer>();

export function registerMaterializer(materializer: Materializer): void {
  materializers.set(materializer.kind, materializer);
}

export function getMaterializer(kind: string): Materializer {
  const materializer = materializers.get(kind);
  if (!materializer) throw new Error(`Unknown materializer_kind: ${kind}`);
  return materializer;
}

export async function materialize(input: MaterializeInput): Promise<MaterializationResult> {
  const candidatePath = resolve(input.candidatePath);
  const outputPath = resolve(input.outputPath);
  assertPathWithin(join(candidatePath, "public"), input.publicTaskPath, "public task");
  assertPathWithin(join(candidatePath, "public"), input.publicStarterPath, "public starter");
  assertPathOutside(candidatePath, outputPath, "materialized workspace");
  await ensureFreshDirectory(outputPath, "materialized workspace");
  const materializer = getMaterializer(input.materializerKind);
  return materializer.materialize({ ...input, candidatePath, outputPath });
}

export async function isolate(input: IsolateInput): Promise<IsolationAudit> {
  const workspacePath = resolve(input.workspacePath);
  const privateHashes = new Map<string, boolean>();
  const sensitivePrivateNames = new Set<string>();
  for (const privatePath of input.privatePaths) {
    const resolvedPrivatePath = resolve(privatePath);
    if (!isAbsolute(privatePath) || resolvedPrivatePath === workspacePath || resolvedPrivatePath.startsWith(`${workspacePath}${"/"}`) || resolvedPrivatePath.startsWith(`${workspacePath}${"\\"}`)) {
      throw new Error(`Private path must be outside the materialized workspace: ${privatePath}`);
    }
    const stat = await lstat(resolvedPrivatePath).catch(() => null);
    if (!stat) throw new Error(`Private path does not exist: ${privatePath}`);
    if (stat.isSymbolicLink()) throw new Error(`Private path cannot be a symbolic link: ${privatePath}`);
    if (stat.isDirectory()) {
      for (const file of await listFiles(resolvedPrivatePath)) {
        const sourcePath = join(resolvedPrivatePath, file);
        const isCalibration = isPrivateCalibrationFile(sourcePath);
        if (!isCalibration) sensitivePrivateNames.add(basename(file));
        addPrivateHash(privateHashes, await sha256File(sourcePath), isCalibration);
      }
    } else {
      const isCalibration = isPrivateCalibrationFile(resolvedPrivatePath);
      if (!isCalibration) sensitivePrivateNames.add(basename(resolvedPrivatePath));
      addPrivateHash(privateHashes, await sha256File(resolvedPrivatePath), isCalibration);
    }
  }

  const publicHashes = await collectPublicHashes(input.publicSourcePaths ?? [], workspacePath);
  const protectedPrivateHashes = new Set(
    [...privateHashes].filter(([hash, calibrationOnly]) => !calibrationOnly || !publicHashes.has(hash)).map(([hash]) => hash),
  );

  const leaked = new Set<string>();
  const workspaceFiles = await listFiles(input.workspacePath);
  for (const file of workspaceFiles) {
    const normalized = file.replaceAll("\\", "/");
    if (normalized.split("/").includes("private") || sensitivePrivateNames.has(basename(normalized))) {
      leaked.add(file);
      continue;
    }
    const workspaceHash = await sha256File(join(input.workspacePath, file));
    if (protectedPrivateHashes.has(workspaceHash)) {
      leaked.add(file);
    }
  }
  return { leaked: [...leaked].sort(), passed: leaked.size === 0 };
}

function addPrivateHash(privateHashes: Map<string, boolean>, hash: string, isCalibration: boolean): void {
  privateHashes.set(hash, (privateHashes.get(hash) ?? true) && isCalibration);
}

async function collectPublicHashes(publicSourcePaths: string[], workspacePath: string): Promise<Set<string>> {
  const hashes = new Set<string>();
  for (const publicSourcePath of publicSourcePaths) {
    if (!isAbsolute(publicSourcePath)) throw new Error(`Public source path must be absolute: ${publicSourcePath}`);
    const resolvedPublicPath = resolve(publicSourcePath);
    if (pathsOverlap(workspacePath, resolvedPublicPath)) throw new Error(`Public source path must be independent from the materialized workspace: ${publicSourcePath}`);
    const stat = await lstat(resolvedPublicPath).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`Public source path must be a directory: ${publicSourcePath}`);
    for (const file of await listFiles(resolvedPublicPath)) {
      const sourcePath = join(resolvedPublicPath, file);
      if ((await lstat(sourcePath)).isSymbolicLink()) throw new Error(`Public source file cannot be a symbolic link: ${sourcePath}`);
      hashes.add(await sha256File(sourcePath));
    }
  }
  return hashes;
}

function isPrivateCalibrationFile(path: string): boolean {
  const segments = resolve(path).replaceAll("\\", "/").toLowerCase().split("/");
  return segments.some((segment, index) => segment === "private" && segments[index + 1] === "calibration");
}

function pathsOverlap(first: string, second: string): boolean {
  return isPathWithin(first, second) || isPathWithin(second, first);
}

function isPathWithin(root: string, candidate: string): boolean {
  const pathRelative = relative(resolve(root), resolve(candidate));
  return pathRelative === "" || (!pathRelative.startsWith(`..${"/"}`) && !pathRelative.startsWith(`..${"\\"}`) && pathRelative !== ".." && !isAbsolute(pathRelative));
}

export async function hash(input: HashInput): Promise<ResolvedHashes> {
  assertPathWithin(input.candidatePath, input.declarationPath, "kernel declaration");
  assertPathWithin(join(input.candidatePath, "public"), input.publicTaskPath, "public task");
  assertPathWithin(join(input.candidatePath, "public"), input.publicStarterPath, "public starter");
  const inputHash = await hashPublicInputAndDeclaration(input.publicTaskPath, input.publicStarterPath, input.declarationPath);
  const materializedOutputHash = await sha256DirectoryExcludingGenerated(join(input.workspacePath, "public"));
  return {
    coreVersion: input.coreVersion,
    coreHash: input.coreHash,
    profile: input.profile,
    materializerKind: input.materializerKind,
    inputHash,
    materializedOutputHash,
  };
}

export async function calibrate(input: CalibrateInput): Promise<CalibrateResult[]> {
  const results: CalibrateResult[] = [];
  for (const role of input.roles) {
    const result = await runRole(input.workspacePath, role);
    results.push(result);
  }
  return results;
}

async function runRole(workspacePath: string, role: CalibrationRole): Promise<CalibrateResult> {
  if (role.command.length === 0) throw new Error(`Calibration role has no command: ${role.id}`);
  const child = Bun.spawn(role.command, { cwd: workspacePath, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  await new Response(child.stdout).text();
  await new Response(child.stderr).text();
  return {
    role: role.id,
    exitCode,
    passed: matchesExpectation(exitCode, role.expect),
  };
}

function matchesExpectation(exitCode: number, expect: CalibrationRole["expect"]): boolean {
  switch (expect.kind) {
    case "pass": return exitCode === 0;
    case "fail": return exitCode !== 0;
    case "exit-code": return exitCode === expect.code;
  }
}

export async function copySourceExcludingGenerated(src: string, dst: string): Promise<void> {
  await ensureFreshDirectory(dst, "copy destination");
  await copyDirFiltered(src, dst);
}

async function copyDirFiltered(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && isGeneratedOutput([entry.name])) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDirFiltered(srcPath, dstPath);
    } else if (entry.isFile()) {
      await cp(srcPath, dstPath);
    }
  }
}

async function hashPublicInputAndDeclaration(taskPath: string, starterPath: string, declarationPath: string): Promise<string> {
  const starterHash = await sha256DirectoryExcludingGenerated(starterPath);
  const taskHash = await sha256File(taskPath);
  const declarationHash = await sha256File(declarationPath);
  return sha256Text(`task.md\0${taskHash}\nstarter\0${starterHash}\ndeclaration\0${declarationHash}`);
}

export async function sha256DirectoryExcludingGenerated(path: string): Promise<string> {
  const files = (await listFiles(path)).filter((file) => !isGeneratedOutput(file.replaceAll("\\", "/").split("/")));
  const entries = await Promise.all(files.map(async (file) => `${file.replaceAll("\\", "/")}\0${await sha256File(join(path, file))}`));
  return sha256Text(entries.join("\n"));
}

function assertPathWithin(root: string, candidate: string, label: string): void {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const pathRelative = relative(rootPath, candidatePath);
  if (pathRelative === "" || (!pathRelative.startsWith(`..${"/"}`) && !pathRelative.startsWith(`..${"\\"}`) && pathRelative !== ".." && !isAbsolute(pathRelative))) return;
  throw new Error(`${label} escapes its permitted root: ${candidate}`);
}

function assertPathOutside(root: string, candidate: string, label: string): void {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const pathRelative = relative(rootPath, candidatePath);
  if (pathRelative === "" || (!pathRelative.startsWith(`..${"/"}`) && !pathRelative.startsWith(`..${"\\"}`) && pathRelative !== ".." && !isAbsolute(pathRelative))) {
    throw new Error(`${label} must not be written inside the candidate source: ${candidate}`);
  }
}

async function ensureFreshDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path).catch(() => null);
  if (!stat) {
    await mkdir(path, { recursive: true });
    return;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a new or empty directory: ${path}`);
  if ((await readdir(path)).length > 0) throw new Error(`${label} must be empty: ${path}`);
}
