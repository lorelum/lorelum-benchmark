import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const validator = join(root, "src", "benchmark", "validate.ts");

async function write(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

async function fixture(): Promise<string> {
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
    "track: performance-skill-comparison",
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
    "track: performance-skill-comparison",
    "lifecycle_stage: pilot",
    "conditions:",
    "  - baseline",
    "tasks:",
    "  - id: example-v1",
    "    path: tasks/example/v1",
    "    lifecycle_stage: pilot",
    ""
  ].join("\n"));
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
    "      - example-v1",
    "acceptance: {}",
    ""
  ].join("\n"));
  return workspace;
}

async function validate(workspace: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", validator], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

test("rejects suite documents that violate their JSON Schema", async () => {
  const workspace = await fixture();
  try {
    await write(join(workspace, "suites", "fixture", "suite.yaml"), "id: fixture\nversion: 0.1.0\ntrack: performance-skill-comparison\nlifecycle_stage: pilot\nconditions: baseline\ntasks: []\n");
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Schema violation in suites/fixture/suite.yaml");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("requires a structured evaluator entry when a task opts into the v2 contract", async () => {
  const workspace = await fixture();
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
  const workspace = await fixture();
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
  const workspace = await fixture();
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
  const workspace = await fixture();
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
  const workspace = await fixture();
  try {
    const coverage = join(workspace, "suites", "fixture", "manifests", "coverage.yaml");
    await write(coverage, (await Bun.file(coverage).text()).replace("example-v1", "missing-v1"));
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Coverage manifest references missing task: fixture/missing-v1");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("rejects active experiments that reference retired tasks", async () => {
  const workspace = await fixture();
  try {
    const taskCard = join(workspace, "suites", "fixture", "tasks", "example", "v1", "public", "task.yaml");
    await write(taskCard, (await Bun.file(taskCard).text()).replace("lifecycle_stage: pilot", "lifecycle_stage: retired"));
    const suitePath = join(workspace, "suites", "fixture", "suite.yaml");
    await write(suitePath, (await Bun.file(suitePath).text()).replace("    lifecycle_stage: pilot", "    lifecycle_stage: retired"));
    await write(join(workspace, "experiments", "active.yaml"), [
      "id: fixture-active", "version: v1", "lifecycle_stage: active", "run_kind: official",
      `source_commit: '${"0".repeat(40)}'`, "suite:", "  id: fixture", "  version: 0.1.0",
      "conditions:", "  - id: baseline", "    label: G0", "    treatment: baseline/v1", "  - id: control", "    label: C", "    treatment: baseline/v1",
      "smoke_tasks:", "  - example-v1", "full_tasks:", "  - example-v1",
      "environment:", "  id: local", "  version: v1", "agent:", "  id: test", "  version: v1", "  command: bun",
      "model:", "  id: test", "  version: v1", "repetitions: 3", "seed: 0", "budget:", "  max_turns: 1", "  max_duration_ms: 1",
      "system_prompt_path: prompt.md", `system_prompt_hash: '${"0".repeat(64)}'`, `tool_policy_hash: '${"0".repeat(64)}'`, ""
    ].join("\n"));
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Active experiment full_tasks references retired task: fixture/example-v1");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("allows retired experiments to retain a historical source commit", async () => {
  const workspace = await fixture();
  try {
    await write(join(workspace, "experiments", "retired.yaml"), [
      "id: fixture-retired", "version: v1", "lifecycle_stage: retired", "run_kind: pilot",
      `source_commit: '${"0".repeat(40)}'`, "suite:", "  id: fixture", "  version: 0.1.0",
      "conditions:", "  - id: baseline", "    label: G0", "    treatment: baseline/v1", "  - id: control", "    label: C", "    treatment: baseline/v1",
      "smoke_tasks:", "  - example-v1", "full_tasks:", "  - example-v1",
      "environment:", "  id: local", "  version: v1", "agent:", "  id: test", "  version: v1", "  command: bun",
      "model:", "  id: test", "  version: v1", "repetitions: 2", "seed: 0", "budget:", "  max_turns: 1", "  max_duration_ms: 1",
      "system_prompt_path: prompt.md", `system_prompt_hash: '${"0".repeat(64)}'`, `tool_policy_hash: '${"0".repeat(64)}'`, ""
    ].join("\n"));
    const result = await validate(workspace);
    expect(result.output).not.toContain("Experiment source_commit is not an ancestor of HEAD");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("rejects pilot experiments with fewer than two repetitions", async () => {
  const workspace = await fixture();
  try {
    await write(join(workspace, "experiments", "pilot.yaml"), [
      "id: fixture-pilot", "version: v1", "lifecycle_stage: active", "run_kind: pilot",
      `source_commit: '${"0".repeat(40)}'`, "suite:", "  id: fixture", "  version: 0.1.0",
      "conditions:", "  - id: baseline", "    label: G0", "    treatment: baseline/v1", "  - id: control", "    label: C", "    treatment: baseline/v1",
      "smoke_tasks:", "  - example-v1", "full_tasks:", "  - example-v1",
      "environment:", "  id: local", "  version: v1", "agent:", "  id: test", "  version: v1", "  command: bun",
      "model:", "  id: test", "  version: v1", "repetitions: 1", "seed: 0", "budget:", "  max_turns: 1", "  max_duration_ms: 1",
      "system_prompt_path: prompt.md", `system_prompt_hash: '${"0".repeat(64)}'`, `tool_policy_hash: '${"0".repeat(64)}'`, ""
    ].join("\n"));
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Pilot experiment must use at least two repetitions");
    expect(result.output).not.toContain("Schema violation in experiments/pilot.yaml");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("rejects generated output committed in a starter", async () => {
  const workspace = await fixture();
  try {
    const generatedFile = join(workspace, "suites", "fixture", "tasks", "example", "v1", "public", "starter", "dist", "index.js");
    await mkdir(join(workspace, "suites", "fixture", "tasks", "example", "v1", "public", "starter", "dist"), { recursive: true });
    await write(generatedFile, "export {};\n");
    const result = await validate(workspace);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Generated output is not allowed in starter: suites/fixture/tasks/example/v1/public/starter/dist/index.js");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
