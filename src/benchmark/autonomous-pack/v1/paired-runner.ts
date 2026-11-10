import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File } from "../../fs";
import { executeContainerRun } from "./container-execution";
import { evaluateSemantic } from "./evaluator";
import { assertPlan, type AutonomousPlan } from "./plan";
import { prepareInputs, prepareRunWorkspace, type PreparationSources } from "./runner-preparation";
import { sha256SnapshotDirectory } from "./snapshot";
import { assertObservation, summarizePlan, traceObservation, type AutonomousObservation } from "./summary";
import { auditTrace } from "./trace";

type Profile = {
  schema_version: "autonomous-pack-execution-profile/v1";
  profile_id: string; encoding_id: string; model_sha256: string;
  empty_index_sha256: string; empty_metadata_sha256: string; installed_metadata_sha256: string;
  proxy_image_sha256: string; audit_image_sha256: string;
};
type ModelParameters = { api_model_id: string; context_window: number; max_tokens: number };
type IndexMetadata = { condition: "empty-store" | "pack-installed"; pack_sha256: string; model_sha256: string; profile_id: string; encoding_id: string; index_sha256: string };
export type PairedDiagnosticOptions = {
  plan: AutonomousPlan;
  sources: PreparationSources;
  outputDirectory: string;
  modelFile: string;
  indexes: { empty: { archive: string; metadata: string }; installed: { archive: string; metadata: string } };
  syntheticEndpoint: string;
  auditWaitMs: number;
};
const tools = ["read", "bash", "edit", "write", "grep", "find", "ls", "lore_query", "lore_get"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function parseProfile(value: unknown): Profile {
  const keys = ["schema_version", "profile_id", "encoding_id", "model_sha256", "empty_index_sha256", "empty_metadata_sha256", "installed_metadata_sha256", "proxy_image_sha256", "audit_image_sha256"];
  if (!object(value) || !exact(value, keys) || value.schema_version !== "autonomous-pack-execution-profile/v1" || keys.slice(1).some(key => !digest(value[key]))) throw new Error("Invalid execution profile");
  return value as Profile;
}
function parseModel(value: unknown): ModelParameters {
  if (!object(value) || !exact(value, ["api_model_id", "context_window", "max_tokens"]) || typeof value.api_model_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value.api_model_id) || !Number.isSafeInteger(value.context_window) || !Number.isSafeInteger(value.max_tokens) || (value.context_window as number) < 1 || (value.max_tokens as number) < 1 || (value.max_tokens as number) > (value.context_window as number)) throw new Error("Invalid model parameters");
  return value as ModelParameters;
}
function parseMetadata(value: unknown, condition: IndexMetadata["condition"], plan: AutonomousPlan, profile: Profile, expected: string): IndexMetadata {
  const keys = ["condition", "pack_sha256", "model_sha256", "profile_id", "encoding_id", "index_sha256"];
  if (!object(value) || !exact(value, keys) || value.condition !== condition || value.pack_sha256 !== plan.pack.snapshot_sha256 || value.model_sha256 !== profile.model_sha256 || value.profile_id !== profile.profile_id || value.encoding_id !== profile.encoding_id || value.index_sha256 !== expected) throw new Error("Index provenance mismatch");
  return value as IndexMetadata;
}
async function copyVerified(source: string, destination: string, expected: string) {
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  if (await sha256File(destination) !== expected) throw new Error("Frozen artifact digest mismatch");
}

/** Local synthetic diagnostic only. No real model or formal record is allowed;
 * all runs remain ineligible until native audit and isolation are proven. */
