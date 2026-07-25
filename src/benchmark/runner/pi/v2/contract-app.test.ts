import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "../../../fs";

const root = process.cwd();
const suiteId = `pi-contract-app-${crypto.randomUUID()}`;
const taskId = "workspace-dashboard-v1";
const suiteRoot = join(root, "suites", suiteId);
const taskRoot = join(suiteRoot, "tasks", "workspace-dashboard", "v1");
const cleanupPaths = new Set<string>();
const sourceCommit = (await new Response(Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout).text()).trim();

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, content);
}

await write(join(suiteRoot, "suite.yaml"), [
  `id: ${suiteId}`, "version: 0.1.0", "track: performance-skill-comparison", "lifecycle_stage: pilot",
  "conditions: [baseline, vercel-skill]", "tasks:", `  - id: ${taskId}`, "    path: tasks/workspace-dashboard/v1", "    lifecycle_stage: pilot", ""
].join("\n"));
await write(join(taskRoot, "public", "task.yaml"), [
  `id: ${taskId}`, "version: 1", "track: performance-skill-comparison", "lifecycle_stage: pilot", "evaluator_version: 2", "evaluator_contract: structured/v2", "skill_relevance: out-of-domain",
  "source: { kind: test-only }", `runtime: { command: ${JSON.stringify(`bun run evaluate -- ${suiteId} workspace-dashboard/v1`)} }`,
  "agent_input: { prompt: task.md, starter: starter }", "applicable_conditions: [baseline, vercel-skill]", ""
].join("\n"));
await write(join(taskRoot, "public", "task.md"), "# Contract app\n\nUpdate the seeded package name.\n");
await write(join(taskRoot, "public", "starter", "app", "package.json"), '{"name":"starter-dashboard"}\n');
await write(join(taskRoot, "private", "evaluator", "evaluate.ts"), [
  'export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {',
  '  console.error(JSON.stringify({ schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: true, checks: [{ id: "forged", passed: true }] }, quality: { score: 100, probes: [{ id: "forged-score", points: 100, max_points: 100 }] } }));',
  '  const candidate = await Bun.file(candidatePath).json() as { name?: unknown };',
  '  if (candidate.name !== "solved-dashboard") return { schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: false, checks: [{ id: "candidate-package", passed: false, failure_reason: "candidate package was not updated" }] }, quality: { score: 0, probes: [] } };',
  '  return { schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: true, checks: [{ id: "candidate-package", passed: true }] }, quality: { score: 37, probes: [{ id: "candidate-quality", points: 37, max_points: 100 }] } };',
  '}',
  ""
].join("\n"));
const snapshot = Bun.spawn([process.execPath, "run", "src/benchmark/snapshot.ts", suiteId, "workspace-dashboard/v1", "--write"], { cwd: root, stdout: "pipe", stderr: "pipe" });
if ((await snapshot.exited) !== 0) throw new Error(await new Response(snapshot.stderr).text());
const snapshotId = (await Bun.file(join(taskRoot, "private", "snapshot.json")).json() as { snapshot_id: string }).snapshot_id;

afterAll(async () => {
  await rm(suiteRoot, { recursive: true, force: true });
  const recordsRoot = join(root, "results", "records");
  for (const entry of await readdir(recordsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("pi-contract-app-")) await rm(join(recordsRoot, entry.name), { recursive: true, force: true });
  }
});
afterEach(async () => { await Promise.all([...cleanupPaths].map((path) => rm(path, { recursive: true, force: true }))); cleanupPaths.clear(); });

function runId(): string { return `pi-contract-${crypto.randomUUID()}`; }

async function environment(id: string): Promise<void> {
  const path = join(root, "environments", id, "v1");
  cleanupPaths.add(join(root, "environments", id));
  await mkdir(path, { recursive: true });
  await Bun.write(join(path, "environment.yaml"), [
    `id: ${id}`, "version: v1", 'bun: ">=1.3.0"', "agent_runtime:", "  id: test-agent", "  version: v1", `  command: ${JSON.stringify(process.execPath)}`,
    "model: { id: test-model, version: v1 }", "sandbox: { policy_hash: 095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2 }", ""
  ].join("\n"));
}

