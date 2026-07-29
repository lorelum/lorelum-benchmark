import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const evaluatorPath = join(candidateRoot, "private", "evaluator", "evaluate.ts");
const starterPath = join(candidateRoot, "public", "starter", "app");

async function stagedApp(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "lorelum-command-evaluator-"));
  const path = join(root, "app");
  await cp(starterPath, path, { recursive: true });
  const child = Bun.spawn([process.execPath, "install", "--frozen-lockfile"], { cwd: path, stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(0);
  return { path, cleanup: async () => await rm(root, { force: true, recursive: true }) };
}

test("returns success when semantic checks pass and Practice is not observed", async () => {
  const app = await stagedApp();
  try {
    const child = Bun.spawn([process.execPath, "run", evaluatorPath, app.path], { stdout: "pipe", stderr: "pipe" });
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(exitCode).toBe(0);
    const result = stdout.trim().split(/\r?\n/).reverse().map((line) => {
      try { return JSON.parse(line); } catch { return undefined; }
    }).find((value) => value !== undefined);
    expect(result).toEqual({ semantic: "pass", practice_observation: "not-observed", observation_reason: "component-direct-adapter" });
  } finally {
    await app.cleanup();
  }
}, 30_000);