export async function runPairedDiagnostic(options: PairedDiagnosticOptions) {
  assertPlan(options.plan);
  const plan = options.plan;
  let endpoint: URL;
  try { endpoint = new URL(options.syntheticEndpoint); } catch { throw new Error("Invalid synthetic endpoint"); }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "host.docker.internal" || !endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Diagnostic endpoint must be a local synthetic HTTPS service");
  if (plan.run_kind !== "pilot") throw new Error("Formal runs require the separate lifecycle and isolation gates");
  if (!isAbsolute(options.outputDirectory)) throw new Error("Diagnostic output must be an absolute path");
  const requested = resolve(options.outputDirectory);
  const root = join(await realpath(dirname(requested)), basename(requested));
  const inputPaths = [options.sources.pack, ...Object.values(options.sources.tasks).flatMap(task => [task.publicRoot, task.evaluatorRoot]), ...Object.values(options.sources.common), options.modelFile, options.indexes.empty.archive, options.indexes.empty.metadata, options.indexes.installed.archive, options.indexes.installed.metadata];
  const contains = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  for (const input of inputPaths) {
    const source = await realpath(input);
    if (contains(source, root) || contains(root, source)) throw new Error("Diagnostic output and input paths must be disjoint");
  }
  await mkdir(root, { mode: 0o700 });
  const inputs = await prepareInputs(plan, options.sources, join(root, "inputs"));
  const profile = parseProfile(JSON.parse(await readFile(inputs.common.profile, "utf8")));
  const model = parseModel(JSON.parse(await readFile(inputs.common.modelParameters, "utf8")));
  const toolPolicy: unknown = JSON.parse(await readFile(inputs.common.toolPolicy, "utf8"));
  if (JSON.stringify(toolPolicy) !== JSON.stringify(tools)) throw new Error("Tool policy does not match the pinned Pi entrypoint");
  const environment: unknown = Bun.YAML.parse(await readFile(inputs.common.environment, "utf8"));
  if (!object(environment) || !object(environment.agent_runtime) || !object(environment.model) || !object(environment.embedding) || environment.agent_runtime.id !== plan.common.agent || environment.model.id !== plan.common.model || environment.embedding.model_sha256 !== profile.model_sha256 || environment.embedding.profile_id !== profile.profile_id || environment.embedding.encoding_id !== profile.encoding_id || environment.embedding.retrieval_method !== "single-vector") throw new Error("Environment and execution profile mismatch");
  const system = await readFile(inputs.common.systemPrompt, "utf8");
  const frozen = join(root, "frozen");
  await mkdir(frozen, { mode: 0o700 });
  const modelFile = join(frozen, "model.gguf"), emptyArchive = join(frozen, "empty.tar"), installedArchive = join(frozen, "installed.tar"), emptyMetadata = join(frozen, "empty.json"), installedMetadata = join(frozen, "installed.json");
  await copyVerified(options.modelFile, modelFile, profile.model_sha256);
  await copyVerified(options.indexes.empty.archive, emptyArchive, profile.empty_index_sha256);
  await copyVerified(options.indexes.installed.archive, installedArchive, plan.pack.index_sha256);
  await copyVerified(options.indexes.empty.metadata, emptyMetadata, profile.empty_metadata_sha256);
  await copyVerified(options.indexes.installed.metadata, installedMetadata, profile.installed_metadata_sha256);
  parseMetadata(JSON.parse(await readFile(emptyMetadata, "utf8")), "empty-store", plan, profile, profile.empty_index_sha256);
  parseMetadata(JSON.parse(await readFile(installedMetadata, "utf8")), "pack-installed", plan, profile, plan.pack.index_sha256);
  const runs = join(root, "runs"), evaluations = join(root, "evaluations");
  await mkdir(runs, { mode: 0o700 }); await mkdir(evaluations, { mode: 0o700 });
  await writeFile(join(root, "plan.json"), JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const observations: AutonomousObservation[] = [];
  for (const slot of inputs.schedule) {
    const plannedTask = plan.tasks.find(task => task.id === slot.task_id)!;
    const task = inputs.tasks.get(slot.task_id)!;
    const isInstalled = slot.condition === "pack-installed";
    const observation: AutonomousObservation = {
      schema_version: "autonomous-pack-observation/v1", plan_id: plan.id, plan_sha256: inputs.planSha256,
      pair_id: slot.pair_id, condition: slot.condition, ordinal: slot.ordinal,
      input_sha256: null, common_sha256: null, pack_snapshot_sha256: isInstalled ? plan.pack.snapshot_sha256 : null, index_sha256: isInstalled ? plan.pack.index_sha256 : null,
      verification: { input: false, isolation: false, treatment: true, reasons: ["Independent process audit and API egress isolation are not proven"] },
      health: "execution-failed", failure_reasons: ["Run did not complete"], semantic: "not-run", quality: "not-run", quality_probes: [],
      trace: { complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 },
      duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: [],
    };
    try {
      const prepared = await prepareRunWorkspace(inputs, slot.ordinal);
      observation.input_sha256 = slot.input_sha256;
      observation.common_sha256 = slot.common_sha256;
      observation.verification.input = true;
      const run = await executeContainerRun({ agentImage: `sha256:${plan.common.image_sha256}`, proxyImage: `sha256:${profile.proxy_image_sha256}`, auditImage: `sha256:${profile.audit_image_sha256}`, workspace: prepared.workspace, index: isInstalled ? installedArchive : emptyArchive, modelFile, privateRoot: dirname(task.evaluator), artifactRoot: join(runs, String(slot.ordinal)), task: prepared.prompt, system, indexSha256: isInstalled ? plan.pack.index_sha256 : profile.empty_index_sha256, modelSha256: profile.model_sha256, modelId: model.api_model_id, contextWindow: model.context_window, maxTokens: model.max_tokens, maxTurns: plan.common.budget.max_turns, maxDurationMs: plan.common.budget.max_duration_ms, auditWaitMs: options.auditWaitMs, upstreamBaseUrl: endpoint.href, upstreamApiKey: "synthetic-local-only" });
      observation.duration_ms = run.durationMs;
      if (run.usage.complete && run.usage.totals) {
        observation.input_tokens = run.usage.totals.promptTokens;
        observation.output_tokens = run.usage.totals.completionTokens;
        observation.total_tokens = run.usage.totals.totalTokens;
        observation.cost_usd = run.usage.totals.costUsd ?? null;
      }
      for (const [kind, artifact] of Object.entries(run.artifacts)) if (artifact) observation.artifacts.push({ kind, uri: pathToFileURL(artifact.path).href, sha256: artifact.sha256 });
      if (run.status !== "completed" || !run.artifacts.pi) {
        observation.failure_reasons = [run.reason ?? "Agent execution failed"];
      } else {
        const trace = auditTrace(await readFile(run.artifacts.pi.path, "utf8"));
        const counts = traceObservation(trace);
        observation.trace = { ...counts, complete: false, query: "indeterminate" };
        const structuralErrors = trace.errors.filter(error => error !== "Shell access can invoke Lore outside the instrumented tools");
        if (structuralErrors.length) {
          observation.health = "indeterminate";
          observation.failure_reasons = ["Pi trace was incomplete or reported an agent error"];
        } else {
          const workspaceSha = await sha256SnapshotDirectory(prepared.workspace);
          const evaluationDirectory = join(evaluations, String(slot.ordinal));
          const evaluated = await evaluateSemantic({ workspace: prepared.workspace, evaluatorRoot: task.evaluator, evaluatorSha256: plannedTask.evaluator_sha256, imageId: `sha256:${plan.common.image_sha256}`, outputDirectory: evaluationDirectory });
          if (workspaceSha !== await sha256SnapshotDirectory(prepared.workspace)) throw new Error("Workspace changed during evaluation");
          observation.health = evaluated.health;
          observation.semantic = evaluated.semantic;
          observation.quality = evaluated.quality;
          observation.quality_probes = evaluated.quality_probes;
          observation.failure_reasons = evaluated.failure_reasons;
          const evaluationResult = join(evaluationDirectory, "result.json");
          observation.artifacts.push({ kind: "semantic-evaluation", uri: pathToFileURL(evaluationResult).href, sha256: await sha256File(evaluationResult) });
          const workspaceIdentity = join(runs, String(slot.ordinal), "workspace.json");
          await writeFile(workspaceIdentity, JSON.stringify({ algorithm: "autonomous-pack-tree/v1", uri: pathToFileURL(prepared.workspace).href, sha256: workspaceSha }) + "\n", { flag: "wx", mode: 0o600 });
          observation.artifacts.push({ kind: "workspace-identity", uri: pathToFileURL(workspaceIdentity).href, sha256: await sha256File(workspaceIdentity) });
        }
      }
    } catch {
      observation.health = "indeterminate";
      observation.semantic = "not-run";
      observation.quality = "not-run";
      observation.quality_probes = [];
      observation.failure_reasons = ["Run preparation or evaluation failed"];
    }
    assertObservation(observation);
    observations.push(observation);
    await writeFile(join(root, `observation-${slot.ordinal}.json`), JSON.stringify(observation, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  const summary = summarizePlan(plan, observations);
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { observations, summary };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3) throw new Error("Expected one private pilot configuration path");
    const stat = await lstat(process.argv[2]);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) throw new Error("Invalid pilot configuration file");
    const config: unknown = JSON.parse(await readFile(process.argv[2], "utf8"));
    const keys = ["plan", "sources", "outputDirectory", "modelFile", "indexes", "auditWaitMs", "syntheticEndpoint"];
    if (!object(config) || !exact(config, keys)) throw new Error("Invalid diagnostic configuration fields");
    const result = await runPairedDiagnostic(config as unknown as PairedDiagnosticOptions);
    console.log(JSON.stringify({ planned_runs: result.summary.planned_runs, eligible_pairs: result.summary.pairs.eligible, output_directory: config.outputDirectory }));
  } catch {
    // Never print configuration, environment, provider errors, or agent output.
    console.error("Pilot could not complete; inspect private artifacts and prerequisite configuration.");
    process.exitCode = 1;
  }
}
