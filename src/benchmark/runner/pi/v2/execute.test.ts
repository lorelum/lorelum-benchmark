import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256File } from "../../../fs";

const root = process.cwd();
const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const formalToolPolicyHash = "095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2";
const snapshotId = (await Bun.file(join(root, "suites", "react-skill-comparison", "tasks", "member-hub-loader", "v2", "private", "snapshot.json")).json() as { snapshot_id: string }).snapshot_id;
const sourceCommit = (await new Response(Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout).text()).trim();
const formalSystemPrompt = await Bun.file(join(root, "prompts", "formal-pi", "v1", "system.md")).text();
const formalPlanId = `pi-v2-contract-test-${crypto.randomUUID()}`;
const formalPlanPath = join(root, "experiments", "react-skill-comparison", `${formalPlanId}.yaml`);
await Bun.write(formalPlanPath, [
  `id: ${formalPlanId}`,
  "version: v1",
  "lifecycle_stage: active",
  "run_kind: pilot",
  `source_commit: ${sourceCommit}`,
  "suite: { id: react-skill-comparison, version: 0.4.0 }",
  "conditions:",
  "  - { id: baseline, label: G0, treatment: baseline/v1 }",
  "  - { id: vercel-skill, label: G1, treatment: vercel-skill/v2 }",
  "smoke_tasks: [member-hub-loader-v2]",
  "full_tasks: [member-hub-loader-v2]",
  "environment: { id: formal-pi-deepseek-v4-pro, version: v1 }",
  "agent: { id: pi, version: 0.80.10, command: pi }",
  "model: { id: deepseek/deepseek-v4-pro, version: pending-provider-snapshot }",
  "repetitions: 2",
  "seed: 1",
  "budget: { max_turns: 20, max_duration_ms: 600000 }",
  "system_prompt_path: prompts/formal-pi/v1/system.md",
  "system_prompt_hash: a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a",
  "tool_policy_hash: 095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2",
  ""
].join("\n"));
const formalPlanHash = await sha256File(formalPlanPath);
const retiredFormalPlanPath = join(root, "experiments", "react-skill-comparison", "g0-g1-smoke-v1.yaml");
const retiredFormalPlanHash = await sha256File(retiredFormalPlanPath);
const cleanupPaths = new Set<string>();

afterAll(async () => {
  await rm(formalPlanPath, { force: true });
});

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
    experiment_id: "pi-v2-test",
    experiment_plan_hash: emptyHash,
    run_kind: "smoke",
    condition_id: "baseline",
    repeat: 1,
    source_commit: sourceCommit,
    candidate_path: "starter/src/member-hub.ts",
    suite: { id: "react-skill-comparison", version: "0.4.0" },
    task: { id: "member-hub-loader-v2", revision: "v2", snapshot_id: snapshotId },
    treatment: { id: "baseline", version: "v1" },
    environment: { id: environmentId, version: "v1" },
    scorer: { id: "member-hub-loader", version: "v1" },
    agent: { id: "pi-test", version: "test-v1", model: "test-model", model_version: "test-v1", system_prompt_hash: emptyHash },
    execution: {
      command: process.execPath,
      args: ["-e", 'if (!(await Bun.file("task.md").exists()) || !(await Bun.file("starter/src/member-hub.ts").exists()) || await Bun.file("private/oracle.yaml").exists()) process.exit(1);'],
      seed: 1,
      budget: { max_turns: 1, max_duration_ms: 1000 },
      tool_policy_hash: formalToolPolicyHash
    },
    inputs: { task_prompt: "1fa9255c4f1b1f4640cddf65d43b52539fb160c3bfa3861016b2b5c675ea66f2" },
    artifacts: { manifest_name: "run-manifest.json" }
  };
}