function request(id: string, environmentId: string): Record<string, unknown> {
  return {
    schema_version: "pi-run/v2", run_id: id, experiment_id: "contract-only", experiment_plan_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", run_kind: "smoke", condition_id: "baseline", repeat: 1,
    source_commit: sourceCommit, candidate_path: "starter/app/package.json", suite: { id: suiteId, version: "0.1.0" }, task: { id: taskId, revision: "v1", snapshot_id: snapshotId }, treatment: { id: "baseline", version: "v1" }, environment: { id: environmentId, version: "v1" }, scorer: { id: "contract-app", version: "v1" },
    agent: { id: "test-agent", version: "v1", model: "test-model", model_version: "v1", system_prompt_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    execution: { command: process.execPath, args: ["-e", 'await Bun.write(Bun.env.CANDIDATE_PATH!, "{\\\"name\\\":\\\"solved-dashboard\\\"}\\n")'], seed: 1, budget: { max_turns: 1, max_duration_ms: 5000 }, tool_policy_hash: "095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2" },
    inputs: { task_prompt: "1fa9255c4f1b1f4640cddf65d43b52539fb160c3bfa3861016b2b5c675ea66f2" }, artifacts: { manifest_name: "run-manifest.json" }
  };
}

async function invoke(command: "execute.ts" | "coordinator.ts", document: Record<string, unknown>, dryRun = false): Promise<{ code: number; stdout: string; stderr: string }> {
  const path = join(root, "scratch", `${document.run_id}.json`);
  cleanupPaths.add(path);
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, `${JSON.stringify(document)}\n`);
  const child = Bun.spawn([process.execPath, "run", `src/benchmark/runner/pi/v2/${command}`, path, ...(dryRun ? ["--dry-run"] : [])], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

test("creates a public-only workspace from a regular app package anchor", async () => {
  const id = runId(); const env = runId(); await environment(env);
  cleanupPaths.add(join(root, ".run-workspaces", id), join(root, "artifacts", "runs", id));
  const result = await invoke("execute.ts", request(id, env));
  expect(result.code, result.stderr).toBe(0);
  expect(await Bun.file(join(root, ".run-workspaces", id, "starter", "app", "package.json")).exists()).toBe(true);
  expect(await Bun.file(join(root, ".run-workspaces", id, "private", "evaluator", "evaluate.ts")).exists()).toBe(false);
});

test("rejects a forged snapshot before creating a workspace", async () => {
  const document = request(runId(), "missing-environment");
  (document.task as Record<string, unknown>).snapshot_id = "0".repeat(64);
  const result = await invoke("execute.ts", document, true);
  expect(result.code).toBe(1); expect(result.stderr).toContain("Task snapshot_id does not match");
});

test("coordinates evaluator output into a record without a repository fixture", async () => {
  const id = runId(); const env = runId(); await environment(env);
  cleanupPaths.add(join(root, ".run-workspaces", id), join(root, "artifacts", "runs", id), join(root, "results", "records", suiteId));
  const result = await invoke("coordinator.ts", request(id, env));
  expect(result.code, result.stderr).toBe(0);
  const output = JSON.parse(result.stdout) as { record: string };
  const record = await Bun.file(join(root, output.record)).json() as { outcome: { automated_checks_passed: boolean; quality_score: number } };
  expect(record.outcome.automated_checks_passed).toBe(true);
  expect(record.outcome.quality_score).toBe(37);
});

test("generates stable requests from a temporary plan", async () => {
  const planPath = join(root, "scratch", `${runId()}.yaml`); cleanupPaths.add(planPath);
  await Bun.write(planPath, [
    `id: temporary-${crypto.randomUUID()}`, "version: v1", "lifecycle_stage: active", "run_kind: pilot", `source_commit: ${sourceCommit}`, `suite: { id: ${suiteId}, version: 0.1.0 }`,
    "conditions:", "  - { id: baseline, label: G0, treatment: baseline/v1 }", "  - { id: vercel-skill, label: G1, treatment: vercel-skill/v2 }", `smoke_tasks: [${taskId}]`, `full_tasks: [${taskId}]`,
    "environment: { id: formal-pi-deepseek-v4-pro, version: v1 }", "agent: { id: pi, version: 0.80.10, command: pi }", "model: { id: test-model, version: test-v1 }", "repetitions: 2", "seed: 1", "budget: { max_turns: 1, max_duration_ms: 5000 }", "system_prompt_path: prompts/formal-pi/v1/system.md", "system_prompt_hash: a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a", "tool_policy_hash: 095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2", ""
  ].join("\n"));
  const child = Bun.spawn([process.execPath, "run", "src/benchmark/runner/pi/request-generator.ts", planPath, "--dry-run"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(code, stderr).toBe(0); expect(JSON.parse(stdout)).toHaveLength(4);
  expect(await sha256File(planPath)).toMatch(/^[a-f0-9]{64}$/);
});
