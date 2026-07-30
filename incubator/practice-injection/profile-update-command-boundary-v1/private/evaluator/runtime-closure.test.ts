import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const closureModule = await import(pathToFileURL(join(repositoryRoot, "src", "benchmark", "evaluator", "runtime-closure.ts")).href) as typeof import("../../../../../src/benchmark/evaluator/runtime-closure");
const { parseRuntimeClosureDeclaration, resolveRuntimeClosure, resolveRuntimeClosureIfDeclared, verifyRuntimeClosureRoot, clearRuntimeClosureStaging } = closureModule;

const candidateRoot = resolve(import.meta.dirname, "..", "..");

async function withCandidateCopy(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), "lorelum-closure-"));
  await cp(candidateRoot, path, { recursive: true });
  await clearRuntimeClosureStaging("profile-update-command-boundary-v1");
  return { path, cleanup: async () => { await rm(path, { force: true, recursive: true }); await clearRuntimeClosureStaging("profile-update-command-boundary-v1"); } };
}

const declarationPath = (p: string) => join(p, "private", "evaluator", "runtime-closure.yaml");
const lockDir = (p: string) => join(p, "private", "evaluator", "runtime-closure");

test("parses a valid runtime closure declaration", () => {
  const decl = parseRuntimeClosureDeclaration({
    version: "v1",
    package_manager: "bun",
    dependencies: { typescript: "5.9.3" },
    lock_input: { package_json_sha256: "a".repeat(64), bun_lock_sha256: "b".repeat(64) },
    integrity: { algorithm: "sha256", typescript_sha256: "c".repeat(64) },
  });
  expect(decl.version).toBe("v1");
  expect(decl.dependencies.typescript).toBe("5.9.3");
});

test("rejects a declaration with an invalid integrity hash", () => {
  expect(() => parseRuntimeClosureDeclaration({
    version: "v1",
    package_manager: "bun",
    dependencies: { typescript: "5.9.3" },
    lock_input: { package_json_sha256: "short", bun_lock_sha256: "b".repeat(64) },
    integrity: { algorithm: "sha256", typescript_sha256: "c".repeat(64) },
  })).toThrow();
});

test("resolveRuntimeClosureIfDeclared returns null when no closure is declared", async () => {
  const path = await mkdtemp(join(tmpdir(), "lorelum-no-closure-"));
  try {
    await mkdir(join(path, "private", "evaluator"), { recursive: true });
    expect(await resolveRuntimeClosureIfDeclared(path, "test-candidate")).toBeNull();
  } finally {
    await rm(path, { force: true, recursive: true });
  }
});

test("resolves the closure and verifies the TypeScript parser in an isolated environment", async () => {
  const fixture = await withCandidateCopy();
  try {
    const closure = await resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1");
    expect(closure.declaration.version).toBe("v1");
    expect(closure.typescript_path.replaceAll("\\", "/")).toContain("node_modules/typescript/lib/typescript.js");
    const ts = await import(pathToFileURL(closure.typescript_path).href);
    expect(typeof ts.createSourceFile).toBe("function");
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("fails closed when the lock input integrity identifier is tampered", async () => {
  const fixture = await withCandidateCopy();
  try {
    const declaration = Bun.YAML.parse(await Bun.file(declarationPath(fixture.path)).text()) as Record<string, unknown>;
    const lockInput = declaration.lock_input as Record<string, string>;
    lockInput.package_json_sha256 = "0".repeat(64);
    await writeFile(declarationPath(fixture.path), Bun.YAML.stringify(declaration));
    await expect(resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1")).rejects.toThrow(/integrity|mismatch|sha256/);
  } finally {
    await fixture.cleanup();
  }
});

test("fails closed when the installed parser integrity does not match", async () => {
  const fixture = await withCandidateCopy();
  try {
    const declaration = Bun.YAML.parse(await Bun.file(declarationPath(fixture.path)).text()) as Record<string, unknown>;
    const integrity = declaration.integrity as Record<string, string>;
    integrity.typescript_sha256 = "f".repeat(64);
    await writeFile(declarationPath(fixture.path), Bun.YAML.stringify(declaration));
    await expect(resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1")).rejects.toThrow(/integrity|mismatch/);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("fails closed when the lock input file is missing", async () => {
  const fixture = await withCandidateCopy();
  try {
    await rm(join(lockDir(fixture.path), "bun.lock"), { force: true });
    await expect(resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1")).rejects.toThrow(/missing/);
  } finally {
    await fixture.cleanup();
  }
});

test("does not resolve from a repository ancestor node_modules", async () => {
  const fixture = await withCandidateCopy();
  try {
    const closure = await resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1");
    const tsFile = await readFile(closure.typescript_path, "utf8");
    expect(tsFile.length).toBeGreaterThan(0);
    expect(closure.resolution_root).toContain(".practice-runtime");
    expect(closure.resolution_root).not.toBe(fixture.path);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);


test("verifyRuntimeClosureRoot accepts a pre-resolved root with matching integrity", async () => {
  const fixture = await withCandidateCopy();
  try {
    const resolved = await resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1");
    const verified = await verifyRuntimeClosureRoot(fixture.path, resolved.resolution_root);
    expect(verified.typescript_path).toBe(resolved.typescript_path);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("verifyRuntimeClosureRoot rejects an override root whose parser integrity does not match", async () => {
  const fixture = await withCandidateCopy();
  try {
    const resolved = await resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1");
    await expect(verifyRuntimeClosureRoot(fixture.path, fixture.path)).rejects.toThrow(/integrity|missing|parser/);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("isolated app without installed dependencies resolves TypeScript via the closure", async () => {
  const fixture = await withCandidateCopy();
  try {
    const closure = await resolveRuntimeClosure(fixture.path, "profile-update-command-boundary-v1");
    const appCopy = await mkdtemp(join(tmpdir(), "lorelum-isolated-app-"));
    try {
      await cp(join(fixture.path, "public", "starter", "app"), appCopy, { recursive: true });
      const probe = join(fixture.path, "private", "evaluator", "verify-command-boundary.ts");
      const child = Bun.spawn([process.execPath, "run", probe, appCopy, closure.resolution_root], { stdout: "pipe", stderr: "pipe" });
      const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      const result = stdout.trim().split(/\r?\n/).reverse().map((line) => { try { return JSON.parse(line); } catch { return undefined; } }).find((value) => value !== undefined);
      expect(result).toBeDefined();
      expect(result.practice_observation).not.toBe("indeterminate");
      expect(result.observation_reason).not.toBe("missing-typescript-parser");
    } finally {
      await rm(appCopy, { force: true, recursive: true });
    }
  } finally {
    await fixture.cleanup();
  }
}, 30_000);
