import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-layering.ts");
const parserRoot = join(candidateRoot, "public", "starter", "app");

async function runProbe(relativeAppRoot: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", probePath, join(candidateRoot, relativeAppRoot), parserRoot], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

test("accepts equivalent boundaries and rejects transport work in the component", async () => {
  const naive = await runProbe("public/starter/app");
  expect(naive.exitCode).toBe(1);

  const unusedImport = await runProbe("private/calibration/fixtures/unused-login-import");
  expect(unusedImport.exitCode).toBe(1);
  expect(unusedImport.output).toContain("表单提交路径");

  const detached = await runProbe("private/calibration/fixtures/detached-login-call");
  expect(detached.exitCode).toBe(1);
  expect(detached.output).toContain("表单提交路径");

  const reference = await runProbe("private/calibration/reference");
  expect(reference.exitCode).toBe(0);

  const equivalent = await runProbe("private/calibration/fixtures/equivalent-auth-boundary");
  expect(equivalent.exitCode).toBe(0);
});
