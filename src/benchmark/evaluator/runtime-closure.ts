import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { sha256File, sha256Text, workspaceRoot, joinPath } from "../fs";

type UnknownRecord = Record<string, unknown>;

export type RuntimeClosureDeclaration = {
  version: string;
  package_manager: "bun";
  dependencies: Record<string, string>;
  lock_input: {
    package_json_sha256: string;
    bun_lock_sha256: string;
  };
  integrity: {
    algorithm: "sha256";
    typescript_sha256: string;
  };
};

export type ResolvedRuntimeClosure = {
  declaration: RuntimeClosureDeclaration;
  resolution_root: string;
  typescript_path: string;
};

const closureStagingRoot = resolve(workspaceRoot, ".practice-runtime", "evaluator-closures");

function fail(message: string): never {
  throw new Error(`Invalid evaluator runtime closure: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: UnknownRecord, field: string): string {
  if (typeof value[field] !== "string" || value[field].length === 0) fail(`${field} must be a non-empty string`);
  return value[field];
}

function recordField(value: UnknownRecord, field: string): UnknownRecord {
  if (!isRecord(value[field])) fail(`${field} must be an object`);
  return value[field] as UnknownRecord;
}

function hashField(value: UnknownRecord, field: string): string {
  const hash = stringField(value, field);
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${field} must be a SHA-256 hash`);
  return hash;
}

export function parseRuntimeClosureDeclaration(value: unknown): RuntimeClosureDeclaration {
  if (!isRecord(value)) fail("declaration must be an object");
  const version = stringField(value, "version");
  if (value.package_manager !== "bun") fail("package_manager must be bun");
  const dependencies = recordField(value, "dependencies");
  if (typeof dependencies.typescript !== "string" || dependencies.typescript.length === 0) fail("dependencies.typescript must be a string");
  const lockInput = recordField(value, "lock_input");
  const lockInputTyped = lockInput as unknown as RuntimeClosureDeclaration["lock_input"];
  const packageJsonSha256 = hashField(lockInput, "package_json_sha256");
  const bunLockSha256 = hashField(lockInput, "bun_lock_sha256");
  const integrity = recordField(value, "integrity");
  if (integrity.algorithm !== "sha256") fail("integrity.algorithm must be sha256");
  const typescriptSha256 = hashField(integrity, "typescript_sha256");
  return {
    version,
    package_manager: "bun",
    dependencies: { typescript: dependencies.typescript as string },
    lock_input: { package_json_sha256: packageJsonSha256, bun_lock_sha256: bunLockSha256 },
    integrity: { algorithm: "sha256", typescript_sha256: typescriptSha256 },
  };
}

async function readDeclaration(candidatePath: string): Promise<RuntimeClosureDeclaration> {
  const declarationPath = resolve(candidatePath, "private", "evaluator", "runtime-closure.yaml");
  const file = Bun.file(declarationPath);
  if (!(await file.exists())) fail(`declaration is missing: ${relative(workspaceRoot, declarationPath)}`);
  let value: unknown;
  try {
    value = Bun.YAML.parse(await file.text());
  } catch (error) {
    fail(`declaration is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseRuntimeClosureDeclaration(value);
}

function lockInputPath(candidatePath: string, fileName: string): string {
  return resolve(candidatePath, "private", "evaluator", "runtime-closure", fileName);
}

async function verifyLockInput(candidatePath: string, declaration: RuntimeClosureDeclaration): Promise<{ packageJson: string; bunLock: string }> {
  const packageJsonPath = lockInputPath(candidatePath, "package.json");
  const bunLockPath = lockInputPath(candidatePath, "bun.lock");
  if (!existsSync(packageJsonPath)) fail(`lock input package.json is missing: ${relative(workspaceRoot, packageJsonPath)}`);
  if (!existsSync(bunLockPath)) fail(`lock input bun.lock is missing: ${relative(workspaceRoot, bunLockPath)}`);
  const packageJsonSha256 = await sha256File(packageJsonPath);
  const bunLockSha256 = await sha256File(bunLockPath);
  if (packageJsonSha256 !== declaration.lock_input.package_json_sha256) fail("lock input package.json sha256 mismatch");
  if (bunLockSha256 !== declaration.lock_input.bun_lock_sha256) fail("lock input bun.lock sha256 mismatch");
  return { packageJson: packageJsonPath, bunLock: bunLockPath };
}

function stagingRoot(candidateId: string, version: string): string {
  return resolve(closureStagingRoot, candidateId, version);
}

async function materializeClosure(
  candidateId: string,
  declaration: RuntimeClosureDeclaration,
  lockInput: { packageJson: string; bunLock: string },
): Promise<string> {
  const root = stagingRoot(candidateId, declaration.version);
  await mkdir(root, { recursive: true });
  const { cp } = await import("node:fs/promises");
  await cp(lockInput.packageJson, resolve(root, "package.json"), { force: true });
  await cp(lockInput.bunLock, resolve(root, "bun.lock"), { force: true });
  const install = Bun.spawn([process.execPath, "install", "--frozen-lockfile"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stderr] = await Promise.all([install.exited, new Response(install.stderr).text()]);
  if (code !== 0) fail(`isolated dependency install failed: ${stderr.trim() || "unknown error"}`);
  return root;
}

function typescriptEntryPath(resolutionRoot: string): string {
  return resolve(resolutionRoot, "node_modules", "typescript", "lib", "typescript.js");
}

async function verifyIntegrity(root: string, declaration: RuntimeClosureDeclaration): Promise<string> {
  const typescriptPath = typescriptEntryPath(root);
  if (!existsSync(typescriptPath)) fail("installed typescript parser is missing after install");
  const actualSha256 = await sha256File(typescriptPath);
  if (actualSha256 !== declaration.integrity.typescript_sha256) fail("installed typescript parser integrity mismatch");
  return typescriptPath;
}

export async function resolveRuntimeClosure(candidatePath: string, candidateId: string): Promise<ResolvedRuntimeClosure> {
  const declaration = await readDeclaration(candidatePath);
  const lockInput = await verifyLockInput(candidatePath, declaration);
  const root = await materializeClosure(candidateId, declaration, lockInput);
  const typescriptPath = await verifyIntegrity(root, declaration);
  return { declaration, resolution_root: root, typescript_path: typescriptPath };
}

export async function resolveRuntimeClosureIfDeclared(candidatePath: string, candidateId: string): Promise<ResolvedRuntimeClosure | null> {
  const declarationPath = resolve(candidatePath, "private", "evaluator", "runtime-closure.yaml");
  if (!(await Bun.file(declarationPath).exists())) return null;
  return resolveRuntimeClosure(candidatePath, candidateId);
}

export async function clearRuntimeClosureStaging(candidateId?: string): Promise<void> {
  if (candidateId) {
    await rm(stagingRoot(candidateId, ""), { force: true, recursive: true });
    return;
  }
  await rm(closureStagingRoot, { force: true, recursive: true });
}

export function runtimeClosureStagingRoot(): string {
  return closureStagingRoot;
}