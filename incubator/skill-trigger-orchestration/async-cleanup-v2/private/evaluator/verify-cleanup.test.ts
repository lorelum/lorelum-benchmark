import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../../src/benchmark/kernel/core/v1/calibration-fixtures";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-cleanup.ts");
const evaluatorPath = join(candidateRoot, "private", "evaluator", "evaluate.ts");

async function runProbe(appPath: string, parserRoot: string): Promise<number> {
  return await Bun.spawn([process.execPath, "run", probePath, appPath, parserRoot], { stdout: "pipe", stderr: "pipe" }).exited;
}

async function runEvaluator(appPath: string): Promise<number> {
  return await Bun.spawn([process.execPath, "run", evaluatorPath, appPath], { stdout: "pipe", stderr: "pipe" }).exited;
}

test("AST accepts structural cleanup while the combined probe rejects incomplete terminal-path guards", async () => {
  const resolved = await resolveCalibrationSets(candidateRoot);
  if (!resolved) throw new Error("Missing resolved calibration sets");
  const staging = await mkdtemp(join(tmpdir(), "lorelum-cleanup-calibration-"));
  try {
    const staged = await stageCalibrationSets(resolved, staging, { publicStarterPath: join(candidateRoot, "public", "starter") });
    if (!staged.publicStarterPath) throw new Error("Missing staged public starter");
    const parserRoot = join(staged.publicStarterPath, "app");
    const install = Bun.spawn([process.execPath, "install"], { cwd: parserRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    const fixtures = JSON.parse(await Bun.file(staged.manifestPath).text()).sets["cleanup-probe/v2"].fixtures;
    expect(await runProbe(parserRoot, parserRoot)).toBe(1);
    expect(await runProbe(fixtures.reference.path, parserRoot)).toBe(0);
    expect(await runProbe(fixtures.equivalent.path, parserRoot)).toBe(0);
    expect(await runProbe(fixtures["anti-pattern"].path, parserRoot)).toBe(0);
    expect(await runEvaluator(fixtures["anti-pattern"].path)).toBe(1);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}, 60_000);
