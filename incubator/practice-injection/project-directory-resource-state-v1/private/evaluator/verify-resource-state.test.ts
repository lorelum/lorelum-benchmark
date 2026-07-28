import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..", "..");
const probe = join(root, "private/evaluator/verify-resource-state.ts");

async function run(path: string, parserRoot: string): Promise<number> {
  return await Bun.spawn([process.execPath, "run", probe, path, parserRoot], { stdout: "pipe", stderr: "pipe" }).exited;
}

async function installParser(appPath: string): Promise<void> {
  const child = Bun.spawn([process.execPath, "install", "--frozen-lockfile"], { cwd: appPath, stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(0);
}

test("calibrates explicit resource states", async () => {
  const repositoryRoot = resolve(root, "..", "..", "..");
  const resolver = await import(pathToFileURL(join(repositoryRoot, "src", "benchmark", "kernel", "core", "v1", "calibration-fixtures.ts")).href) as typeof import("../../../../../src/benchmark/kernel/core/v1/calibration-fixtures");
  const resolved = await resolver.resolveCalibrationSets(root);
  if (!resolved) throw new Error("Missing resolved calibration sets");
  const staging = await mkdtemp(join(tmpdir(), "lorelum-resource-calibration-"));
  try {
    const staged = await resolver.stageCalibrationSets(resolved, staging, { publicStarterPath: join(root, "public", "starter", "app") });
    if (!staged.publicStarterPath) throw new Error("Missing staged public starter");
    await installParser(staged.publicStarterPath);
    const fixtureRoot = join(staging, "private", "calibration", "sets", "quality-probe", "v1");
    expect(await run(staged.publicStarterPath, staged.publicStarterPath)).toBe(1);
    expect(await run(join(fixtureRoot, "anti-pattern"), staged.publicStarterPath)).toBe(1);
    expect(await run(join(fixtureRoot, "reference"), staged.publicStarterPath)).toBe(0);
    expect(await run(join(fixtureRoot, "equivalent"), staged.publicStarterPath)).toBe(0);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}, 30_000);
