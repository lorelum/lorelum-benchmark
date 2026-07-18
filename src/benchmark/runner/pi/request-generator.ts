import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { joinPath, listFiles, relativePath, sha256File, sha256Text, workspaceRoot } from "../../fs";
import { findTask } from "../../task-discovery";
import type { PiRunRequestV2 } from "./v2/types";

type PlanCondition = { id: string; treatment: string };

type ExperimentPlan = {
  id: string;
  run_kind: "smoke" | "official";
  source_commit: string;
  suite: { id: string; version: string };
  conditions: PlanCondition[];
  smoke_tasks: string[];
  full_tasks: string[];
  environment: { id: string; version: string };
  agent: { id: string; version: string; command: string };
  model: { id: string; version: string };
  repetitions: number;
  seed: number;
  budget: PiRunRequestV2["execution"]["budget"];
  system_prompt_path: string;
  system_prompt_hash: string;
  tool_policy_hash: string;
};

type PiPolicy = {
  required_args: string[];
  tools: string;
  task_prompt: string;
  task_instruction: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPlan(value: unknown): ExperimentPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Experiment plan must be a YAML object");
  return value as ExperimentPlan;
}

function asPiPolicy(value: unknown): PiPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Sandbox policy must be a YAML object");
  const pi = (value as Record<string, unknown>).pi;
  if (!pi || typeof pi !== "object" || Array.isArray(pi)) fail("Sandbox policy must define Pi arguments");
  const candidate = pi as Record<string, unknown>;
  if (!Array.isArray(candidate.required_args) || !candidate.required_args.every((item) => typeof item === "string") || typeof candidate.tools !== "string" || typeof candidate.task_prompt !== "string" || typeof candidate.task_instruction !== "string") {
    fail("Sandbox policy Pi arguments are invalid");
  }
  return candidate as unknown as PiPolicy;
}

async function sourceCommitIsAncestor(commit: string): Promise<boolean> {
  const child = Bun.spawn(["git", "merge-base", "--is-ancestor", commit, "HEAD"], { cwd: workspaceRoot, stdout: "ignore", stderr: "ignore" });
  return (await child.exited) === 0;
}

function parseArguments(): { planPath: string; outputPath?: string; smoke: boolean; dryRun: boolean } {
  const args = Bun.argv.slice(2);
  const planPath = args.shift();
  if (!planPath) fail("Usage: bun run pi:requests -- <experiment-plan.yaml> [--smoke] [--output <directory>] [--dry-run]");
  const smoke = args.includes("--smoke");
  const dryRun = args.includes("--dry-run");
  const outputIndex = args.indexOf("--output");
  const outputPath = outputIndex === -1 ? undefined : args[outputIndex + 1];
  if (outputIndex !== -1 && !outputPath) fail("--output requires a directory");
  if (!dryRun && !outputPath) fail("--output is required unless --dry-run is used");
  return { planPath: resolve(workspaceRoot, planPath), outputPath: outputPath ? resolve(workspaceRoot, outputPath) : undefined, smoke, dryRun };
}

