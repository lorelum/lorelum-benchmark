import { join } from "node:path";
import { expect, test } from "bun:test";

const candidateRoot = join(import.meta.dir, "../..");
const repositoryRoot = join(candidateRoot, "../../..");
const script = join(import.meta.dir, "run-local.ts");

async function execute(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, "run", script, ...args], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

test("dry-run plans only the three declared conditions and a public workspace", async () => {
  const result = await execute("--dry-run", "--repeat", "1");
  expect(result.code).toBe(0);
  const plan = JSON.parse(result.stdout) as { planned_runs: Array<{ condition: string }>; workspace_template: string[] };
  expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  expect(plan.workspace_template).toEqual(["task.md", "app/**"]);
  expect(plan.workspace_template.join("\n")).not.toContain("private");
});

test("rejects local output outside ignored scratch", async () => {
  const result = await execute("--dry-run", "--output", "../outside-scratch");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Local output must stay inside ignored scratch/");
});
