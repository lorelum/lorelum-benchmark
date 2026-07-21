import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { joinPath, listFiles, pathExists, relativePath, sha256File, sha256Text, workspaceRoot } from "../../../fs";
import { findTask } from "../../../task-discovery";
import { containerCommand, containerEnvironment, containerImageInspectCommand, containerRemoveCommand, containerVersionCommand, formalContainerSandbox, localContainerImageInspectCommand, localContainerSandbox, type ContainerSandbox } from "./sandbox";
import { auditPiJsonTrace, piJsonTraceArgs } from "./trace";
import { declaredRuleContext, routedRuleNames, type RuleContext } from "./rule-router";
import { declaredSkillBundle, resolveSkillBundle, stageSkillBundle, type SkillBundle } from "./treatment-resolver";
import { taskRuleAuditFromDocument, type TaskRuleAudit } from "./task-rule-audit";
import type { PiRunArtifactManifestV2, PiRunRequestV2, PiRunResultV2 } from "./types";

const [requestPath, ...options] = Bun.argv.slice(2);
const dryRun = options.includes("--dry-run");
const ajv = new Ajv2020({ allErrors: true });
const schemaValidators = new Map<string, ValidateFunction>();

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function publicRuleNames(taskCard: Record<string, unknown>): string[] {
  const context = taskCard.skill_context;
  if (!isRecord(context) || !Array.isArray(context.rules) || context.rules.length === 0 || !context.rules.every((rule) => typeof rule === "string")) fail("Direct task must declare public skill_context.rules");
  return [...context.rules] as string[];
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await Bun.file(path).text()) as unknown;
  } catch (error) {
    fail(`Unable to read JSON ${relativePath(path)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readYaml(path: string): Promise<Record<string, unknown>> {
  try {
    const document = Bun.YAML.parse(await Bun.file(path).text()) as unknown;
    if (!isRecord(document)) fail(`YAML document must be an object: ${relativePath(path)}`);
    return document;
  } catch (error) {
    fail(`Unable to read YAML ${relativePath(path)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`).join("; ");
}

async function schemaValidator(name: string): Promise<ValidateFunction> {
  const cached = schemaValidators.get(name);
  if (cached) return cached;
  const schemaPath = joinPath(workspaceRoot, "schemas", name);
  const validator = ajv.compile(await readJson(schemaPath));
  schemaValidators.set(name, validator);
  return validator;
}

async function validateSchema(name: string, document: unknown, label: string): Promise<void> {
  const validator = await schemaValidator(name);
  if (!validator(document)) fail(`Invalid ${label}: ${formatSchemaErrors(validator.errors)}`);
}

function repositoryPath(...parts: string[]): string {
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, ...parts);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) fail(`Path escapes workspace root: ${parts.join("/")}`);
  return candidate;
}

function repositoryRelative(path: string): string {
  return relative(resolve(workspaceRoot), resolve(path)).replaceAll("\\", "/");
}

function manifestPath(kind: "treatments" | "environments", id: string, version: string, name: string): string {
  return repositoryPath(kind, id, version, name);
}

async function requireFile(path: string, label: string): Promise<void> {
  if (!(await Bun.file(path).exists())) fail(`Missing ${label}: ${relativePath(path)}`);
}

async function verifySnapshot(suite: string, reference: string, expectedSnapshot: string): Promise<void> {
  const snapshotCheck = Bun.spawn([process.execPath, "run", "src/benchmark/snapshot.ts", suite, reference], {
    cwd: workspaceRoot,
    env: Bun.env,
    stdout: "ignore",
    stderr: "pipe"
  });
  if ((await snapshotCheck.exited) !== 0) {
    fail(`Task snapshot verification failed: ${await new Response(snapshotCheck.stderr).text()}`.trim());
  }
  const snapshotPath = joinPath(workspaceRoot, "suites", suite, "tasks", reference, "private", "snapshot.json");
  const snapshot = await readJson(snapshotPath);
  if (!isRecord(snapshot) || snapshot.snapshot_id !== expectedSnapshot) {
    fail(`Task snapshot_id does not match ${relativePath(snapshotPath)}`);
  }
}

async function verifyPiArguments(request: PiRunRequestV2, policy: Record<string, unknown>): Promise<void> {
  const pi = policy.pi;
  if (!isRecord(pi) || !Array.isArray(pi.required_args) || !pi.required_args.every((value) => typeof value === "string") || typeof pi.tools !== "string" || typeof pi.task_prompt !== "string" || typeof pi.task_instruction !== "string") {
    fail("Sandbox policy must define Pi argument constraints");
  }
  const args = request.execution.args;
  const systemPrompt = args[3];
  if (typeof systemPrompt !== "string" || (await sha256Text(systemPrompt)) !== request.agent.system_prompt_hash || request.inputs.system_prompt !== request.agent.system_prompt_hash) {
    fail("Pi system prompt does not match the request hash");
  }
  const expected = ["--model", request.agent.model, "--system-prompt", systemPrompt, ...pi.required_args, "--tools", pi.tools, pi.task_prompt, pi.task_instruction];
  if (args.length !== expected.length || args.some((value, index) => value !== expected[index])) {
    fail("Pi arguments do not match the public-only policy");
  }
}

async function verifyFormalExperiment(request: PiRunRequestV2): Promise<void> {
  if (request.environment.id !== "formal-pi-deepseek-v4-pro") return;
  const matches: Array<{ path: string; plan: Record<string, unknown> }> = [];
  const experimentsPath = repositoryPath("experiments");
  for (const file of await listFiles(experimentsPath)) {
    if (!file.endsWith(".yaml")) continue;
    const path = joinPath(experimentsPath, file);
    const plan = await readYaml(path);
    if (plan.id !== request.experiment_id) continue;
    await validateSchema("experiment-plan.schema.json", plan, `experiment plan ${relativePath(path)}`);
    matches.push({ path, plan });
  }
  if (matches.length !== 1) fail(`Formal request must reference exactly one experiment plan: ${request.experiment_id}`);
  const { path, plan } = matches[0];
  if (plan.lifecycle_stage === "retired") fail(`Experiment plan is retired: ${relativePath(path)}`);
  if ((await sha256File(path)) !== request.experiment_plan_hash) fail(`Experiment plan hash does not match: ${relativePath(path)}`);
  if (plan.run_kind !== request.run_kind || plan.source_commit !== request.source_commit) fail(`Experiment provenance does not match: ${relativePath(path)}`);
  const suite = plan.suite;
  const environment = plan.environment;
  const agent = plan.agent;
  const model = plan.model;
  if (!isRecord(suite) || suite.id !== request.suite.id || suite.version !== request.suite.version) fail(`Experiment suite does not match request: ${relativePath(path)}`);
  if (!isRecord(environment) || environment.id !== request.environment.id || environment.version !== request.environment.version) fail(`Experiment environment does not match request: ${relativePath(path)}`);
  if (!isRecord(agent) || agent.id !== request.agent.id || agent.version !== request.agent.version || agent.command !== request.execution.command) fail(`Experiment agent does not match request: ${relativePath(path)}`);
  if (!isRecord(model) || model.id !== request.agent.model || model.version !== request.agent.model_version) fail(`Experiment model does not match request: ${relativePath(path)}`);
  if (plan.seed !== request.execution.seed || plan.system_prompt_hash !== request.agent.system_prompt_hash || plan.system_prompt_hash !== request.inputs.system_prompt || plan.tool_policy_hash !== request.execution.tool_policy_hash) {
    fail(`Experiment execution policy does not match request: ${relativePath(path)}`);
  }
  if (!isRecord(plan.budget) || plan.budget.max_turns !== request.execution.budget.max_turns || plan.budget.max_duration_ms !== request.execution.budget.max_duration_ms) {
    fail(`Experiment budget does not match request: ${relativePath(path)}`);
  }
  const condition = Array.isArray(plan.conditions) ? plan.conditions.find((entry) => isRecord(entry) && entry.id === request.condition_id) : undefined;
  if (!isRecord(condition) || condition.treatment !== `${request.treatment.id}/${request.treatment.version}`) fail(`Experiment condition does not match request: ${relativePath(path)}`);
  const taskSet = request.run_kind === "smoke" ? plan.smoke_tasks : plan.full_tasks;
  if (!Array.isArray(taskSet) || !taskSet.includes(request.task.id)) fail(`Experiment task does not match request: ${relativePath(path)}`);
  if (!Number.isInteger(plan.repetitions) || request.repeat > plan.repetitions) fail(`Experiment repeat does not match request: ${relativePath(path)}`);
  const expectedRunId = `${request.experiment_id}-${request.task.id}-${request.condition_id}-${String(request.repeat).padStart(3, "0")}`;
  if (request.run_id !== expectedRunId) fail(`Experiment run ID does not match request: ${relativePath(path)}`);
}

async function verifyContracts(request: PiRunRequestV2): Promise<{ taskPath: string; treatmentPath: string; treatment: Record<string, unknown>; treatmentBundle?: SkillBundle; ruleAudit?: TaskRuleAudit; ruleContext?: RuleContext; environmentPath: string; environment: Record<string, unknown>; containerSandbox?: ContainerSandbox }> {
  await verifyFormalExperiment(request);
  const suitePath = repositoryPath("suites", request.suite.id);
  const suiteManifestPath = joinPath(suitePath, "suite.yaml");
  await requireFile(suiteManifestPath, "suite manifest");
  const suiteManifest = await readYaml(suiteManifestPath);
  await validateSchema("suite.schema.json", suiteManifest, "suite manifest");
  if (suiteManifest.id !== request.suite.id || suiteManifest.version !== request.suite.version) {
    fail(`Requested suite does not match ${relativePath(suiteManifestPath)}`);
  }

  const suffix = `-${request.task.revision}`;
  if (!request.task.id.endsWith(suffix)) fail(`Task id must end with ${suffix}`);
  const taskSlug = request.task.id.slice(0, -suffix.length);
  const reference = `${taskSlug}/${request.task.revision}`;
  const task = await findTask(request.suite.id, reference);
  if (!task) fail(`Task not found: ${request.suite.id} ${reference}`);
  const taskCardPath = joinPath(task.path, "public", "task.yaml");
  const taskCard = await readYaml(taskCardPath);
  await validateSchema("task-card.schema.json", taskCard, "task card");
  if (taskCard.id !== request.task.id || taskCard.version !== Number(request.task.revision.slice(1))) {
    fail(`Requested task does not match ${relativePath(taskCardPath)}`);
  }
  if (taskCard.track !== suiteManifest.track) fail(`Task track does not match suite track: ${request.task.id}`);
  await verifySnapshot(request.suite.id, reference, request.task.snapshot_id);
  let ruleAudit: TaskRuleAudit | undefined;
  if (taskCard.skill_relevance === "direct") {
    const ruleAuditPath = joinPath(task.path, "private", "rule-audit.yaml");
    await requireFile(ruleAuditPath, "task rule audit");
    const ruleAuditDocument = await readYaml(ruleAuditPath);
    await validateSchema("task-rule-audit.schema.json", ruleAuditDocument, "task rule audit");
    try {
      ruleAudit = taskRuleAuditFromDocument(ruleAuditDocument, repositoryRelative(ruleAuditPath), await sha256File(ruleAuditPath), request.task.id);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  const treatmentPath = manifestPath("treatments", request.treatment.id, request.treatment.version, "treatment.yaml");
  await requireFile(treatmentPath, "treatment manifest");
  const treatment = await readYaml(treatmentPath);
  await validateSchema("treatment.schema.json", treatment, "treatment manifest");
  if (treatment.id !== request.treatment.id || treatment.version !== request.treatment.version) {
    fail(`Requested treatment does not match ${relativePath(treatmentPath)}`);
  }
  if (treatment.tool_policy_hash !== request.execution.tool_policy_hash) {
    fail(`Treatment tool_policy_hash does not match request: ${relativePath(treatmentPath)}`);
  }
  let treatmentBundle: SkillBundle | undefined;
  let ruleContext: RuleContext | undefined;
  if (treatment.kind === "baseline" && treatment.injection !== undefined) fail(`Baseline treatment must not define injection: ${relativePath(treatmentPath)}`);
  if (treatment.kind === "skill") {
    const routing = treatment.routing;
    if (!isRecord(routing) || routing.id !== "public-task-context" || routing.version !== "v1" || routing.max_rules !== 3 || routing.delivery !== "inline-rule-context") {
      fail(`Skill treatment must pin public-task-context/v1 inline rule routing: ${relativePath(treatmentPath)}`);
    }
    try {
      const declared = declaredSkillBundle(treatment);
      treatmentBundle = await resolveSkillBundle(treatment);
      if (treatmentBundle.path) {
        if (taskCard.skill_relevance === "direct") ruleContext = await declaredRuleContext(task.path, treatmentBundle, publicRuleNames(taskCard));
        if (taskCard.lifecycle_stage !== "retired" && ruleAudit && request.treatment.id === ruleAudit.treatment.id && request.treatment.version === ruleAudit.treatment.version) {
          const selected = routedRuleNames(ruleContext);
          if (selected.length !== ruleAudit.requiredRules.length || selected.some((rule) => !ruleAudit.requiredRules.includes(rule))) fail(`Public rule context does not exactly match ${request.task.id}`);
        }
      }
    } catch (error) {
      fail(`${error instanceof Error ? error.message : String(error)}: ${relativePath(treatmentPath)}`);
    }
  }

  const environmentPath = manifestPath("environments", request.environment.id, request.environment.version, "environment.yaml");
  await requireFile(environmentPath, "environment manifest");
  const environment = await readYaml(environmentPath);
  await validateSchema("environment.schema.json", environment, "environment manifest");
  if (environment.id !== request.environment.id || environment.version !== request.environment.version) {
    fail(`Requested environment does not match ${relativePath(environmentPath)}`);
  }
  const agentRuntime = environment.agent_runtime;
  const model = environment.model;
  const sandbox = environment.sandbox;
  if (!isRecord(agentRuntime) || !isRecord(model) || !isRecord(sandbox)) fail(`Invalid environment manifest: ${relativePath(environmentPath)}`);
  if (agentRuntime.id !== request.agent.id || agentRuntime.version !== request.agent.version || agentRuntime.command !== request.execution.command) {
    fail(`Requested agent runtime does not match ${relativePath(environmentPath)}`);
  }
  if (model.id !== request.agent.model) fail(`Requested model does not match ${relativePath(environmentPath)}`);
  if (model.version !== request.agent.model_version) fail(`Requested model version does not match ${relativePath(environmentPath)}`);
  if (sandbox.policy_hash !== request.execution.tool_policy_hash) {
    fail(`Environment sandbox policy does not match request: ${relativePath(environmentPath)}`);
  }
  if (typeof sandbox.policy_path === "string") {
    const policyPath = repositoryPath(sandbox.policy_path);
    await requireFile(policyPath, "sandbox policy");
    if ((await sha256File(policyPath)) !== sandbox.policy_hash) fail(`Environment sandbox policy hash does not match ${relativePath(policyPath)}`);
    if (agentRuntime.id === "pi") await verifyPiArguments(request, await readYaml(policyPath));
  }
  const dependencies = environment.dependencies;
  if (isRecord(dependencies) && typeof dependencies.lockfile === "string" && typeof dependencies.lockfile_sha256 === "string") {
    const lockfilePath = repositoryPath(dependencies.lockfile);
    await requireFile(lockfilePath, "environment lockfile");
    if ((await sha256File(lockfilePath)) !== dependencies.lockfile_sha256) fail(`Environment lockfile hash does not match: ${relativePath(lockfilePath)}`);
  }

  const containerSandbox = request.environment.id === "formal-pi-deepseek-v4-pro"
    ? formalContainerSandbox(environment)
    : sandbox.enforcement === "local-container-experiment"
      ? localContainerSandbox(environment)
      : undefined;
  return { taskPath: task.path, treatmentPath, treatment, treatmentBundle, ruleAudit, ruleContext, environmentPath, environment, containerSandbox };
}

async function copyFile(source: string, destination: string): Promise<void> {
  const sourceStats = await lstat(source);
  if (sourceStats.isSymbolicLink()) fail(`Public source cannot be a symbolic link: ${relativePath(source)}`);
  if (!sourceStats.isFile()) fail(`Public source must be a file: ${relativePath(source)}`);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, await Bun.file(source).arrayBuffer());
}

async function skillExecutionArgs(executionArgs: string[], taskPath: string, taskFilePath: string, skillName: string, skillPath: string, activationInstruction: string, ruleContext?: RuleContext): Promise<string[]> {
  const taskArgumentIndex = executionArgs.indexOf("@task.md");
  const taskInstruction = executionArgs[taskArgumentIndex + 1];
  if (taskArgumentIndex === -1 || typeof taskInstruction !== "string") fail("Pi skill injection requires the pinned task prompt arguments");
  const taskMarkdown = await Bun.file(joinPath(taskPath, "public", "task.md")).text();
  const fileText = `<file name="${taskFilePath}">\n${taskMarkdown}\n</file>\n`;
  const prompt = `/skill:${skillName} ${activationInstruction}\n\n${ruleContext?.text ? `${ruleContext.text}\n\n` : ""}${fileText}${taskInstruction}`;
  return [...executionArgs.slice(0, taskArgumentIndex), prompt, "--skill", skillPath];
}

async function copyStarter(source: string, destination: string, prefix = ""): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = joinPath(source, entry.name);
    const destinationPath = joinPath(destination, entry.name);
    if (entry.isSymbolicLink()) fail(`Public starter cannot contain a symbolic link: ${relativePath(sourcePath)}`);
    if (entry.isDirectory()) {
      Object.assign(hashes, await copyStarter(sourcePath, destinationPath, joinPath(prefix, entry.name)));
      continue;
    }
    if (!entry.isFile()) fail(`Unsupported public starter entry: ${relativePath(sourcePath)}`);
    await copyFile(sourcePath, destinationPath);
    hashes[joinPath(prefix, entry.name)] = await sha256File(destinationPath);
  }
  return hashes;
}

async function createWorkspace(runId: string, taskPath: string): Promise<{ path: string; taskMdSha256: string; starterFiles: Record<string, string> }> {
  const runWorkspace = repositoryPath(".run-workspaces", runId);
  if (await pathExists(runWorkspace)) fail(`Run workspace already exists: ${relativePath(runWorkspace)}`);
  await mkdir(runWorkspace, { recursive: true });
  const publicPath = joinPath(taskPath, "public");
  const taskMarkdown = joinPath(publicPath, "task.md");
  const starterPath = joinPath(publicPath, "starter");
  await copyFile(taskMarkdown, joinPath(runWorkspace, "task.md"));
  const starterFiles = await copyStarter(starterPath, joinPath(runWorkspace, "starter"));
  return { path: runWorkspace, taskMdSha256: await sha256File(joinPath(runWorkspace, "task.md")), starterFiles };
}

async function writeArtifactManifest(path: string, manifest: PiRunArtifactManifestV2): Promise<void> {
  await validateSchema("pi-run-artifact-manifest-v2.schema.json", manifest, "Pi artifact manifest");
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function sourceCommit(): Promise<string> {
  const revision = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    stdout: "pipe",
    stderr: "pipe"
  });
  if ((await revision.exited) !== 0) {
    fail(`Unable to resolve source commit: ${(await new Response(revision.stderr).text()).trim()}`);
  }
  return (await new Response(revision.stdout).text()).trim();
}

async function sourceCommitIsAncestor(commit: string): Promise<boolean> {
  const check = Bun.spawn(["git", "merge-base", "--is-ancestor", commit, "HEAD"], { cwd: workspaceRoot, stdout: "ignore", stderr: "ignore" });
  return (await check.exited) === 0;
}

async function ensureCleanFormalWorktree(environment: Record<string, unknown>): Promise<void> {
  const sandbox = environment.sandbox;
  if (!isRecord(sandbox) || typeof sandbox.policy_path !== "string") return;
  const status = Bun.spawn(["git", "status", "--porcelain"], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" });
  if ((await status.exited) !== 0) fail(`Unable to inspect Git worktree: ${(await new Response(status.stderr).text()).trim()}`);
  if ((await new Response(status.stdout).text()).trim()) fail("Formal Pi execution requires a clean Git worktree");
}

async function descendantPids(pid: number): Promise<number[]> {
  const children = Bun.spawn(["pgrep", "-P", String(pid)], { stdout: "pipe", stderr: "ignore" });
  if ((await children.exited) !== 0) return [];
  const output = await new Response(children.stdout).text();
  const direct = output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
  const nested = await Promise.all(direct.map((child) => descendantPids(child)));
  return [...direct, ...nested.flat()];
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
    return;
  }
  for (const childPid of (await descendantPids(pid)).reverse()) {
    try { process.kill(childPid, "SIGTERM"); } catch { }
  }
  try { process.kill(pid, "SIGTERM"); } catch { }
}

async function runSandboxCommand(command: string[], env: Record<string, string>, label: string): Promise<string> {
  const child = Bun.spawn(command, { cwd: workspaceRoot, env, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  if (exitCode !== 0) fail(`${label} failed: ${stderr.trim() || stdout.trim()}`);
  return stdout.trim();
}

async function verifyRuntime(environment: Record<string, unknown>, request: PiRunRequestV2, containerSandbox?: ContainerSandbox): Promise<void> {
  if (typeof environment.bun === "string" && /^\d+\.\d+\.\d+$/.test(environment.bun) && environment.bun !== Bun.version) {
    fail(`Bun version does not match environment: expected ${environment.bun}, received ${Bun.version}`);
  }
  const agentRuntime = environment.agent_runtime;
  if (!isRecord(agentRuntime) || agentRuntime.id !== "pi" || typeof agentRuntime.version !== "string") return;
  if (containerSandbox) {
    const sandboxEnv = { PATH: Bun.env.PATH ?? "", ...containerEnvironment(Bun.env.DEEPSEEK_API_KEY, containerSandbox) };
    if (containerSandbox.mode === "formal") {
      const image = await runSandboxCommand(containerImageInspectCommand(containerSandbox), sandboxEnv, "Formal container image inspection");
      if (image !== containerSandbox.image) fail("Formal container image digest does not match the configured image");
    } else {
      await runSandboxCommand(localContainerImageInspectCommand(containerSandbox), sandboxEnv, "Local container image inspection");
    }
    await runSandboxCommand(containerVersionCommand(containerSandbox), sandboxEnv, "Formal container runtime version check");
    return;
  }
  const versionCheck = Bun.spawn([request.execution.command, "--version"], { cwd: workspaceRoot, env: Bun.env, stdout: "pipe", stderr: "pipe" });
  if ((await versionCheck.exited) !== 0) fail(`Unable to resolve Pi version: ${(await new Response(versionCheck.stderr).text()).trim()}`);
  const actualVersion = (await new Response(versionCheck.stdout).text()).trim();
  if (actualVersion !== agentRuntime.version) fail(`Pi version does not match environment: expected ${agentRuntime.version}, received ${actualVersion}`);
}

function hasResolvedModelVersion(version: unknown): boolean {
  return typeof version === "string" && !/^(pending|pinned|operator)-/.test(version);
}

if (!requestPath) {
  console.error("Usage: bun run pi -- <pi-run-request-v2.json> [--dry-run]");
  process.exit(1);
}

try {
  const requestDocument = await readJson(requestPath);
  await validateSchema("pi-run-request-v2.schema.json", requestDocument, "Pi run request");
  const request = requestDocument as PiRunRequestV2;
  const adapterCommit = await sourceCommit();
  if (!(await sourceCommitIsAncestor(request.source_commit))) fail(`Request source_commit is not an ancestor of HEAD: ${request.source_commit}`);
  const contracts = await verifyContracts(request);
  const workspacePath = repositoryPath(".run-workspaces", request.run_id);
  const artifactPath = repositoryPath("artifacts", "runs", request.run_id);
  const artifactManifestPath = joinPath(artifactPath, request.artifacts.manifest_name);
  const candidatePath = resolve(workspacePath, request.candidate_path);
  const candidateRelative = relative(resolve(workspacePath), candidatePath);
  if (!candidateRelative || candidateRelative.startsWith("..") || isAbsolute(candidateRelative)) fail(`Candidate path must stay inside the workspace: ${request.candidate_path}`);
  const stagedSkillPath = contracts.treatmentBundle ? joinPath(artifactPath, "treatment", "SKILL.md") : undefined;
  const activationInstruction = isRecord(contracts.treatment.injection) && typeof contracts.treatment.injection.activation_instruction === "string"
    ? contracts.treatment.injection.activation_instruction
    : "Before editing, read and apply the individual rule files relevant to this task.";
  const tracedExecutionArgs = request.execution.command === "pi" && request.execution.args.includes("--print")
    ? piJsonTraceArgs(request.execution.args)
    : request.execution.args;
  const effectiveExecution = {
    ...request.execution,
    args: contracts.treatmentBundle
      ? request.execution.command === "pi"
        ? await skillExecutionArgs(
          tracedExecutionArgs,
          contracts.taskPath,
          contracts.containerSandbox ? `${contracts.containerSandbox.workspace_path}/task.md` : joinPath(workspacePath, "task.md"),
          contracts.treatmentBundle.name,
          contracts.containerSandbox?.skill_path ?? stagedSkillPath!,
          activationInstruction,
          contracts.ruleContext
        )
        : [...tracedExecutionArgs, "--skill", contracts.containerSandbox?.skill_path ?? stagedSkillPath!]
      : tracedExecutionArgs
  };
  if (await pathExists(workspacePath) || await pathExists(artifactPath)) {
    fail(`Run id already has a workspace or artifacts: ${request.run_id}`);
  }

  if (dryRun) {
    console.log(JSON.stringify({ run_id: request.run_id, command: effectiveExecution.command, args: effectiveExecution.args, cwd: repositoryRelative(workspacePath), artifact_manifest: repositoryRelative(artifactManifestPath) }, null, 2));
    process.exit(0);
  }

  if (request.environment.id === "formal-pi-deepseek-v4-pro" && !hasResolvedModelVersion(request.agent.model_version)) {
    fail("Formal Pi execution requires an immutable provider model snapshot ID");
  }
  await verifyRuntime(contracts.environment, request, contracts.containerSandbox);
  await ensureCleanFormalWorktree(contracts.environment);
  if (request.environment.id === "formal-pi-deepseek-v4-pro" && (Bun.env.LORELUM_SANDBOX_ENFORCED !== "1" || contracts.containerSandbox?.mode !== "formal")) {
    fail("Formal Pi execution requires the protected sandbox runner");
  }
  if (contracts.containerSandbox?.mode === "local" && Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") {
    fail("Local Pi execution requires LORELUM_LOCAL_EXPERIMENT=1");
  }
  const resolvedTreatmentBundle = contracts.treatmentBundle;
  const workspace = await createWorkspace(request.run_id, contracts.taskPath);
  if (stagedSkillPath && resolvedTreatmentBundle) await stageSkillBundle(resolvedTreatmentBundle, dirname(stagedSkillPath));
  const manifest: PiRunArtifactManifestV2 = {
    schema_version: "pi-run-artifact/v2",
    run_id: request.run_id,
    experiment_id: request.experiment_id,
    experiment_plan_hash: request.experiment_plan_hash,
    run_kind: request.run_kind,
    condition_id: request.condition_id,
    repeat: request.repeat,
    source_commit: request.source_commit,
    adapter_commit: adapterCommit,
    candidate_path: request.candidate_path,
    suite: request.suite,
    task: request.task,
    treatment: {
      ...request.treatment,
      manifest_path: repositoryRelative(contracts.treatmentPath),
      ...(resolvedTreatmentBundle ? {
        source: {
          repository: resolvedTreatmentBundle.repository,
          revision: resolvedTreatmentBundle.revision,
          path: resolvedTreatmentBundle.sourcePath,
          bundle_sha256: resolvedTreatmentBundle.sha256
        }
      } : {})
    },
    environment: { ...request.environment, manifest_path: repositoryRelative(contracts.environmentPath) },
    scorer: request.scorer,
    agent: request.agent,
    execution: { ...effectiveExecution, cwd: "." },
    inputs: request.inputs,
    ...(contracts.ruleAudit ? {
      rule_audit: {
        manifest_path: contracts.ruleAudit.manifestPath,
        sha256: contracts.ruleAudit.sha256,
        treatment: contracts.ruleAudit.treatment,
        required_rules: contracts.ruleAudit.requiredRules
      }
    } : {}),
    ...(contracts.ruleContext ? {
      rule_context: {
        schema_version: contracts.ruleContext.schema_version,
        router: contracts.ruleContext.router,
        public_input_sha256: contracts.ruleContext.public_input_sha256,
        bundle_sha256: contracts.ruleContext.bundle_sha256,
        rules: contracts.ruleContext.rules,
        sha256: contracts.ruleContext.sha256
      }
    } : {}),
    workspace: { path: repositoryRelative(workspace.path), task_md_sha256: workspace.taskMdSha256, starter_files: workspace.starterFiles },
    status: "prepared",
    timed_out: false,
    exit_code: null,
    completed_at: null
  };
  await writeArtifactManifest(artifactManifestPath, manifest);

  let exitCode: number | null = null;
  let timedOut = false;
  let stdout = "";
  let stderr = "";
  try {
    const executionEnv = contracts.containerSandbox
      ? { PATH: Bun.env.PATH ?? "", ...containerEnvironment(Bun.env.DEEPSEEK_API_KEY, contracts.containerSandbox) }
      : { ...Bun.env, CANDIDATE_PATH: candidatePath, LORELUM_RUN_ID: request.run_id };
    const executionCommand = contracts.containerSandbox
      ? containerCommand(request, contracts.containerSandbox, workspace.path, stagedSkillPath, effectiveExecution.command, effectiveExecution.args)
      : [effectiveExecution.command, ...effectiveExecution.args];
    const child = Bun.spawn(executionCommand, {
      cwd: contracts.containerSandbox ? workspaceRoot : workspace.path,
      env: executionEnv,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "pipe"
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child.pid).finally(async () => {
        if (contracts.containerSandbox) {
          const cleanup = Bun.spawn(containerRemoveCommand(request.run_id), { cwd: workspaceRoot, env: executionEnv, stdout: "ignore", stderr: "ignore" });
          await cleanup.exited;
        }
        child.kill();
      });
    }, request.execution.budget.max_duration_ms);
    exitCode = await child.exited;
    [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    clearTimeout(timeout);
  } catch (error) {
    console.error(`Pi command failed to start: ${error instanceof Error ? error.message : String(error)}`);
  }

  manifest.status = exitCode === 0 && !timedOut ? "completed" : "failed";
  manifest.timed_out = timedOut;
  manifest.exit_code = exitCode;
  manifest.completed_at = new Date().toISOString();
  const stdoutPath = joinPath(artifactPath, "pi.stdout.jsonl");
  const stderrPath = joinPath(artifactPath, "pi.stderr.log");
  await Bun.write(stdoutPath, stdout);
  await Bun.write(stderrPath, stderr);
  manifest.trace = { stdout_path: repositoryRelative(stdoutPath), stderr_path: repositoryRelative(stderrPath) };
  if (request.agent.id === "pi" && effectiveExecution.args.includes("--mode")) {
    const traceAudit = auditPiJsonTrace(stdout, request, contracts.ruleAudit, contracts.ruleContext);
    const tracePath = joinPath(artifactPath, "pi-trace-audit.json");
    await Bun.write(tracePath, `${JSON.stringify(traceAudit, null, 2)}\n`);
    manifest.trace.audit_path = repositoryRelative(tracePath);
    if (!traceAudit.valid) manifest.status = "failed";
  }
  await writeArtifactManifest(artifactManifestPath, manifest);
  const result: PiRunResultV2 = {
    schema_version: "pi-run-result/v2",
    run_id: request.run_id,
    status: manifest.status === "completed" ? "completed" : "failed",
    exit_code: exitCode,
    workspace: repositoryRelative(workspace.path),
    artifact_manifest: repositoryRelative(artifactManifestPath),
    completed_at: manifest.completed_at
  };
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  console.log(JSON.stringify(result));
  process.exit(manifest.status === "completed" ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
