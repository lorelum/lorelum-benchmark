import Ajv2020 from "ajv/dist/2020";
import { constants, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File } from "../../fs";
import { executeContainerRun, type ContainerExecutionResult } from "../v1/container-execution";
import { evaluateSemantic } from "./evaluator";
import { assertPlan, hashContract, modelEndpointSha256, type AutonomousPlan } from "../v1/plan";
import { prepareInputs, prepareRunWorkspace, type PreparationSources } from "../v1/runner-preparation";
import { inspectCodingTask } from "./task";
import { sha256SnapshotDirectory } from "../v1/snapshot";
import { assertObservation, summarizePlan, traceObservation, type AutonomousObservation } from "../v1/summary";
import { auditTrace } from "./trace";
import { parseExecutionInput } from "./execution-input";

/** The outer contract binds runner behavior to the full plan identity. */
export type AutonomousPackPlanV2 = {
  schema_version: "autonomous-pack-plan/v2";
  execution_contract: "autonomous-pack-pi-verifier/v2";
  task_contracts: { id: string; runtime: string; declaration_sha256: string; calibration_sha256: string }[];
  plan: AutonomousPlan;
};

const planSchemas = new Ajv2020({ strict: true, allErrors: true });
planSchemas.addSchema(JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-plan-v1.schema.json", import.meta.url), "utf8")));
const validateV2Plan = planSchemas.compile(JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-plan-v2.schema.json", import.meta.url), "utf8")));

/** Project to the existing deterministic scheduler without reusing a v1 plan identity. */
export function executionPlan(value: unknown): AutonomousPlan {
  if (!validateV2Plan(value)) throw new Error("Invalid v2 execution contract");
  const outer = value as AutonomousPackPlanV2;
  assertPlan(outer.plan);
  if (outer.task_contracts.length !== outer.plan.tasks.length) throw new Error("Task contract count mismatch");
  const ids = new Set<string>();
  for (const binding of outer.task_contracts) {
    if (ids.has(binding.id)) throw new Error("Duplicate task contract binding");
    ids.add(binding.id);
  }
  if (outer.plan.tasks.some(task => !ids.has(task.id))) throw new Error("Task contract identity mismatch");
  return { ...outer.plan, id: `autonomous-pack/v2:${hashContract(outer)}` };
}

export type PairedPilotOptions = {
  plan: AutonomousPackPlanV2;
  sources: PreparationSources;
  outputDirectory: string;
  modelFile: string;
  indexes: { empty: { archive: string; metadata: string }; installed: { archive: string; metadata: string } };
  upstreamBaseUrl: string;
  upstreamApiKey: string;
  auditWaitMs: number;
};
const tools = ["read", "bash", "edit", "write", "grep", "find", "ls", "lore_query", "lore_get"];

/** Record observable trace evidence and return whether semantic evaluation may run. */
export async function observeRunTrace(
  observation: AutonomousObservation,
  run: Pick<ContainerExecutionResult, "status" | "reason" | "artifacts">,
): Promise<boolean> {
  if (run.status !== "completed") {
    observation.failure_reasons = [run.reason ?? "Agent execution failed"];
    if (run.artifacts.pi) {
      try {
        const counts = traceObservation(auditTrace(await readFile(run.artifacts.pi.path, "utf8")));
        observation.trace = { ...counts, complete: false, query: "indeterminate" };
      } catch {
        // An unavailable trace is not evidence of any additional tool calls.
      }
    }
    return false;
  }
  if (!run.artifacts.pi) {
    observation.failure_reasons = [run.reason ?? "Agent execution failed"];
    return false;
  }
  const trace = auditTrace(await readFile(run.artifacts.pi.path, "utf8"));
  observation.trace = traceObservation(trace);
  if (!trace.structure_complete) {
    observation.health = "indeterminate";
    observation.failure_reasons = ["Pi trace was incomplete or reported an agent error"];
    return false;
  }
  return true;
}

/** A pilot does not create a formal record; the upstream and Docker daemon are trusted. */
export async function runPairedPilot(options: PairedPilotOptions) {
  const plan = executionPlan(options.plan);
  const outerPlanSha256 = hashContract(options.plan);
  const endpointSha256 = modelEndpointSha256(options.upstreamBaseUrl);
  if (!options.upstreamApiKey) throw new Error("Invalid model credential");
  if (!plan.common.model_endpoint_sha256) throw new Error("Model endpoint identity is required for new pilot runs");
  if (plan.common.model_endpoint_sha256 !== endpointSha256) throw new Error("Model endpoint identity mismatch");
  const endpoint = new URL(options.upstreamBaseUrl);
  if (plan.run_kind !== "pilot") throw new Error("Formal runs require the separate lifecycle and isolation gates");
  if (!isAbsolute(options.outputDirectory)) throw new Error("Diagnostic output must be an absolute path");
  const requested = resolve(options.outputDirectory);
  const root = join(await realpath(dirname(requested)), basename(requested));
  const inputPaths = [options.sources.pack, ...Object.values(options.sources.tasks).flatMap(task => [dirname(task.publicRoot), task.publicRoot, task.evaluatorRoot]), ...Object.values(options.sources.common), options.modelFile, options.indexes.empty.archive, options.indexes.empty.metadata, options.indexes.installed.archive, options.indexes.installed.metadata];
  const contains = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  for (const input of inputPaths) {
    const source = await realpath(input);
    if (contains(source, root) || contains(root, source)) throw new Error("Diagnostic output and input paths must be disjoint");
  }
  for (const binding of options.plan.task_contracts) {
    const source = options.sources.tasks[binding.id];
    if (!source) throw new Error("Missing task source");
    const task = await inspectCodingTask(dirname(source.publicRoot));
    if (task.declaration.id !== binding.id || task.declaration.environment.runtime !== binding.runtime || task.identities.declaration_sha256 !== binding.declaration_sha256 || task.identities.calibration_sha256 !== binding.calibration_sha256 || task.publicRoot !== await realpath(source.publicRoot) || task.evaluatorRoot !== await realpath(source.evaluatorRoot)) throw new Error("Task declaration or calibration identity mismatch");
  }
  await mkdir(root, { mode: 0o700 });
  const inputs = await prepareInputs(plan, options.sources, join(root, "inputs"));
  const toolPolicy: unknown = JSON.parse(await readFile(inputs.common.toolPolicy, "utf8"));
  if (JSON.stringify(toolPolicy) !== JSON.stringify(tools)) throw new Error("Tool policy does not match the pinned Pi entrypoint");
  const system = await readFile(inputs.common.systemPrompt, "utf8");
  const frozen = join(root, "frozen");
  await mkdir(frozen, { mode: 0o700 });
  const modelFile = join(frozen, "model.gguf"), emptyArchive = join(frozen, "empty.tar"), installedArchive = join(frozen, "installed.tar"), emptyMetadata = join(frozen, "empty.json"), installedMetadata = join(frozen, "installed.json");
  await Promise.all([
    [options.modelFile, modelFile], [options.indexes.empty.archive, emptyArchive], [options.indexes.installed.archive, installedArchive],
    [options.indexes.empty.metadata, emptyMetadata], [options.indexes.installed.metadata, installedMetadata],
  ].map(([source, destination]) => copyFile(source, destination, constants.COPYFILE_EXCL)));
  const { profile, model } = parseExecutionInput({
    environment: Bun.YAML.parse(await readFile(inputs.common.environment, "utf8")),
    modelParameters: JSON.parse(await readFile(inputs.common.modelParameters, "utf8")),
    profile: JSON.parse(await readFile(inputs.common.profile, "utf8")),
    emptyMetadata: JSON.parse(await readFile(emptyMetadata, "utf8")),
    installedMetadata: JSON.parse(await readFile(installedMetadata, "utf8")),
    runtimes: options.plan.task_contracts.map(binding => binding.runtime),
    identities: { pack: plan.pack.snapshot_sha256, model: await sha256File(modelFile), emptyArchive: await sha256File(emptyArchive), installedArchive: await sha256File(installedArchive), emptyMetadata: await sha256File(emptyMetadata), installedMetadata: await sha256File(installedMetadata) },
    expected: { agent: plan.common.agent, model: plan.common.model, installedIndex: plan.pack.index_sha256 },
  });
  const modelProvider = plan.common.model.slice(0, plan.common.model.indexOf("/"));
  const runs = join(root, "runs"), evaluations = join(root, "evaluations");
  await mkdir(runs, { mode: 0o700 }); await mkdir(evaluations, { mode: 0o700 });
  await writeFile(join(root, "plan.json"), JSON.stringify(options.plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(join(root, "execution-plan.json"), JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const observations: AutonomousObservation[] = [];
  for (const slot of inputs.schedule) {
    const plannedTask = plan.tasks.find(task => task.id === slot.task_id)!;
    const task = inputs.tasks.get(slot.task_id)!;
    const isInstalled = slot.condition === "pack-installed";
    const observation: AutonomousObservation = {
      schema_version: "autonomous-pack-observation/v1", plan_id: plan.id, plan_sha256: inputs.planSha256,
      pair_id: slot.pair_id, condition: slot.condition, ordinal: slot.ordinal,
      input_sha256: null, common_sha256: null, pack_snapshot_sha256: isInstalled ? plan.pack.snapshot_sha256 : null, index_sha256: isInstalled ? plan.pack.index_sha256 : null,
      verification: { input: false, isolation: false, treatment: true, reasons: ["Execution isolation not verified"] },
      health: "execution-failed", failure_reasons: ["Run did not complete"], semantic: "not-run", quality: "not-run", quality_probes: [],
      trace: { complete: false, query: "indeterminate", get_success: 0, get_failed: 0, get_indeterminate: 0 },
      duration_ms: null, cost_usd: null, input_tokens: null, output_tokens: null, total_tokens: null, artifacts: [],
    };
    try {
      const prepared = await prepareRunWorkspace(inputs, slot.ordinal);
      observation.input_sha256 = slot.input_sha256;
      observation.common_sha256 = slot.common_sha256;
      observation.verification.input = true;
      const run = await executeContainerRun({ agentImage: `sha256:${plan.common.image_sha256}`, proxyImage: `sha256:${profile.proxy_image_sha256}`, workspace: prepared.workspace, index: isInstalled ? installedArchive : emptyArchive, modelFile, privateRoot: dirname(task.evaluator), artifactRoot: join(runs, String(slot.ordinal)), task: prepared.prompt, system, indexSha256: isInstalled ? plan.pack.index_sha256 : profile.empty_index_sha256, modelSha256: profile.model_sha256, modelId: model.api_model_id, modelProvider, contextWindow: model.context_window, maxTokens: model.max_tokens, maxTurns: plan.common.budget.max_turns, maxDurationMs: plan.common.budget.max_duration_ms, auditWaitMs: options.auditWaitMs, upstreamBaseUrl: endpoint.href, upstreamApiKey: options.upstreamApiKey });
      observation.verification.isolation = run.isolation === "observed";
      observation.verification.reasons = run.isolation === "observed" ? [] : ["Execution isolation not verified"];
      observation.duration_ms = run.durationMs;
      if (run.usage.complete && run.usage.totals) {
        observation.input_tokens = run.usage.totals.promptTokens;
        observation.output_tokens = run.usage.totals.completionTokens;
        observation.total_tokens = run.usage.totals.totalTokens;
        observation.cost_usd = run.usage.totals.costUsd ?? null;
      }
      for (const [kind, artifact] of Object.entries(run.artifacts)) if (artifact) observation.artifacts.push({ kind, uri: pathToFileURL(artifact.path).href, sha256: artifact.sha256 });
      if (await observeRunTrace(observation, run)) {
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
  const execution = { schema_version: "autonomous-pack-execution/v2" as const, execution_contract: options.plan.execution_contract, outer_plan_sha256: outerPlanSha256, execution_plan_sha256: inputs.planSha256 };
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(join(root, "execution.json"), JSON.stringify(execution, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { observations, summary, execution };
}
