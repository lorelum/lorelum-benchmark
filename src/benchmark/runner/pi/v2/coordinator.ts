import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { joinPath, pathExists, relativePath, sha256File, workspaceRoot } from "../../../fs";
import { findTask } from "../../../task-discovery";
import type { PiRunRequestV2 } from "./types";
import { parseS3Uri, uploadImmutableS3Artifact } from "./s3";
import { auditPiJsonTrace, type PiTraceAudit } from "./trace";
import { taskRuleAuditFromArtifact, type TaskRuleAudit } from "./task-rule-audit";
import { evaluatorResultFromOutput, type EvaluatorResultV2 } from "../../../evaluator/v2/result";

type Artifact = { kind: "trace" | "patch" | "raw-output" | "evaluator-output" | "environment" | "review"; uri: string; sha256: string };

type ProcessResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean };

const [requestPath, ...options] = Bun.argv.slice(2);
const dryRun = options.includes("--dry-run");
const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
const schemaValidators = new Map<string, ValidateFunction>();

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasResolvedModelVersion(version: unknown): boolean {
  return typeof version === "string" && !/^(pending|pinned|operator)-/.test(version);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await Bun.file(path).text()) as unknown;
  } catch (error) {
    fail(`Unable to read JSON ${relativePath(path)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readYaml(path: string): Promise<Record<string, unknown>> {
  const document = Bun.YAML.parse(await Bun.file(path).text()) as unknown;
  if (!isRecord(document)) fail(`YAML document must be an object: ${relativePath(path)}`);
  return document;
}

function schemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`).join("; ");
}

async function schemaValidator(name: string): Promise<ValidateFunction> {
  const cached = schemaValidators.get(name);
  if (cached) return cached;
  if (name === "run-manifest.schema.json") ajv.addSchema(await readJson(joinPath(workspaceRoot, "schemas", "artifact.schema.json")), "artifact.schema.json");
  const validator = ajv.compile(await readJson(joinPath(workspaceRoot, "schemas", name)));
  schemaValidators.set(name, validator);
  return validator;
}

async function validateSchema(name: string, value: unknown, label: string): Promise<void> {
  const validator = await schemaValidator(name);
  if (!validator(value)) fail(`Invalid ${label}: ${schemaErrors(validator.errors)}`);
}

function repositoryPath(...parts: string[]): string {
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, ...parts);
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) fail(`Path escapes workspace root: ${parts.join("/")}`);
  return candidate;
}

function repositoryRelative(path: string): string {
  return relative(resolve(workspaceRoot), resolve(path)).replaceAll("\\", "/");
}

async function terminateTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const child = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await child.exited;
    return;
  }
  const children = Bun.spawn(["pgrep", "-P", String(pid)], { stdout: "pipe", stderr: "ignore" });
  if ((await children.exited) === 0) {
    const output = await new Response(children.stdout).text();
    const direct = output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
    for (const childPid of direct) await terminateTree(childPid);
  }
  try { process.kill(pid, "SIGTERM"); } catch { }
}

async function runProcess(command: string[], cwd: string, env: Record<string, string | undefined>, timeoutMs: number): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void terminateTree(child.pid).finally(() => child.kill());
  }, timeoutMs);
  const exitCode = await child.exited;
  clearTimeout(timer);
  return {
    exitCode,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
    timedOut
  };
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await Bun.write(path, content);
}

async function artifact(kind: Artifact["kind"], path: string): Promise<Artifact> {
  return { kind, uri: repositoryRelative(path), sha256: await sha256File(path) };
}