async function writeEnvironment(id: string, withArtifactStorage = false): Promise<void> {
  const environmentPath = join(root, "environments", id, "v1");
  cleanupPaths.add(join(root, "environments", id));
  await mkdir(environmentPath, { recursive: true });
  const lines = [
    `id: ${id}`,
    "version: v1",
    'bun: ">=1.3.0"',
    "agent_runtime:",
    "  id: pi-test",
    "  version: test-v1",
    `  command: ${JSON.stringify(process.execPath)}`,
    "model:",
    "  id: test-model",
    "  version: test-v1",
    "sandbox:",
    `  policy_hash: ${formalToolPolicyHash}`,
    ...(withArtifactStorage ? [
      "artifact_storage:",
      "  uri: s3://benchmark-artifacts/runs",
      "  mode: immutable-after-upload",
      "  uploader: s3-object-lock"
    ] : []),
    ""
  ];
  await Bun.write(join(environmentPath, "environment.yaml"), lines.join("\n"));
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
    "  version: pending-provider-snapshot",
    "sandbox:",
    `  policy_hash: ${formalToolPolicyHash}`,
    ""
  ].join("\n"));
}

function formalPiArgs(): string[] {
  return ["--model", "deepseek/deepseek-v4-pro", "--system-prompt", formalSystemPrompt, "--print", "--no-session", "--no-extensions", "--no-skills", "--no-context-files", "--tools", "read,bash,edit,write,grep,find,ls", "@task.md", "Implement the task. Edit only files under starter/ and leave task.md unchanged."];
}

