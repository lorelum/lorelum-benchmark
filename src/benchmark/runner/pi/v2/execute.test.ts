import { afterEach, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const formalToolPolicyHash = "095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2";
const snapshotId = "2a8c08b6765ace825185b5b252974427cf38dcade88ccd21a964f02436322c10";
const sourceCommit = (await new Response(Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout).text()).trim();
const formalSystemPrompt = await Bun.file(join(root, "prompts", "formal-pi", "v1", "system.md")).text();
const cleanupPaths = new Set<string>();

afterEach(async () => {
  await Promise.all([...cleanupPaths].map((path) => rm(path, { force: true, recursive: true })));
  cleanupPaths.clear();
});

function runId(): string {
  return `pi-v2-${crypto.randomUUID()}`;
}

function request(id: string, environmentId: string): Record<string, unknown> {
  return {
    schema_version: "pi-run/v2",
    run_id: id,
    source_commit: sourceCommit,
    candidate_path: "starter/src/workspace-overview.ts",
    suite: { id: "react-skill-comparison", version: "0.2.0" },
    task: { id: "workspace-overview-loader-v1", revision: "v1", snapshot_id: snapshotId },
    treatment: { id: "baseline", version: "v1" },
    environment: { id: environmentId, version: "v1" },
    scorer: { id: "workspace-overview-loader", version: "v1" },
    agent: { id: "pi-test", version: "test-v1", model: "test-model", system_prompt_hash: emptyHash },
    execution: {
      command: process.execPath,
      args: ["-e", 'if (!(await Bun.file("task.md").exists()) || !(await Bun.file("starter/src/workspace-overview.ts").exists()) || await Bun.file("private/oracle.yaml").exists()) process.exit(1);'],
      seed: 1,
      budget: { max_turns: 1, max_duration_ms: 1000 },
      tool_policy_hash: formalToolPolicyHash
    },
    inputs: { task_prompt: "959b878c8f62ef4e0631a35b8871307d6872122647ecf1b9fde55292ecbd9989" },
    artifacts: { manifest_name: "run-manifest.json" }
  };
}

async function writeEnvironment(id: string): Promise<void> {
  const environmentPath = join(root, "environments", id, "v1");
  cleanupPaths.add(join(root, "environments", id));
  await mkdir(environmentPath, { recursive: true });
  await Bun.write(join(environmentPath, "environment.yaml"), [
    `id: ${id}`,
    "version: v1",
    'bun: ">=1.3.0"',
    "agent_runtime:",
    "  id: pi-test",
    "  version: test-v1",
    `  command: ${JSON.stringify(process.execPath)}`,
    "model:",
    "  id: test-model",
    "sandbox:",
    `  policy_hash: ${formalToolPolicyHash}`,
    ""
  ].join("\n"));
}

async function writePinnedPiEnvironment(id: string): Promise<void> {
  const environmentPath = join(root, "environments", id, "v1");
  cleanupPaths.add(join(root, "environments", id));
  await mkdir(environmentPath, { recursive: true });
  await Bun.write(join(environmentPath, "environment.yaml"), [
    `id: ${id}`,
    "version: v1",
    'bun: ">=1.3.0"',
    "agent_runtime:",
    "  id: pi",
    "  version: 0.80.10",
    "  command: pi",
    "model:",
    "  id: deepseek/deepseek-v4-pro",
    "sandbox:",
    `  policy_hash: ${formalToolPolicyHash}`,
    ""
  ].join("\n"));
}

function formalPiArgs(): string[] {
  return ["--model", "deepseek/deepseek-v4-pro", "--system-prompt", formalSystemPrompt, "--print", "--no-session", "--no-extensions", "--no-skills", "--no-context-files", "--tools", "read,bash,edit,write,grep,find,ls", "@task.md", "Implement the task. Edit only files under starter/ and leave task.md unchanged."];
}

async function execute(requestDocument: Record<string, unknown>, dryRun = false): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const requestPath = join(tmpdir(), `${requestDocument.run_id}.json`);
  cleanupPaths.add(requestPath);
  await Bun.write(requestPath, `${JSON.stringify(requestDocument)}\n`);
  const child = Bun.spawn([process.execPath, "run", "src/benchmark/runner/pi/v2/execute.ts", requestPath, ...(dryRun ? ["--dry-run"] : [])], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe"
  });
  return {
    exitCode: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text()
  };
}

