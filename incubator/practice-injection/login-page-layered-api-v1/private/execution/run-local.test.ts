import { chmod, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";

const candidateRoot = join(import.meta.dir, "../..");
const repositoryRoot = join(candidateRoot, "../../..");
const script = join(import.meta.dir, "run-local.ts");

async function execute(args: string[], env = Bun.env): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, "run", script, ...args], { cwd: repositoryRoot, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

test("dry-run plans only the three declared conditions and a public workspace", async () => {
  const result = await execute(["--dry-run", "--repeat", "1"]);
  expect(result.code).toBe(0);
  const plan = JSON.parse(result.stdout) as { planned_runs: Array<{ condition: string }>; workspace_template: string[] };
  expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  expect(plan.workspace_template).toEqual(["task.md", "app/**"]);
  expect(plan.workspace_template.join("\n")).not.toContain("private");
});

test("rejects local output outside ignored scratch", async () => {
  const result = await execute(["--dry-run", "--output", "../outside-scratch"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Local output must stay inside ignored scratch/");
});

test("copies only the starter app source into each agent workspace", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "lorelum-local-pi-"));
  const fakePi = join(fixtureRoot, "pi");
  const output = "scratch/login-practice-local/test-workspace-boundary";
  try {
    await Bun.write(fakePi, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 0.80.10; exit 0; fi\nexit 1\n");
    await chmod(fakePi, 0o755);
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: fakePi });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: Array<{ initial_workspace_files: string[] }> };
    expect(summary.entries).toHaveLength(3);
    for (const entry of summary.entries) {
      expect(entry.initial_workspace_files).toContain("app/package.json");
      expect(entry.initial_workspace_files.some((file) => file.startsWith("app/app/"))).toBeFalse();
      expect(entry.initial_workspace_files.some((file) => file.includes("node_modules/") || file.includes("dist/"))).toBeFalse();
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});
