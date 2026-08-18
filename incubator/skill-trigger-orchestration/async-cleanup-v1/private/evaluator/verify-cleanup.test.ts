import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../../src/benchmark/kernel/core/v1/calibration-fixtures";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-cleanup.ts");

async function runProbe(appPath: string, parserRoot: string): Promise<number> {
  return await Bun.spawn([process.execPath, "run", probePath, appPath, parserRoot], { stdout: "pipe", stderr: "pipe" }).exited;
}

test("accepts effective cleanup variants and rejects empty cleanup", async () => {
  const resolved = await resolveCalibrationSets(candidateRoot);
  if (!resolved) throw new Error("Missing resolved calibration sets");
  const staging = await mkdtemp(join(tmpdir(), "lorelum-cleanup-calibration-"));
  try {
    const staged = await stageCalibrationSets(resolved, staging, { publicStarterPath: join(candidateRoot, "public", "starter") });
    if (!staged.publicStarterPath) throw new Error("Missing staged public starter");
    const parserRoot = join(staged.publicStarterPath, "app");
    const install = Bun.spawn([process.execPath, "install"], { cwd: parserRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    const fixtures = JSON.parse(await Bun.file(staged.manifestPath).text()).sets["cleanup-probe/v1"].fixtures;
    expect(await runProbe(parserRoot, parserRoot)).toBe(1);
    expect(await runProbe(fixtures.reference.path, parserRoot)).toBe(0);
    expect(await runProbe(fixtures.equivalent.path, parserRoot)).toBe(0);
    expect(await runProbe(fixtures["anti-pattern"].path, parserRoot)).toBe(1);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}, 60_000);
