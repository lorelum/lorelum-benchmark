import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { materializeFixture, type MaterializedFixture } from "./calibration/materialize";
import { loadEvaluatorIdentity } from "./identity";
import type { EvaluatorResult } from "./result";

let fixture: MaterializedFixture | undefined;

beforeAll(async () => {
  const identity = await loadEvaluatorIdentity();
  fixture = await materializeFixture(identity, "reference");
});

afterAll(async () => {
  await fixture?.dispose();
});

async function runCli(args: string[], environment: Record<string, string> = {}): Promise<{ exitCode: number; result: EvaluatorResult }> {
  const child = Bun.spawn([process.execPath, "run", join(import.meta.dirname, "evaluate.ts"), ...args], {
    cwd: import.meta.dirname,
    env: { ...process.env, ...environment },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await child.exited;
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (!stdout.trim()) throw new Error(`evaluator CLI produced no output: ${stderr.trim()}`);
  return { exitCode, result: JSON.parse(stdout) as EvaluatorResult };
}

describe("async report evaluator CLI", () => {
  test("rejects condition metadata instead of accepting a second execution input", async () => {
    if (!fixture) throw new Error("fixture setup failed");
    const { exitCode, result } = await runCli([fixture.appRoot, "--condition", "baseline"]);
    expect(exitCode).toBe(2);
    expect(result.status).toBe("indeterminate");
    expect(result.checks.every((check) => check.reason === "invalid-arguments")).toBe(true);
  });

  test("produces the same hard-gate result across condition environment metadata", async () => {
    if (!fixture) throw new Error("fixture setup failed");
    const baseline = await runCli([fixture.appRoot], {
      PRACTICE_CONDITION: "baseline",
      DELIVERY_NODE_ID: "none",
    });
    const timed = await runCli([fixture.appRoot], {
      PRACTICE_CONDITION: "practice-timing",
      DELIVERY_NODE_ID: "after-plan",
      PRACTICE_ID: "async-report-lifecycle",
    });
    expect(baseline.exitCode).toBe(0);
    expect(timed.exitCode).toBe(0);
    expect(timed.result).toEqual(baseline.result);
  }, 90_000);
});
