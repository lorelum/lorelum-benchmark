import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import { resolveCalibrationSets, stageCalibrationSets } from "../../../../../src/benchmark/kernel/core/v1/calibration-fixtures";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const structureProbe = join(candidateRoot, "private", "evaluator", "verify-operation-ownership.ts");

async function run(command: string[], cwd: string): Promise<number> {
  return await Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" }).exited;
}

test("operation ownership probe accepts equivalent latest-operation guards and rejects the missing failure guard", async () => {
  const resolved = await resolveCalibrationSets(candidateRoot);
  if (!resolved) throw new Error("Missing resolved calibration sets");
  const staging = await mkdtemp(join(tmpdir(), "lorelum-operation-ownership-calibration-"));
  try {
    const staged = await stageCalibrationSets(resolved, staging, { publicStarterPath: join(candidateRoot, "public", "starter") });
    if (!staged.publicStarterPath) throw new Error("Missing staged public starter");
    const parserRoot = join(staged.publicStarterPath, "app");
    const install = Bun.spawn([process.execPath, "install"], { cwd: parserRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    const fixtures = JSON.parse(await Bun.file(staged.manifestPath).text()).sets["operation-ownership/v1"].fixtures;
    expect(await run([process.execPath, "run", structureProbe, parserRoot, parserRoot], candidateRoot)).toBe(1);
    for (const id of ["reference", "equivalent"]) expect(await run([process.execPath, "run", structureProbe, fixtures[id].path, parserRoot], candidateRoot)).toBe(0);
    expect(await run([process.execPath, "run", structureProbe, fixtures["anti-pattern"].path, parserRoot], candidateRoot)).toBe(0);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
}, 120_000);
