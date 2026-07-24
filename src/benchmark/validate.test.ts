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
  await mkdir(join(workspace, "experiments"), { recursive: true });
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
    "skill_relevance: direct",
    "skill_context:",
    "  rules:",
    "    - async-parallel.md",
    "agent_input:",
    "  prompt: task.md",
    "  starter: starter",
    "applicable_conditions:",
    "  - baseline",
    ""
  ].join("\n"));
  await write(join(taskPath, "private", "oracle.yaml"), [
    "id: example-v1",
    "quality_probes:",
    "  - id: shared-work",
    "    rule_behavior_id: share-work",
    "mutations:",
    "  - id: no-sharing",
    "    rule_behavior_id: share-work",
    ""
  ].join("\n"));
  await write(join(taskPath, "private", "rule-audit.yaml"), [
    "schema_version: task-rule-audit/v1",
    "task_id: example-v1",
    "treatment:",
    "  id: vercel-skill",
    "  version: v2",
    "required_rules:",
    "  - async-parallel.md",
    "behaviors:",
    "  - id: share-work",
    "    rule: async-parallel.md",
    ""
  ].join("\n"));
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

test("requires a structured evaluator entry when a task opts into the v2 contract", async () => {
  const workspace = await fixture("practice-effectiveness");
  try {
    const taskCard = join(workspace, "suites", "fixture", "tasks", "example", "v1", "public", "task.yaml");
    await write(taskCard, `${await Bun.file(taskCard).text()}evaluator_contract: structured/v2\n`);
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Missing required path: suites/fixture/tasks/example/v1/private/evaluator/evaluate.ts");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("requires a frozen private rule audit for active direct tasks", async () => {
  const workspace = await fixture("practice-effectiveness");
  try {
    await rm(join(workspace, "suites", "fixture", "tasks", "example", "v1", "private", "rule-audit.yaml"));
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Missing required path: suites/fixture/tasks/example/v1/private/rule-audit.yaml");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("does not impose the rule audit contract on legacy direct tasks", async () => {
  const workspace = await fixture("practice-effectiveness");
  try {
    const taskCard = join(workspace, "suites", "fixture", "tasks", "example", "v1", "public", "task.yaml");
    await write(taskCard, (await Bun.file(taskCard).text()).replace("skill_context:\n  rules:\n    - async-parallel.md\n", ""));
    await rm(join(workspace, "suites", "fixture", "tasks", "example", "v1", "private", "rule-audit.yaml"));
    const result = await validate(workspace);
    expect(result.exitCode, result.output).toBe(0);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("requires active direct oracle mappings to reference delivered rule behaviors", async () => {
  const workspace = await fixture("practice-effectiveness");
  try {
    const oracle = join(workspace, "suites", "fixture", "tasks", "example", "v1", "private", "oracle.yaml");
    await write(oracle, (await Bun.file(oracle).text()).replace("rule_behavior_id: share-work", "rule_behavior_id: missing-behavior"));
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Rule behavior mapping references an undeclared behavior");
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
