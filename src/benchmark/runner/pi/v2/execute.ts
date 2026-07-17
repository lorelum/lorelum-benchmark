import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { joinPath, pathExists, relativePath, sha256File, workspaceRoot } from "../../../fs";
import { findTask } from "../../../task-discovery";
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

async function verifyContracts(request: PiRunRequestV2): Promise<{ taskPath: string; treatmentPath: string; environmentPath: string }> {
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
  if (sandbox.policy_hash !== request.execution.tool_policy_hash) {
    fail(`Environment sandbox policy does not match request: ${relativePath(environmentPath)}`);
  }

  return { taskPath: task.path, treatmentPath, environmentPath };
}

async function copyFile(source: string, destination: string): Promise<void> {
  const sourceStats = await lstat(source);
  if (sourceStats.isSymbolicLink()) fail(`Public source cannot be a symbolic link: ${relativePath(source)}`);
  if (!sourceStats.isFile()) fail(`Public source must be a file: ${relativePath(source)}`);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, await Bun.file(source).arrayBuffer());
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

if (!requestPath) {
  console.error("Usage: bun run pi -- <pi-run-request-v2.json> [--dry-run]");
  process.exit(1);
}

try {
  const requestDocument = await readJson(requestPath);
  await validateSchema("pi-run-request-v2.schema.json", requestDocument, "Pi run request");
  const request = requestDocument as PiRunRequestV2;
  const contracts = await verifyContracts(request);
  const workspacePath = repositoryPath(".run-workspaces", request.run_id);
  const artifactPath = repositoryPath("artifacts", "runs", request.run_id);
  const artifactManifestPath = joinPath(artifactPath, request.artifacts.manifest_name);
  if (await pathExists(workspacePath) || await pathExists(artifactPath)) {
    fail(`Run id already has a workspace or artifacts: ${request.run_id}`);
  }

  if (dryRun) {
    console.log(JSON.stringify({ run_id: request.run_id, command: request.execution.command, args: request.execution.args, cwd: repositoryRelative(workspacePath), artifact_manifest: repositoryRelative(artifactManifestPath) }, null, 2));
    process.exit(0);
  }

  const workspace = await createWorkspace(request.run_id, contracts.taskPath);
  const manifest: PiRunArtifactManifestV2 = {
    schema_version: "pi-run-artifact/v2",
    run_id: request.run_id,
    source_commit: await sourceCommit(),
    suite: request.suite,
    task: request.task,
    treatment: { ...request.treatment, manifest_path: repositoryRelative(contracts.treatmentPath) },
    environment: { ...request.environment, manifest_path: repositoryRelative(contracts.environmentPath) },
    scorer: request.scorer,
    agent: request.agent,
    execution: { ...request.execution, cwd: "." },
    inputs: request.inputs,
    workspace: { path: repositoryRelative(workspace.path), task_md_sha256: workspace.taskMdSha256, starter_files: workspace.starterFiles },
    status: "prepared",
    exit_code: null,
    completed_at: null
  };
  await writeArtifactManifest(artifactManifestPath, manifest);

  let exitCode: number | null = null;
  try {
    const child = Bun.spawn([request.execution.command, ...request.execution.args], {
      cwd: workspace.path,
      env: Bun.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    });
    exitCode = await child.exited;
  } catch (error) {
    console.error(`Pi command failed to start: ${error instanceof Error ? error.message : String(error)}`);
  }

  manifest.status = exitCode === 0 ? "completed" : "failed";
  manifest.exit_code = exitCode;
  manifest.completed_at = new Date().toISOString();
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
  console.log(JSON.stringify(result));
  process.exit(exitCode === 0 ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
