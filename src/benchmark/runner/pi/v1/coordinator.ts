import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { findTask } from "../../../task-discovery";
import { joinPath, relativePath, sha256File, sha256Text, workspaceRoot } from "../../../fs";
import { validatePiRunRequest } from "./contract";
import type { PiRunManifest, PiRunRequest } from "./types";

type PreparedRun = {
  request: PiRunRequest;
  taskPath: string;
  taskCard: Record<string, unknown>;
  suiteDocument: Record<string, unknown>;
  treatmentDocument: Record<string, unknown>;
  environmentDocument: Record<string, unknown>;
  treatmentPrompt: string;
  sourceCommit: string;
  workspacePath: string;
  candidatePath: string;
  evaluatorCommand: string;
  prompt: string;
  artifactDirectory: string;
};

const [requestPath, ...options] = Bun.argv.slice(2);
const dryRun = options.includes("--dry-run");

function fail(message: string): never {
  throw new Error(message);
}

async function readYaml(path: string, label: string): Promise<Record<string, unknown>> {
  try {
    const document = Bun.YAML.parse(await Bun.file(path).text()) as unknown;
    if (!document || typeof document !== "object" || Array.isArray(document)) fail(`${label} must be a YAML object`);
    return document as Record<string, unknown>;
  } catch (error) {
    fail(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isInside(parent: string, child: string): boolean {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}${sep}`);
}

async function commandOutput(command: string, args: string[], cwd = workspaceRoot): Promise<string> {
  const process = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) fail(`${command} ${args.join(" ")} failed: ${stderr.trim() || stdout.trim()}`);
  return stdout.trim();
}

async function verifySnapshot(suite: string, reference: string): Promise<void> {
  const process = Bun.spawn(["bun", "run", "src/benchmark/snapshot.ts", suite, reference], {
    cwd: workspaceRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) fail(`Snapshot verification failed: ${stderr.trim() || stdout.trim()}`);
}

async function prepare(request: PiRunRequest): Promise<PreparedRun> {
  const task = await findTask(request.suite.id, `${request.task.id.replace(/-v[1-9][0-9]*$/, "")}/${request.task.revision}`);
  if (!task) fail(`Task not found: ${request.suite.id} ${request.task.id}/${request.task.revision}`);
  const suiteDocument = await readYaml(joinPath(workspaceRoot, "suites", request.suite.id, "suite.yaml"), "suite manifest");
  if (suiteDocument.id !== request.suite.id || suiteDocument.version !== request.suite.version) fail("Request suite does not match suite manifest");
  const taskCard = await readYaml(joinPath(task.path, "public", "task.yaml"), "task card");
  if (taskCard.id !== request.task.id || taskCard.version !== Number(request.task.revision.slice(1))) fail("Request task does not match task card");
  const snapshot = JSON.parse(await Bun.file(joinPath(task.path, "private", "snapshot.json")).text()) as { snapshot_id?: string };
  if (snapshot.snapshot_id !== request.task.snapshot_id) fail("Request snapshot_id does not match task snapshot");
  await verifySnapshot(request.suite.id, task.reference);

  const treatmentPath = joinPath(workspaceRoot, "treatments", request.treatment.id, request.treatment.version, "treatment.yaml");
  const environmentPath = joinPath(workspaceRoot, "environments", request.environment.id, request.environment.version, "environment.yaml");
  const treatmentDocument = await readYaml(treatmentPath, "treatment manifest");
  const environmentDocument = await readYaml(environmentPath, "environment manifest");
  if (treatmentDocument.id !== request.treatment.id || treatmentDocument.version !== request.treatment.version) fail("Request treatment does not match treatment manifest");
  if (environmentDocument.id !== request.environment.id || environmentDocument.version !== request.environment.version) fail("Request environment does not match environment manifest");
  const conditions = (suiteDocument.conditions as unknown[] | undefined)?.map(String) ?? [];
  const condition = request.treatment.id === "oracle" ? "oracle-practice" : request.treatment.id === "retrieval" ? "lorelum-retrieval" : request.treatment.id === "skill" ? "vercel-skill" : request.treatment.id;
  if (!conditions.includes(condition)) fail(`Treatment condition is not declared by suite: ${condition}`);

  const sourceCommit = await commandOutput("git", ["rev-parse", "HEAD"]);
  const artifactDirectory = joinPath(workspaceRoot, "artifacts", "runs", request.run_id);
  const workspacePath = joinPath(artifactDirectory, "workspace");
  const candidatePath = resolve(workspacePath, request.candidate_path);
  if (!isInside(workspacePath, candidatePath)) fail("candidate_path must stay inside the run workspace");
  for (const artifact of request.artifacts) if (!isInside(artifactDirectory, resolve(workspaceRoot, artifact.uri))) fail(`Artifact URI must stay inside ${relativePath(artifactDirectory)}: ${artifact.uri}`);
  const executionCwd = resolve(workspacePath, request.execution.cwd);
  if (!isInside(workspacePath, executionCwd)) fail("execution.cwd must stay inside the run workspace");
  const taskPrompt = await Bun.file(joinPath(task.path, "public", "task.md")).text();
  const treatmentPrompt = typeof treatmentDocument.prompt === "string" ? treatmentDocument.prompt : typeof treatmentDocument.content === "string" ? treatmentDocument.content : "";
  const prompt = `${taskPrompt.trim()}${treatmentPrompt.trim() ? `\n\nAdditional benchmark context:\n${treatmentPrompt.trim()}` : ""}\n`;
  const evaluatorCommand = typeof taskCard.runtime === "object" && taskCard.runtime && typeof (taskCard.runtime as Record<string, unknown>).command === "string" ? String((taskCard.runtime as Record<string, unknown>).command) : fail("Task runtime.command is required");
  return { request, taskPath: task.path, taskCard, suiteDocument, treatmentDocument, environmentDocument, treatmentPrompt, sourceCommit, workspacePath, candidatePath, evaluatorCommand, prompt, artifactDirectory };
}

async function copyPublic(taskPath: string, workspacePath: string): Promise<void> {
  await mkdir(workspacePath, { recursive: true });
  await Bun.write(joinPath(workspacePath, "task.md"), await Bun.file(joinPath(taskPath, "public", "task.md")).arrayBuffer());
  const starterPath = joinPath(taskPath, "public", "starter");
  for await (const file of new Bun.Glob("**/*").scan({ cwd: starterPath, onlyFiles: true })) {
    const destination = joinPath(workspacePath, "starter", file);
    await mkdir(join(destination, ".."), { recursive: true });
    await Bun.write(destination, await Bun.file(joinPath(starterPath, file)).arrayBuffer());
  }
}

async function runProcess(command: string, args: string[], cwd: string, env: Record<string, string>, timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  let child: Bun.Subprocess;
  try {
    child = Bun.spawn([command, ...args], { cwd, env: { ...Bun.env, ...env }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  } catch (error) {
    return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error), timedOut: false };
  }
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>((resolveTimeout) => {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      resolveTimeout(124);
    }, timeoutMs);
  });
  const exitCode = await Promise.race([child.exited, timeout]);
  if (timer) clearTimeout(timer);
  return { exitCode, stdout: await stdoutPromise, stderr: await stderrPromise, timedOut };
}

async function writeArtifact(path: string, content: string | ArrayBuffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, content);
}

function resolvePiCommand(command: string): string {
  if (command.startsWith("/") || command.startsWith("./") || command.startsWith("../")) return resolve(workspaceRoot, command);
  return command;
}

async function main(): Promise<number> {
  if (!requestPath) fail("Usage: bun run benchmark:run -- <pi-run-request.json> [--dry-run]");
  const parsed = JSON.parse(await Bun.file(requestPath).text()) as unknown;
  const validation = validatePiRunRequest(parsed);
  if (!validation.request) fail(`Invalid Pi run request: ${validation.errors.join("; ")}`);
  const prepared = await prepare(validation.request);
  const plan = {
    run_id: prepared.request.run_id,
    task: `${prepared.request.suite.id}/${prepared.request.task.id}/${prepared.request.task.revision}`,
    treatment: `${prepared.request.treatment.id}/${prepared.request.treatment.version}`,
    environment: `${prepared.request.environment.id}/${prepared.request.environment.version}`,
    workspace: relativePath(prepared.workspacePath),
    candidate_path: relativePath(prepared.candidatePath),
    command: prepared.request.execution.command,
    args: prepared.request.execution.args,
    evaluator: prepared.evaluatorCommand,
  };
  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  await mkdir(prepared.artifactDirectory, { recursive: true });
  await copyPublic(prepared.taskPath, prepared.workspacePath);
  const usedArtifactUris = new Set<string>();
  const artifactPath = (kind: string, fallback: string): string => {
    const declared = prepared.request.artifacts.find((artifact) => artifact.kind === kind && !usedArtifactUris.has(artifact.uri));
    if (!declared) return fallback;
    usedArtifactUris.add(declared.uri);
    const path = resolve(workspaceRoot, declared.uri);
    if (!isInside(prepared.artifactDirectory, path)) fail(`Artifact URI must stay inside ${relativePath(prepared.artifactDirectory)}: ${declared.uri}`);
    return path;
  };
  const requestArtifact = artifactPath("environment", joinPath(prepared.artifactDirectory, "request.json"));
  const promptArtifact = artifactPath("trace", joinPath(prepared.artifactDirectory, "prompt.txt"));
  await writeArtifact(requestArtifact, `${JSON.stringify(prepared.request, null, 2)}\n`);
  await writeArtifact(promptArtifact, prepared.prompt);
  const startedAt = new Date().toISOString();
  const executionCwd = resolve(prepared.workspacePath, prepared.request.execution.cwd);
  const piArgs = prepared.request.execution.args.map((argument) => argument === "{prompt}" ? prepared.prompt : argument);
  if (!piArgs.includes(prepared.prompt)) piArgs.push(prepared.prompt);
  const pi = await runProcess(resolvePiCommand(prepared.request.execution.command), piArgs, executionCwd, {
    CANDIDATE_PATH: prepared.candidatePath,
    LORELUM_PROMPT_PATH: promptArtifact,
    LORELUM_RUN_ID: prepared.request.run_id,
    LORELUM_SEED: String(prepared.request.execution.seed),
  }, prepared.request.execution.budget.max_duration_ms);
  const stdoutArtifact = artifactPath("raw-output", joinPath(prepared.artifactDirectory, "pi.stdout"));
  const stderrArtifact = artifactPath("raw-output", joinPath(prepared.artifactDirectory, "pi.stderr"));
  await writeArtifact(stdoutArtifact, pi.stdout);
  await writeArtifact(stderrArtifact, pi.stderr);
  const diffArtifact = artifactPath("patch", joinPath(prepared.artifactDirectory, "workspace.diff"));
  const originalStarter = joinPath(prepared.taskPath, "public", "starter");
  const diff = await runProcess("diff", ["-ruN", originalStarter, joinPath(prepared.workspacePath, "starter")], workspaceRoot, {}, 30_000);
  await writeArtifact(diffArtifact, diff.stdout + diff.stderr);

  const evaluator = await runProcess("bash", ["-lc", prepared.evaluatorCommand], workspaceRoot, {
    CANDIDATE_PATH: prepared.candidatePath,
    LORELUM_RUN_ID: prepared.request.run_id,
  }, prepared.request.execution.budget.max_duration_ms);
  const evaluatorArtifact = artifactPath("evaluator-output", joinPath(prepared.artifactDirectory, "evaluator.output"));
  await writeArtifact(evaluatorArtifact, evaluator.stdout + evaluator.stderr);
  const completedAt = new Date().toISOString();
  const artifacts = [
    ["raw-output", stdoutArtifact], ["raw-output", stderrArtifact], ["patch", diffArtifact], ["evaluator-output", evaluatorArtifact], ["environment", requestArtifact], ["trace", promptArtifact],
  ] as const;
  const manifestArtifacts = await Promise.all(artifacts.map(async ([kind, path]) => ({ kind, uri: relativePath(path), sha256: await sha256File(path) })));
  const taskPromptHash = await sha256Text(prepared.prompt);
  if (prepared.request.inputs.task_prompt && prepared.request.inputs.task_prompt !== taskPromptHash) fail("inputs.task_prompt does not match the frozen task/treatment prompt");
  const manifest: PiRunManifest = {
    schema_version: "run-manifest/v1",
    run_id: prepared.request.run_id,
    source_commit: prepared.sourceCommit,
    candidate_path: relativePath(prepared.candidatePath),
    suite: prepared.request.suite,
    task: prepared.request.task,
    treatment: prepared.request.treatment,
    environment: prepared.request.environment,
    scorer: prepared.request.scorer,
    agent: prepared.request.agent,
    execution: { ...prepared.request.execution, cwd: relativePath(executionCwd) },
    inputs: { ...prepared.request.inputs, task_prompt: taskPromptHash },
    artifacts: manifestArtifacts,
    started_at: startedAt,
    completed_at: completedAt,
    status: pi.exitCode === 0 && evaluator.exitCode === 0 ? "completed" : "failed",
    exit_code: pi.exitCode,
  };
  const manifestPath = joinPath(prepared.artifactDirectory, "run-manifest.json");
  await writeArtifact(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const taskSlug = prepared.request.task.id.replace(/-v[1-9][0-9]*$/, "");
  const recordPath = joinPath(workspaceRoot, "results", "records", prepared.request.suite.id, taskSlug, `${prepared.request.run_id}.json`);
  const condition = prepared.request.treatment.id === "oracle" ? "oracle-practice" : prepared.request.treatment.id === "retrieval" ? "lorelum-retrieval" : prepared.request.treatment.id === "skill" ? "vercel-skill" : prepared.request.treatment.id;
  const record = {
    run_id: prepared.request.run_id,
    suite_version: String(prepared.suiteDocument.version),
    task_id: prepared.request.task.id,
    task_version: Number(prepared.request.task.revision.slice(1)),
    evaluator_version: Number(prepared.taskCard.evaluator_version),
    source_commit: prepared.sourceCommit,
    snapshot_id: prepared.request.task.snapshot_id,
    run_request: { uri: relativePath(resolve(requestPath)), sha256: await sha256File(resolve(requestPath)) },
    run_manifest: { uri: relativePath(manifestPath), sha256: await sha256File(manifestPath) },
    track: prepared.suiteDocument.track,
    condition,
    model: { id: prepared.request.agent.model },
    started_at: startedAt,
    cost: { duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime() },
    outcome: { automated_checks_passed: evaluator.exitCode === 0, blind_review: "pending", diff_path: relativePath(diffArtifact) },
  };
  await writeArtifact(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ ...plan, manifest: relativePath(manifestPath), record: relativePath(recordPath), status: manifest.status }, null, 2));
  return manifest.status === "completed" ? 0 : 1;
}

try {
  process.exit(await main());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
