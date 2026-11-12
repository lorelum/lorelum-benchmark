import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File } from "../../fs";
import { assertPlan, modelEndpointSha256, type AutonomousPlan } from "../v1/plan";
import { sha256SnapshotDirectory, snapshotPack } from "../v1/snapshot";
import { inspectCodingTask } from "./task";
import type { AutonomousPackPlanV2 } from "./paired-runner";
import { parseExecutionInput } from "./execution-input";

export type PrepareConfiguration = {
  id: string;
  tasks: string[];
  packSource: string;
  environment: string;
  agentImage: string;
  proxyImage: string;
  modelParameters: string;
  systemPrompt: string;
  modelFile: string;
  indexes: { empty: { archive: string; metadata: string }; installed: { archive: string; metadata: string } };
  repetitions: number;
  orderSeed: number;
  budget: { max_turns: number; max_duration_ms: number };
  auditWaitMs: number;
};

const tools = ["read", "bash", "edit", "write", "grep", "find", "ls", "lore_query", "lore_get"];
const within = (a: string, b: string) => { const r = relative(a, b); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
async function file(path: string): Promise<string> {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("Input path must be absolute");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Input must be a regular file");
  return realpath(path);
}
async function copy(source: string, destination: string): Promise<void> {
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  if (await sha256File(source) !== await sha256File(destination)) throw new Error("Input changed while being frozen");
}

/** Freeze a local Pack and generate one executable v2 pilot configuration.
 * This prepares inputs only: it does not execute Docker or a model. */
export async function prepareExperiment(config: PrepareConfiguration, destination: string, endpoint: string): Promise<string> {
  if (!config || typeof config.id !== "string" || !Array.isArray(config.tasks) || config.tasks.length === 0 ||
      typeof config.packSource !== "string" || !isAbsolute(config.packSource) || typeof destination !== "string" || !isAbsolute(destination) ||
      !/^sha256:[a-f0-9]{64}$/.test(config.agentImage ?? "") || !/^sha256:[a-f0-9]{64}$/.test(config.proxyImage ?? "") ||
      !config.indexes?.empty || !config.indexes?.installed) throw new Error("Invalid preparation configuration");
  const endpointSha = modelEndpointSha256(endpoint);
  const tasks = await Promise.all(config.tasks.map(path => inspectCodingTask(path)));
  if (new Set(tasks.map(task => task.declaration.id)).size !== tasks.length) throw new Error("Duplicate task id");
  const pack = await realpath(config.packSource);
  if (!(await lstat(config.packSource)).isDirectory() || (await lstat(config.packSource)).isSymbolicLink()) throw new Error("Pack source must be a directory, not a link");
  const [environment, parameters, prompt, model, emptyArchive, emptyMetadata, installedArchive, installedMetadata] = await Promise.all([
    config.environment, config.modelParameters, config.systemPrompt, config.modelFile,
    config.indexes.empty.archive, config.indexes.empty.metadata, config.indexes.installed.archive, config.indexes.installed.metadata,
  ].map(file));
  const root = join(await realpath(dirname(resolve(destination))), basename(resolve(destination)));
  for (const input of [pack, ...tasks.map(task => task.root), environment, parameters, prompt, model, emptyArchive, emptyMetadata, installedArchive, installedMetadata]) {
    if (within(input, root) || within(root, input)) throw new Error("Preparation output must be disjoint from all inputs");
  }
  await mkdir(root, { mode: 0o700 });
  try {
    const frozenPack = join(root, "pack");
    const packSha = await snapshotPack(pack, frozenPack);
    const envFile = join(root, "environment.yaml"), modelParams = join(root, "model.json"), system = join(root, "system.txt"), profile = join(root, "profile.json"), toolPolicy = join(root, "tools.json");
    await Promise.all([copy(environment, envFile), copy(parameters, modelParams), copy(prompt, system)]);
    const validated = parseExecutionInput({
      environment: Bun.YAML.parse(await readFile(envFile, "utf8")),
      modelParameters: JSON.parse(await readFile(modelParams, "utf8")),
      emptyMetadata: JSON.parse(await readFile(emptyMetadata, "utf8")),
      installedMetadata: JSON.parse(await readFile(installedMetadata, "utf8")),
      runtimes: tasks.map(task => task.declaration.environment.runtime),
      identities: { pack: packSha, model: await sha256File(model), emptyArchive: await sha256File(emptyArchive), installedArchive: await sha256File(installedArchive), emptyMetadata: await sha256File(emptyMetadata), installedMetadata: await sha256File(installedMetadata) },
      proxyImageSha256: config.proxyImage.slice(7),
    });
    const { profile: executionProfile, installed: treatment } = validated;
    const dump = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await dump(profile, executionProfile);
    await dump(toolPolicy, tools);
    const plan: AutonomousPlan = {
      schema_version: "autonomous-pack-plan/v1", id: config.id, run_kind: "pilot",
      tasks: tasks.map(task => ({ id: task.declaration.id, source_sha256: task.identities.starter_sha256, input_sha256: task.identities.input_sha256, evaluator_sha256: task.identities.evaluator_sha256 })),
      repetitions: config.repetitions, order_seed: config.orderSeed,
      common: { environment_sha256: await sha256File(envFile), image_sha256: config.agentImage.slice(7), agent: validated.agent, model: validated.modelId, model_endpoint_sha256: endpointSha, model_parameters_sha256: await sha256File(modelParams), profile_sha256: await sha256File(profile), tool_policy_sha256: await sha256File(toolPolicy), system_prompt_sha256: await sha256File(system), budget: config.budget },
      pack: { source: "local-snapshot", snapshot_uri: pathToFileURL(frozenPack).href, snapshot_sha256: treatment.pack_sha256, index_sha256: treatment.index_sha256 },
    };
    assertPlan(plan);
    const outer: AutonomousPackPlanV2 = { schema_version: "autonomous-pack-plan/v2", execution_contract: "autonomous-pack-pi-verifier/v2", plan, task_contracts: tasks.map(task => ({ id: task.declaration.id, runtime: task.declaration.environment.runtime, declaration_sha256: task.identities.declaration_sha256, calibration_sha256: task.identities.calibration_sha256 })) };
    const sources = { pack: frozenPack, tasks: Object.fromEntries(tasks.map(task => [task.declaration.id, { publicRoot: task.publicRoot, evaluatorRoot: task.evaluatorRoot }])), common: { environment: envFile, modelParameters: modelParams, profile, toolPolicy, systemPrompt: system } };
    await dump(join(root, "tasks.json"), tasks.map(task => ({ id: task.declaration.id, runtime: task.declaration.environment.runtime, identities: task.identities })));
    await dump(join(root, "pilot.json"), { plan: outer, sources, outputDirectory: join(root, "output"), modelFile: model, indexes: { empty: { archive: emptyArchive, metadata: emptyMetadata }, installed: { archive: installedArchive, metadata: installedMetadata } }, auditWaitMs: config.auditWaitMs });
    return join(root, "pilot.json");
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
