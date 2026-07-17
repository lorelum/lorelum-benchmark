import { afterEach, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const snapshotId = "5db89923964f543bc3fd52bb5181af60b3aba991a834485f7a45995ea21ca175";
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
    suite: { id: "react-skill-comparison", version: "0.1.0" },
    task: { id: "async-dashboard-v1", revision: "v1", snapshot_id: snapshotId },
    treatment: { id: "baseline", version: "v1" },
    environment: { id: environmentId, version: "v1" },
    scorer: { id: "async-dashboard", version: "v1" },
    agent: { id: "pi-test", version: "test-v1", model: "test-model", system_prompt_hash: emptyHash },
    execution: {
      command: process.execPath,
      args: ["-e", 'if (!(await Bun.file("task.md").exists()) || !(await Bun.file("starter/src/dashboard.ts").exists()) || await Bun.file("private/oracle.yaml").exists()) process.exit(1);'],
      seed: 1,
      budget: { max_turns: 1, max_duration_ms: 1000 },
      tool_policy_hash: emptyHash
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
    `  policy_hash: ${emptyHash}`,
    ""
  ].join("\n"));
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
  expect(await Bun.file(join(workspacePath, "starter", "src", "dashboard.ts")).exists()).toBe(true);
  expect(await Bun.file(join(workspacePath, "private", "oracle.yaml")).exists()).toBe(false);
  const artifact = await Bun.file(join(artifactPath, "run-manifest.json")).json() as Record<string, unknown>;
  expect(artifact.status).toBe("completed");
  expect(Object.keys((artifact.workspace as Record<string, unknown>).starter_files as Record<string, unknown>)).toContain("src/dashboard.ts");
});

test("rejects caller-provided execution directories", async () => {
  const document = request(runId(), "unused-environment");
  const execution = document.execution as Record<string, unknown>;
  execution.cwd = ".";

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("must NOT have additional properties");
});