async function preflight(path: string): Promise<void> {
  const result = await runProcess([process.execPath, "run", "src/benchmark/runner/pi/v2/execute.ts", path, "--dry-run"], workspaceRoot, Bun.env, 30_000);
  if (result.exitCode !== 0) fail(`Pi request preflight failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

function requireProtectedArtifactStorage(environment: Record<string, unknown>): string {
  const storage = environment.artifact_storage;
  if (!isRecord(storage) || storage.mode !== "immutable-after-upload" || typeof storage.uri !== "string" || typeof storage.uploader !== "string") fail("Formal environment must define immutable artifact storage");
  if (storage.uploader !== "s3-object-lock") fail("Formal environment must use the S3 Object Lock uploader");
  parseS3Uri(storage.uri);
  if (Bun.env.LORELUM_ARTIFACT_STORAGE_URI !== storage.uri) {
    fail(`Protected artifact storage is not configured for ${storage.uri}`);
  }
  return storage.uri;
}

async function adapterCommit(): Promise<string> {
  const child = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" });
  if ((await child.exited) !== 0) fail(`Unable to resolve adapter commit: ${(await new Response(child.stderr).text()).trim()}`);
  return (await new Response(child.stdout).text()).trim();
}

function taskReference(request: PiRunRequestV2): { slug: string; reference: string } {
  const suffix = `-${request.task.revision}`;
  if (!request.task.id.endsWith(suffix)) fail(`Task id must end with ${suffix}`);
  const slug = request.task.id.slice(0, -suffix.length);
  return { slug, reference: `${slug}/${request.task.revision}` };
}

async function candidateIsSafe(path: string): Promise<void> {
  if (!(await pathExists(path))) fail(`Pi did not produce candidate file: ${relativePath(path)}`);
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`Candidate must be a regular file: ${relativePath(path)}`);
}

async function createDiff(request: PiRunRequestV2, candidatePath: string, artifactPath: string): Promise<{ path: string; success: boolean }> {
  const reference = taskReference(request);
  const task = await findTask(request.suite.id, reference.reference);
  if (!task) fail(`Task not found while creating diff: ${request.task.id}`);
  const originalPath = resolve(task.path, "public", request.candidate_path);
  const originalRelative = relative(resolve(task.path, "public", "starter"), originalPath);
  if (originalRelative.startsWith("..") || isAbsolute(originalRelative)) fail(`Candidate path must start under starter/: ${request.candidate_path}`);
  const result = await runProcess(["git", "diff", "--no-index", "--", originalPath, candidatePath], workspaceRoot, Bun.env, 30_000);
  const path = joinPath(artifactPath, "candidate.diff");
  await writeText(path, `${result.stdout}${result.stderr}`);
  return { path, success: result.exitCode === 0 || result.exitCode === 1 };
}

async function taskMetadata(request: PiRunRequestV2): Promise<{ track: string; evaluatorVersion: number; evaluatorContract?: string; skillRelevance: string }> {
  const reference = taskReference(request);
  const task = await findTask(request.suite.id, reference.reference);
  if (!task) fail(`Task not found while creating record: ${request.task.id}`);
  const card = await readYaml(joinPath(task.path, "public", "task.yaml"));
  if (typeof card.track !== "string" || !Number.isInteger(card.evaluator_version) || typeof card.skill_relevance !== "string") fail(`Task card metadata is invalid: ${relativePath(task.path)}`);
  return { track: card.track, evaluatorVersion: card.evaluator_version as number, ...(typeof card.evaluator_contract === "string" ? { evaluatorContract: card.evaluator_contract } : {}), skillRelevance: card.skill_relevance };
}

if (!requestPath) {
  console.error("Usage: bun run pi:coordinate -- <pi-run-request-v2.json> [--dry-run]");
  process.exit(1);
}

try {
  const document = await readJson(requestPath);
  await validateSchema("pi-run-request-v2.schema.json", document, "Pi run request");
  const request = document as PiRunRequestV2;
  await preflight(requestPath);
  const artifactPath = repositoryPath("artifacts", "runs", request.run_id);
  const recordPath = repositoryPath("results", "records", request.suite.id, request.task.id, `${request.run_id}.json`);
  if (dryRun) {
    console.log(JSON.stringify({ run_id: request.run_id, artifact_directory: repositoryRelative(artifactPath), run_manifest: repositoryRelative(joinPath(artifactPath, "formal-run-manifest.json")), record: repositoryRelative(recordPath) }, null, 2));
    process.exit(0);
  }

  const startedAt = new Date().toISOString();
  let currentAdapterCommit = await adapterCommit();
  const environmentManifest = await readYaml(repositoryPath("environments", request.environment.id, request.environment.version, "environment.yaml"));
  if (request.environment.id === "formal-pi-deepseek-v4-pro" && !hasResolvedModelVersion(request.agent.model_version)) {
    fail("Formal Pi coordination requires an immutable provider model snapshot ID");
  }
  const storageUri = isRecord(environmentManifest.artifact_storage) ? requireProtectedArtifactStorage(environmentManifest) : undefined;
  const metadata = await taskMetadata(request);
  const runner = await runProcess([process.execPath, "run", "src/benchmark/runner/pi/v2/execute.ts", requestPath], workspaceRoot, Bun.env, request.execution.budget.max_duration_ms);
  await writeText(joinPath(artifactPath, "pi.stdout.log"), runner.stdout);
  await writeText(joinPath(artifactPath, "pi.stderr.log"), runner.stderr);
  const piManifestPath = joinPath(artifactPath, request.artifacts.manifest_name);
  let executedExecution: Record<string, unknown> = request.execution;
  let ruleAudit: TaskRuleAudit | undefined;
  let traceAudit: PiTraceAudit | undefined;
  if (await pathExists(piManifestPath)) {
    const piManifest = await readJson(piManifestPath);
    if (isRecord(piManifest)) {
      if (isRecord(piManifest.execution)) executedExecution = piManifest.execution;
      if (typeof piManifest.adapter_commit === "string") currentAdapterCommit = piManifest.adapter_commit;
      ruleAudit = taskRuleAuditFromArtifact(piManifest.rule_audit);
      if (isRecord(piManifest.trace) && typeof piManifest.trace.audit_path === "string") {
        const auditPath = repositoryPath(piManifest.trace.audit_path);
        if (await pathExists(auditPath)) traceAudit = await readJson(auditPath) as PiTraceAudit;
      }
    }
  }
  traceAudit ??= request.agent.id === "pi" ? auditPiJsonTrace(runner.stdout, request, ruleAudit) : undefined;
  if (traceAudit) await writeText(joinPath(artifactPath, "pi-trace-audit.json"), `${JSON.stringify(traceAudit, null, 2)}\n`);
  const localArtifacts: Artifact[] = [
    await artifact("raw-output", joinPath(artifactPath, "pi.stdout.log")),
    await artifact("raw-output", joinPath(artifactPath, "pi.stderr.log")),
    ...(traceAudit ? [await artifact("trace", joinPath(artifactPath, "pi-trace-audit.json"))] : []),
    ...(await pathExists(piManifestPath) ? [await artifact("trace", piManifestPath)] : [])
  ];

  let evaluator: ProcessResult | undefined;
  let evaluatorResult: EvaluatorResultV2 | undefined;
  let diffPath: string | undefined;
  let failureReason: string | undefined = metadata.skillRelevance === "direct" && !ruleAudit ? "Direct task is missing its frozen rule audit" : undefined;
  const workspacePath = repositoryPath(".run-workspaces", request.run_id);
  const candidatePath = resolve(workspacePath, request.candidate_path);
  if (runner.exitCode === 0 && !runner.timedOut) {
    if (traceAudit && !traceAudit.valid) failureReason ??= traceAudit.failure_reason;
    try {
      await candidateIsSafe(candidatePath);
      const diff = await createDiff(request, candidatePath, artifactPath);
      diffPath = diff.path;
      if (!diff.success) fail("Unable to create candidate diff");
      localArtifacts.push(await artifact("patch", diff.path));
      const reference = taskReference(request);
      evaluator = await runProcess([process.execPath, "run", "src/benchmark/evaluate.ts", request.suite.id, reference.reference], workspaceRoot, { ...Bun.env, CANDIDATE_PATH: candidatePath }, request.execution.budget.max_duration_ms);
      await writeText(joinPath(artifactPath, "evaluator.stdout.log"), evaluator.stdout);
      await writeText(joinPath(artifactPath, "evaluator.stderr.log"), evaluator.stderr);
      localArtifacts.push(await artifact("evaluator-output", joinPath(artifactPath, "evaluator.stdout.log")));
      localArtifacts.push(await artifact("evaluator-output", joinPath(artifactPath, "evaluator.stderr.log")));
      if (metadata.evaluatorContract === "structured/v2") {
        try {
          evaluatorResult = evaluatorResultFromOutput(`${evaluator.stdout}\n${evaluator.stderr}`);
          if (!evaluatorResult) throw new Error("Structured evaluator did not emit a result");
          if (!evaluatorResult.semantic.passed) failureReason ??= "Evaluator semantic gate failed";
        } catch (error) {
          failureReason ??= error instanceof Error ? error.message : String(error);
        }
      }
      if (evaluator.exitCode !== 0 || evaluator.timedOut) failureReason ??= evaluator.timedOut ? "Evaluator timed out" : "Evaluator failed";
    } catch (error) {
      failureReason ??= error instanceof Error ? error.message : String(error);
    }
  } else {
    failureReason = runner.timedOut ? "Pi timed out" : `Pi failed with exit code ${runner.exitCode ?? "unknown"}`;
  }

  const environmentPath = repositoryPath("environments", request.environment.id, request.environment.version, "environment.yaml");
  localArtifacts.push(await artifact("environment", environmentPath));
  const artifacts = storageUri
    ? await Promise.all(localArtifacts.map(async (entry) => ({ kind: entry.kind, ...(await uploadImmutableS3Artifact(repositoryPath(entry.uri), storageUri, request.run_id)) })))
    : localArtifacts;
  const runManifest = {
    run_id: request.run_id,
    experiment_id: request.experiment_id,
    experiment_plan_hash: request.experiment_plan_hash,
    run_kind: request.run_kind,
    condition_id: request.condition_id,
    repeat: request.repeat,
    source_commit: request.source_commit,
    adapter_commit: currentAdapterCommit,
    suite: request.suite,
    task: request.task,
    treatment: request.treatment,
    environment: request.environment,
    scorer: request.scorer,
    agent: request.agent,
    execution: executedExecution,
    inputs: request.inputs,
    ...(ruleAudit ? {
      rule_audit: {
        manifest_path: ruleAudit.manifestPath,
        sha256: ruleAudit.sha256,
        treatment: ruleAudit.treatment,
        required_rules: ruleAudit.requiredRules,
        ...(traceAudit ? { trace_audit: traceAudit } : {})
      }
    } : {}),
    artifacts
  };
  await validateSchema("run-manifest.schema.json", runManifest, "formal run manifest");
  const runManifestPath = joinPath(artifactPath, "formal-run-manifest.json");
  await writeText(runManifestPath, `${JSON.stringify(runManifest, null, 2)}\n`);
  const manifestReference = storageUri
    ? await uploadImmutableS3Artifact(runManifestPath, storageUri, request.run_id)
    : { uri: repositoryRelative(runManifestPath), sha256: await sha256File(runManifestPath) };
  const record = {
    run_id: request.run_id,
    experiment_id: request.experiment_id,
    experiment_plan_hash: request.experiment_plan_hash,
    run_kind: request.run_kind,
    condition_id: request.condition_id,
    repeat: request.repeat,
    suite_version: request.suite.version,
    task_id: request.task.id,
    task_version: Number(request.task.revision.slice(1)),
    evaluator_version: metadata.evaluatorVersion,
    source_commit: request.source_commit,
    adapter_commit: currentAdapterCommit,
    snapshot_id: request.task.snapshot_id,
    adapter: { id: "pi", version: "v2" },
    treatment: request.treatment,
    environment: request.environment,
    run_manifest: manifestReference,
    track: metadata.track,
    condition: request.treatment.id,
    model: { id: request.agent.model, version: request.agent.model_version },
    started_at: startedAt,
    cost: { duration_ms: Date.now() - Date.parse(startedAt) },
    outcome: {
      automated_checks_passed: evaluator?.exitCode === 0 && !evaluator.timedOut && !failureReason,
      blind_review: "pending",
      ...(evaluatorResult ? { evaluator: evaluatorResult, quality_score: evaluatorResult.quality.score } : {}),
      ...(diffPath ? { diff_path: repositoryRelative(diffPath) } : {}),
      ...(failureReason ? { failure_reason: failureReason } : {})
    }
  };
  await validateSchema("run-record.schema.json", record, "formal run record");
  if (await pathExists(recordPath)) fail(`Run record already exists: ${relativePath(recordPath)}`);
  await writeText(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ run_id: request.run_id, status: record.outcome.automated_checks_passed ? "completed" : "failed", run_manifest: repositoryRelative(runManifestPath), record: repositoryRelative(recordPath) }));
  process.exit(record.outcome.automated_checks_passed ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