test("creates an isolated public-only workspace and artifact manifest", async () => {
  const id = runId();
  const environmentId = runId();
  await writeEnvironment(environmentId);
  const workspacePath = join(root, ".run-workspaces", id);
  cleanupPaths.add(workspacePath);
  const artifactPath = join(root, "artifacts", "runs", id);
  cleanupPaths.add(artifactPath);

  const result = await execute(request(id, environmentId));

  expect(result.exitCode).toBe(0);
  expect(await Bun.file(join(workspacePath, "task.md")).exists()).toBe(true);
  expect(await Bun.file(join(workspacePath, "starter", "src", "workspace-overview.ts")).exists()).toBe(true);
  expect(await Bun.file(join(workspacePath, "task.yaml")).exists()).toBe(false);
  expect(await Bun.file(join(workspacePath, "private", "oracle.yaml")).exists()).toBe(false);
  expect(await Bun.file(join(workspacePath, "private", "evaluator", "dashboard.test.ts")).exists()).toBe(false);
  const artifact = await Bun.file(join(artifactPath, "run-manifest.json")).json() as Record<string, unknown>;
  expect(artifact.status).toBe("completed");
  expect(Object.keys((artifact.workspace as Record<string, unknown>).starter_files as Record<string, unknown>)).toContain("src/workspace-overview.ts");
});

test("rejects caller-provided execution directories", async () => {
  const document = request(runId(), "unused-environment");
  const execution = document.execution as Record<string, unknown>;
  execution.cwd = ".";

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("must NOT have additional properties");
});

test("rejects a task snapshot that does not match the formal snapshot", async () => {
  const document = request(runId(), "unused-environment");
  (document.task as Record<string, unknown>).snapshot_id = "0".repeat(64);

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Task snapshot_id does not match");
});

test("rejects an unknown environment manifest", async () => {
  const document = request(runId(), "missing-environment");

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Missing environment manifest");
});

test("rejects artifact names that escape the adapter-managed directory", async () => {
  const document = request(runId(), "unused-environment");
  document.artifacts = { manifest_name: "../run-manifest.json" };

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("must match pattern");
});

test("injects only the pinned Vercel skill for the G1 treatment", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  document.treatment = { id: "vercel-skill", version: "v1" };
  document.agent = { id: "pi", version: "0.80.10", model: "deepseek/deepseek-v4-pro", system_prompt_hash: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
  document.inputs = { task_prompt: "959b878c8f62ef4e0631a35b8871307d6872122647ecf1b9fde55292ecbd9989", system_prompt: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
  document.execution = {
    command: "pi",
    args: formalPiArgs(),
    seed: 1,
    budget: { max_turns: 1, max_duration_ms: 1000 },
    tool_policy_hash: formalToolPolicyHash
  };

  const result = await execute(document, true);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("--skill");
  expect(result.stdout).toContain("treatments");
  expect(result.stdout).toContain("SKILL.md");
});

test("rejects Pi arguments outside the pinned public-only policy", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  document.agent = { id: "pi", version: "0.80.10", model: "deepseek/deepseek-v4-pro", system_prompt_hash: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
  document.inputs = { task_prompt: "959b878c8f62ef4e0631a35b8871307d6872122647ecf1b9fde55292ecbd9989", system_prompt: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
  document.execution = {
    command: "pi",
    args: [...formalPiArgs(), "--append-system-prompt", "untracked input"],
    seed: 1,
    budget: { max_turns: 1, max_duration_ms: 1000 },
    tool_policy_hash: formalToolPolicyHash
  };

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Pi arguments do not match the public-only policy");
});

test("verifies the pinned Pi runtime before a formal execution", async () => {
  const id = runId();
  const environmentId = runId();
  await writePinnedPiEnvironment(environmentId);
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  const document = request(id, environmentId);
  document.agent = { id: "pi", version: "0.80.10", model: "deepseek/deepseek-v4-pro", system_prompt_hash: emptyHash };
  document.execution = {
    command: "pi",
    args: ["--version"],
    seed: 1,
    budget: { max_turns: 1, max_duration_ms: 15000 },
    tool_policy_hash: formalToolPolicyHash
  };

  const result = await execute(document);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("0.80.10");
}, 15_000);

test("rejects a run identifier that already has workspace artifacts", async () => {
  const id = runId();
  const environmentId = runId();
  await writeEnvironment(environmentId);
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  const document = request(id, environmentId);

  expect((await execute(document)).exitCode).toBe(0);
  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Run id already has a workspace or artifacts");
});