async function requestFor(plan: ExperimentPlan, planHash: string, policy: PiPolicy, systemPrompt: string, taskId: string, condition: PlanCondition, repeat: number): Promise<PiRunRequestV2> {
  const revisionMatch = /-v([1-9][0-9]*)$/.exec(taskId);
  if (!revisionMatch) fail(`Task id must end in -v<number>: ${taskId}`);
  const revision = `v${revisionMatch[1]}`;
  const slug = taskId.slice(0, -revision.length - 1);
  const task = await findTask(plan.suite.id, `${slug}/${revision}`);
  if (!task) fail(`Task not found: ${plan.suite.id} ${slug}/${revision}`);
  const snapshot = await Bun.file(joinPath(task.path, "private", "snapshot.json")).json() as { snapshot_id?: unknown };
  if (typeof snapshot.snapshot_id !== "string") fail(`Task snapshot is invalid: ${relativePath(task.path)}`);
  const starterFiles = await listFiles(joinPath(task.path, "public", "starter"));
  const taskCard = Bun.YAML.parse(await Bun.file(joinPath(task.path, "public", "task.yaml")).text()) as Record<string, unknown>;
  const agentInput = taskCard.agent_input;
  const declaredCandidate = isRecord(agentInput) && typeof agentInput.candidate === "string" ? agentInput.candidate : undefined;
  const candidateFile = declaredCandidate ?? (starterFiles.length === 1 ? starterFiles[0] : undefined);
  if (!candidateFile || !starterFiles.includes(candidateFile.replaceAll("\\", "/")) && !starterFiles.includes(candidateFile)) fail(`Task must declare a candidate starter file when it has multiple starter files: ${relativePath(task.path)}`);
  const [treatmentId, treatmentVersion] = condition.treatment.split("/");
  if (!treatmentId || !treatmentVersion) fail(`Invalid treatment reference: ${condition.treatment}`);
  const repeatId = String(repeat).padStart(3, "0");
  const runId = `${plan.id}-${taskId}-${condition.id}-${repeatId}`;
  return {
    schema_version: "pi-run/v2",
    run_id: runId,
    experiment_id: plan.id,
    experiment_plan_hash: planHash,
    run_kind: plan.run_kind,
    condition_id: condition.id,
    repeat,
    source_commit: plan.source_commit,
    candidate_path: `starter/${candidateFile.replaceAll("\\", "/")}`,
    suite: plan.suite,
    task: { id: taskId, revision, snapshot_id: snapshot.snapshot_id },
    treatment: { id: treatmentId, version: treatmentVersion },
    environment: plan.environment,
    scorer: { id: slug, version: revision },
    agent: { id: plan.agent.id, version: plan.agent.version, model: plan.model.id, model_version: plan.model.version, system_prompt_hash: plan.system_prompt_hash },
    execution: {
      command: plan.agent.command,
      args: ["--model", plan.model.id, "--system-prompt", systemPrompt, ...policy.required_args, "--tools", policy.tools, policy.task_prompt, policy.task_instruction],
      seed: plan.seed,
      budget: plan.budget,
      tool_policy_hash: plan.tool_policy_hash
    },
    inputs: { task_prompt: await sha256File(joinPath(task.path, "public", "task.md")), system_prompt: plan.system_prompt_hash },
    artifacts: { manifest_name: "pi-artifact-manifest.json" }
  };
}

async function main(): Promise<void> {
  const { planPath, outputPath, smoke, dryRun } = parseArguments();
  const plan = asPlan(Bun.YAML.parse(await Bun.file(planPath).text()));
  const planHash = await sha256File(planPath);
  if (!(await sourceCommitIsAncestor(plan.source_commit))) fail(`Experiment plan source_commit is not an ancestor of HEAD: ${plan.source_commit}`);
  const systemPromptPath = resolve(workspaceRoot, plan.system_prompt_path);
  const systemPrompt = await Bun.file(systemPromptPath).text();
  if (await sha256Text(systemPrompt) !== plan.system_prompt_hash) fail(`Experiment plan system_prompt_hash does not match ${relativePath(systemPromptPath)}`);
  const environment = Bun.YAML.parse(await Bun.file(joinPath(workspaceRoot, "environments", plan.environment.id, plan.environment.version, "environment.yaml")).text()) as unknown;
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) fail("Experiment environment must be a YAML object");
  const sandbox = (environment as Record<string, unknown>).sandbox;
  if (!sandbox || typeof sandbox !== "object" || Array.isArray(sandbox) || typeof (sandbox as Record<string, unknown>).policy_path !== "string") fail("Experiment environment must define sandbox policy_path");
  const policyPath = resolve(workspaceRoot, (sandbox as Record<string, unknown>).policy_path as string);
  const policy = asPiPolicy(Bun.YAML.parse(await Bun.file(policyPath).text()));
  const taskIds = smoke ? plan.smoke_tasks : plan.full_tasks;
  const requests: PiRunRequestV2[] = [];
  for (const taskId of taskIds) {
    for (const condition of plan.conditions) {
      for (let repeat = 1; repeat <= plan.repetitions; repeat += 1) requests.push(await requestFor(plan, planHash, policy, systemPrompt, taskId, condition, repeat));
    }
  }
  if (dryRun) {
    console.log(JSON.stringify(requests, null, 2));
  } else {
    await mkdir(outputPath!, { recursive: true });
    for (const request of requests) await Bun.write(joinPath(outputPath!, `${request.run_id}.json`), `${JSON.stringify(request, null, 2)}\n`);
    console.log(`Generated ${requests.length} requests in ${relativePath(outputPath!)}`);
  }
}

await main();
