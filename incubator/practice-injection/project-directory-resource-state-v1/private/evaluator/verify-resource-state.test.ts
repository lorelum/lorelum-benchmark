import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..", "..");
const probe = join(root, "private/evaluator/verify-resource-state.ts");
const parser = join(root, "public/starter/app");

async function run(path: string): Promise<number> {
  return await Bun.spawn([process.execPath, "run", probe, path, parser], { stdout: "pipe", stderr: "pipe" }).exited;
}

test("calibrates explicit resource states", async () => {
  const repositoryRoot = resolve(root, "..", "..", "..");
  const resolver = await import(pathToFileURL(join(repositoryRoot, "src", "benchmark", "kernel", "core", "v1", "calibration-fixtures.ts")).href) as typeof import("../../../../../src/benchmark/kernel/core/v1/calibration-fixtures");
  const resolved = await resolver.resolveCalibrationSets(root);
  if (!resolved) throw new Error("Missing resolved calibration sets");
  const staging = await mkdtemp(join(tmpdir(), "lorelum-resource-calibration-"));
  try {
    await resolver.stageCalibrationSets(resolved, staging);
    const fixtureRoot = join(staging, "private", "calibration", "sets", "quality-probe", "v1");
    expect(await run(parser)).toBe(1);
    expect(await run(join(fixtureRoot, "anti-pattern"))).toBe(1);
    expect(await run(join(fixtureRoot, "reference"))).toBe(0);
    expect(await run(join(fixtureRoot, "equivalent"))).toBe(0);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}, 30_000);