function formalize(document: Record<string, unknown>, conditionId = "baseline"): void {
  const treatment = conditionId === "vercel-skill" ? { id: "vercel-skill", version: "v2" } : { id: "baseline", version: "v1" };
  document.run_id = `${formalPlanId}-member-hub-loader-v2-${conditionId}-001`;
  document.experiment_id = formalPlanId;
  document.experiment_plan_hash = formalPlanHash;
  document.run_kind = "pilot";
  document.condition_id = conditionId;
  document.repeat = 1;
  document.source_commit = sourceCommit;
  document.treatment = treatment;
  document.environment = { id: "formal-pi-deepseek-v4-pro", version: "v1" };
  document.agent = { id: "pi", version: "0.80.10", model: "deepseek/deepseek-v4-pro", model_version: "pending-provider-snapshot", system_prompt_hash: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
  document.execution = {
    command: "pi",
    args: formalPiArgs(),
    seed: 1,
    budget: { max_turns: 20, max_duration_ms: 600000 },
    tool_policy_hash: formalToolPolicyHash
  };
  document.inputs = { task_prompt: "1fa9255c4f1b1f4640cddf65d43b52539fb160c3bfa3861016b2b5c675ea66f2", system_prompt: "a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a" };
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

async function coordinate(requestDocument: Record<string, unknown>, dryRun = false): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const requestPath = join(tmpdir(), `${requestDocument.run_id}.json`);
  cleanupPaths.add(requestPath);
  await Bun.write(requestPath, `${JSON.stringify(requestDocument)}\n`);
  const child = Bun.spawn([process.execPath, "run", "src/benchmark/runner/pi/v2/coordinator.ts", requestPath, ...(dryRun ? ["--dry-run"] : [])], {
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
  expect(await Bun.file(join(workspacePath, "starter", "src", "member-hub.ts")).exists()).toBe(true);
  expect(await Bun.file(join(workspacePath, "task.yaml")).exists()).toBe(false);
  expect(await Bun.file(join(workspacePath, "private", "oracle.yaml")).exists()).toBe(false);
  expect(await Bun.file(join(workspacePath, "private", "evaluator", "dashboard.test.ts")).exists()).toBe(false);
  const artifact = await Bun.file(join(artifactPath, "run-manifest.json")).json() as Record<string, unknown>;
  expect(artifact.status).toBe("completed");
  expect(Object.keys((artifact.workspace as Record<string, unknown>).starter_files as Record<string, unknown>)).toContain("src/member-hub.ts");
  expect(artifact.rule_audit).toMatchObject({
    manifest_path: "suites/react-skill-comparison/tasks/member-hub-loader/v2/private/rule-audit.yaml",
    treatment: { id: "vercel-skill", version: "v2" },
    required_rules: ["async-dependencies.md", "async-parallel.md"]
  });
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
  formalize(document, "vercel-skill");

  const result = await execute(document, true);
  const output = JSON.parse(result.stdout) as { args: string[] };

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("--skill");
  expect(result.stdout).toContain("/lorelum/treatment/SKILL.md");
  expect(result.stdout).toContain("/skill:vercel-react-best-practices");
  expect(output.args).not.toContain("--print");
  expect(output.args.slice(output.args.indexOf("--mode"), output.args.indexOf("--mode") + 2)).toEqual(["--mode", "json"]);
  const prompt = output.args.find((value) => value.startsWith("/skill:"));
  expect(prompt).toStartWith("/skill:vercel-react-best-practices Before editing, read and apply the individual rule files relevant to this task.");
  expect(prompt).toContain('<file name="/workspace/task.md">');
  expect(prompt).not.toStartWith("/skill:vercel-react-best-practices\n");
  expect(result.stdout).not.toContain("treatments/");
});

test("declares the native Vercel skill staging path without fetching in dry-run", async () => {
  const environmentId = runId();
  const id = runId();
  await writeEnvironment(environmentId);
  const document = request(id, environmentId);
  document.treatment = { id: "vercel-skill", version: "v2" };

  const result = await execute(document, true);
  expect(result.exitCode).toBe(0);
  const stagedSkill = join(root, "artifacts", "runs", id, "treatment", "SKILL.md");
  const output = JSON.parse(result.stdout) as { args: string[] };

  expect(result.exitCode).toBe(0);
  expect(output.args).toContain("--skill");
  expect(output.args.map((value) => value.replaceAll("\\", "/"))).toContain(stagedSkill.replaceAll("\\", "/"));
});

test("refuses a request that references a retired formal plan", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  formalize(document);
  document.run_id = "react-skill-comparison-g0-g1-smoke-v1-workspace-overview-loader-v1-baseline-001";
  document.experiment_id = "react-skill-comparison-g0-g1-smoke-v1";
  document.experiment_plan_hash = retiredFormalPlanHash;
  document.treatment = { id: "baseline", version: "v1" };
  document.condition_id = "baseline";

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Experiment plan is retired");
});

test("rejects Pi arguments outside the pinned public-only policy", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  formalize(document);
  document.execution = {
    command: "pi",
    args: [...formalPiArgs(), "--append-system-prompt", "untracked input"],
    seed: 1,
    budget: { max_turns: 20, max_duration_ms: 600000 },
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
  document.agent = { id: "pi", version: "0.80.10", model: "deepseek/deepseek-v4-pro", model_version: "pending-provider-snapshot", system_prompt_hash: emptyHash };
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
}, 30_000);

test("refuses formal coordination until the provider model snapshot is resolved", async () => {
  const id = runId();
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  cleanupPaths.add(join(root, "results", "records", "react-skill-comparison", "member-hub-loader-v2", `${id}.json`));
  const document = request(id, "formal-pi-deepseek-v4-pro");
  formalize(document);

  const result = await coordinate(document);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("immutable provider model snapshot ID");
  expect(await Bun.file(join(root, "results", "records", "react-skill-comparison", "member-hub-loader-v2", `${id}.json`)).exists()).toBe(false);
});

test("rejects forged formal experiment provenance", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  formalize(document);
  document.experiment_plan_hash = emptyHash;

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Experiment plan hash does not match");
});

test("rejects a formal request with a forged run kind", async () => {
  const document = request(runId(), "formal-pi-deepseek-v4-pro");
  formalize(document);
  document.run_kind = "official";

  const result = await execute(document, true);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Experiment provenance does not match");
});

