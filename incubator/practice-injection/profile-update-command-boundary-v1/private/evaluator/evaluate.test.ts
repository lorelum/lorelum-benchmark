import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const evaluatorPath = join(candidateRoot, "private", "evaluator", "evaluate.ts");
const appPath = join(candidateRoot, "public", "starter", "app");

test("returns success when semantic checks pass and the report-only probe fails", async () => {
  const child = Bun.spawn([process.execPath, "run", evaluatorPath, appPath], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  expect(exitCode).toBe(0);
  const result = stdout.trim().split(/\r?\n/).reverse().map((line) => {
    try { return JSON.parse(line); } catch { return undefined; }
  }).find((value) => value !== undefined);
  expect(result).toEqual({ semantic: "pass", practice_probe: "fail" });
}, 30_000);
