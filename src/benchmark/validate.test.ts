import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const validator = join(root, "src", "benchmark", "validate.ts");

async function write(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

async function fixture(track: "practice-effectiveness" | "performance-skill-comparison"): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-validator-"));
  await cp(join(root, "schemas"), join(workspace, "schemas"), { recursive: true });
  await mkdir(join(workspace, "treatments"), { recursive: true });
  await mkdir(join(workspace, "environments"), { recursive: true });
  const suitePath = join(workspace, "suites", "fixture");
  const taskPath = join(suitePath, "tasks", "example", "v1");
  await mkdir(join(taskPath, "public", "starter"), { recursive: true });
  await mkdir(join(taskPath, "private", "evaluator"), { recursive: true });
  await write(join(taskPath, "public", "task.md"), "# Fixture\n");
  await write(join(taskPath, "public", "task.yaml"), [
    "id: example-v1",
    "version: 1",
    `track: ${track}`,
    "lifecycle_stage: pilot",
    "source: {}",
    "runtime:",
    "  command: bun",
    "evaluator_version: 1",
    "agent_input:",
    "  prompt: task.md",
    "  starter: starter",
    "applicable_conditions:",
    "  - baseline",
    ""
  ].join("\n"));
  await write(join(taskPath, "private", "oracle.yaml"), "id: example-v1\n");
  await write(join(taskPath, "private", "snapshot.json"), "{}\n");
  await write(join(suitePath, "suite.yaml"), [
    "id: fixture",
    "version: 0.1.0",
    `track: ${track}`,
    "lifecycle_stage: pilot",
    "conditions:",
    "  - baseline",
    "tasks:",
    "  - id: example-v1",
    "    path: tasks/example/v1",
    "    lifecycle_stage: pilot",
    ""
  ].join("\n"));
  if (track === "performance-skill-comparison") {
    await mkdir(join(suitePath, "manifests"), { recursive: true });
    await write(join(suitePath, "manifests", "coverage.yaml"), [
      "version: 1",
      "baseline:",
      "  repository: fixture",
      "  revision: fixture",
      "  skill: fixture",
      "coverage_status: partial",
      "covered_rules:",
      "  - id: fixture-rule",
      "    tasks:",
      "      - missing-v1",
      "acceptance: {}",
      ""
    ].join("\n"));
  }
  return workspace;
}

async function validate(workspace: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", validator], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

test("rejects suite documents that violate their JSON Schema", async () => {
  const workspace = await fixture("practice-effectiveness");
  try {
    await write(join(workspace, "suites", "fixture", "suite.yaml"), "id: fixture\nversion: 0.1.0\ntrack: practice-effectiveness\nlifecycle_stage: pilot\nconditions: baseline\ntasks: []\n");
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Schema violation in suites/fixture/suite.yaml");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("rejects coverage manifests that reference undeclared tasks", async () => {
  const workspace = await fixture("performance-skill-comparison");
  try {
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Coverage manifest references missing task: fixture/missing-v1");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