test("does not write a record when immutable artifact storage is unavailable", async () => {
  const id = runId();
  const environmentId = runId();
  await writeEnvironment(environmentId, true);
  cleanupPaths.add(join(root, "environments", environmentId));
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  const recordPath = join(root, "results", "records", "react-skill-comparison", "member-hub-loader-v2", `${id}.json`);
  cleanupPaths.add(recordPath);
  const document = request(id, environmentId);

  const result = await coordinate(document);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Protected artifact storage is not configured");
  expect(await Bun.file(recordPath).exists()).toBe(false);
});

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

test("coordinates evaluator output into a formal immutable record", async () => {
  const id = runId();
  const environmentId = runId();
  await writeEnvironment(environmentId);
  cleanupPaths.add(join(root, "environments", environmentId));
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  cleanupPaths.add(join(root, "results", "records", "react-skill-comparison", "member-hub-loader-v2", `${id}.json`));
  const document = request(id, environmentId);
  const reference = await Bun.file(join(root, "suites", "react-skill-comparison", "tasks", "member-hub-loader", "v2", "private", "reference", "src", "member-hub.ts")).text();
  (document.execution as Record<string, unknown>).args = ["-e", `await Bun.write(Bun.env.CANDIDATE_PATH, ${JSON.stringify(reference)});`];

  const result = await coordinate(document);

  if (result.exitCode !== 0) {
    const artifactRoot = join(root, "artifacts", "runs", id);
    const readOptional = async (name: string) => (await Bun.file(join(artifactRoot, name)).exists() ? Bun.file(join(artifactRoot, name)).text() : "");
    throw new Error(`${result.stdout}\n${result.stderr}\n${await readOptional("pi.stdout.log")}\n${await readOptional("pi.stderr.log")}\n${await readOptional("evaluator.stdout.log")}\n${await readOptional("evaluator.stderr.log")}`);
  }
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as Record<string, string>;
  const record = await Bun.file(join(root, output.record)).json() as Record<string, unknown>;
  expect(record.adapter).toEqual({ id: "pi", version: "v2" });
  expect(record.treatment).toEqual({ id: "baseline", version: "v1" });
  expect(record.run_kind).toBe("smoke");
  expect(record.experiment_plan_hash).toBe(emptyHash);
  expect(record.model).toMatchObject({ id: "test-model", version: "test-v1" });
  expect((record.model as Record<string, unknown>).parameters).toBeUndefined();
  expect((record.outcome as Record<string, unknown>).automated_checks_passed).toBe(true);
  expect(await Bun.file(join(root, output.run_manifest)).exists()).toBe(true);
  const runManifest = await Bun.file(join(root, output.run_manifest)).json() as Record<string, unknown>;
  expect(runManifest.rule_audit).toMatchObject({
    manifest_path: "suites/react-skill-comparison/tasks/member-hub-loader/v2/private/rule-audit.yaml",
    required_rules: ["async-dependencies.md", "async-parallel.md"]
  });
});

test("writes a failed record when Pi exits without a candidate", async () => {
  const id = runId();
  const environmentId = runId();
  await writeEnvironment(environmentId);
  cleanupPaths.add(join(root, "environments", environmentId));
  cleanupPaths.add(join(root, ".run-workspaces", id));
  cleanupPaths.add(join(root, "artifacts", "runs", id));
  cleanupPaths.add(join(root, "results", "records", "react-skill-comparison", "member-hub-loader-v2", `${id}.json`));
  const document = request(id, environmentId);
  (document.execution as Record<string, unknown>).args = ["-e", 'await (await import("node:fs/promises")).rm(Bun.env.CANDIDATE_PATH!)'];

  const result = await coordinate(document);

  expect(result.exitCode).toBe(1);
  const output = JSON.parse(result.stdout) as Record<string, string>;
  const record = await Bun.file(join(root, output.record)).json() as Record<string, unknown>;
  const outcome = record.outcome as Record<string, unknown>;
  expect(outcome.automated_checks_passed).toBe(false);
  expect(outcome.failure_reason).toContain("candidate file");
});
