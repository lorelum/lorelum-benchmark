import Ajv2020 from "ajv/dist/2020";
import { constants, readFileSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { sha256File } from "../../fs";
import { hashContract } from "../v1/plan";
import { sha256SnapshotDirectory, snapshotPack } from "../v1/snapshot";
import { inspectCodingTask } from "./task";
import { executionPlan, type AutonomousPackPlanV2, type PairedPilotOptions } from "./paired-runner";

type PilotFile = Omit<PairedPilotOptions, "upstreamBaseUrl" | "upstreamApiKey">;
type Entry = { key: string; path: string; kind: "file" | "tree"; sha256: string };
type Bundle = { schema_version: "autonomous-pack-bundle/v1"; plan: AutonomousPackPlanV2; plan_sha256: string; auditWaitMs: number; entries: Entry[] };
const bundleSchemas = new Ajv2020({ strict: true, allErrors: true });
for (const name of ["autonomous-pack-plan-v1", "autonomous-pack-plan-v2"]) bundleSchemas.addSchema(JSON.parse(readFileSync(new URL(`../../../../schemas/${name}.schema.json`, import.meta.url), "utf8")));
const validateBundle = bundleSchemas.compile(JSON.parse(readFileSync(new URL("../../../../schemas/autonomous-pack-bundle-v1.schema.json", import.meta.url), "utf8")));
const inside = (a: string, b: string) => { const r = relative(a, b); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };

async function regular(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Bundle input must be a regular file");
}

/** Create an explicitly private handoff, containing the Pack, evaluator and
 * embedding model but no credentials, traces, candidate workspaces or diffs.
 * Sharing this directory requires authorization for all included content. */
export async function exportBundle(config: PilotFile, destination: string): Promise<void> {
  executionPlan(config.plan);
  if (!isAbsolute(destination)) throw new Error("Bundle output must be absolute");
  const root = join(await realpath(dirname(resolve(destination))), basename(resolve(destination)));
  const declared = [config.sources.pack, ...Object.values(config.sources.tasks).flatMap(t => [dirname(t.publicRoot), t.publicRoot, t.evaluatorRoot]), ...Object.values(config.sources.common), config.modelFile, config.indexes.empty.archive, config.indexes.empty.metadata, config.indexes.installed.archive, config.indexes.installed.metadata];
  for (const path of declared) {
    if (typeof path !== "string" || !isAbsolute(path)) throw new Error("Bundle sources must be absolute paths");
    const canonical = await realpath(path);
    if (inside(canonical, root) || inside(root, canonical)) throw new Error("Bundle output must be disjoint from inputs");
  }
  await mkdir(root, { mode: 0o700 });
  try {
    const entries: Entry[] = [];
    const putTree = async (key: string, path: string, source: string) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const sha256 = await snapshotPack(source, target);
      entries.push({ key, path, kind: "tree", sha256 });
    };
    const putFile = async (key: string, path: string, source: string) => {
      await regular(source);
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await chmod(target, 0o600);
      const sha256 = await sha256File(target);
      if (sha256 !== await sha256File(source)) throw new Error("Bundle source changed during copy");
      entries.push({ key, path, kind: "file", sha256 });
    };
    await putTree("pack", "data/pack", config.sources.pack);
    for (const [index, task] of config.plan.plan.tasks.entries()) {
      const source = config.sources.tasks[task.id];
      if (!source) throw new Error("Missing bundle task source");
      const candidateRoot = dirname(source.publicRoot);
      await putFile(`task:${index}:prompt`, `data/tasks/${index}/public/task.md`, join(source.publicRoot, "task.md"));
      await putTree(`task:${index}:starter`, `data/tasks/${index}/public/starter`, join(source.publicRoot, "starter"));
      await putFile(`task:${index}:declaration`, `data/tasks/${index}/private/candidate.yaml`, join(candidateRoot, "private/candidate.yaml"));
      await putTree(`task:${index}:evaluator`, `data/tasks/${index}/private/evaluator`, source.evaluatorRoot);
      await putTree(`task:${index}:calibration`, `data/tasks/${index}/private/calibration`, join(candidateRoot, "private/calibration"));
    }
    for (const key of ["environment", "modelParameters", "profile", "toolPolicy", "systemPrompt"] as const) {
      await putFile(`common:${key}`, `data/common/${key}`, config.sources.common[key]);
    }
    await putFile("model", "data/model", config.modelFile);
    for (const condition of ["empty", "installed"] as const) for (const kind of ["archive", "metadata"] as const) {
      await putFile(`index:${condition}:${kind}`, `data/index/${condition}/${kind}`, config.indexes[condition][kind]);
    }
    const manifest: Bundle = { schema_version: "autonomous-pack-bundle/v1", plan: config.plan, plan_sha256: hashContract(config.plan), auditWaitMs: config.auditWaitMs, entries };
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await verifyBundle(root);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** Reject absolute paths, traversal and links in every component before reading. */
async function entryPath(root: string, path: string): Promise<string> {
  if (!/^data\/[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some(s => !s || s === "." || s === "..")) throw new Error("Invalid bundle entry path");
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("Bundle contains a link");
  }
  return current;
}

/** Reconstruct execution paths relative to the bundle; original plan URIs are
 * retained as provenance and never used as paths during restoration. */
export async function verifyBundle(directory: string): Promise<PilotFile> {
  if (!isAbsolute(directory)) throw new Error("Bundle path must be absolute");
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid bundle directory");
  const root = await realpath(directory);
  const manifestPath = join(root, "manifest.json");
  await regular(manifestPath);
  const raw: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!validateBundle(raw)) throw new Error("Invalid bundle manifest");
  const manifest = raw as Bundle;
  executionPlan(manifest.plan);
  if (hashContract(manifest.plan) !== manifest.plan_sha256) throw new Error("Bundle plan identity mismatch");
  const expected = new Map<string, { path: string; kind: "file" | "tree" }>();
  expected.set("pack", { path: "data/pack", kind: "tree" });
  for (const [i] of manifest.plan.plan.tasks.entries()) {
    expected.set(`task:${i}:prompt`, { path: `data/tasks/${i}/public/task.md`, kind: "file" });
    expected.set(`task:${i}:starter`, { path: `data/tasks/${i}/public/starter`, kind: "tree" });
    expected.set(`task:${i}:declaration`, { path: `data/tasks/${i}/private/candidate.yaml`, kind: "file" });
    expected.set(`task:${i}:evaluator`, { path: `data/tasks/${i}/private/evaluator`, kind: "tree" });
    expected.set(`task:${i}:calibration`, { path: `data/tasks/${i}/private/calibration`, kind: "tree" });
  }
  for (const key of ["environment", "modelParameters", "profile", "toolPolicy", "systemPrompt"]) expected.set(`common:${key}`, { path: `data/common/${key}`, kind: "file" });
  expected.set("model", { path: "data/model", kind: "file" });
  for (const c of ["empty", "installed"]) for (const k of ["archive", "metadata"]) expected.set(`index:${c}:${k}`, { path: `data/index/${c}/${k}`, kind: "file" });
  if (manifest.entries.length !== expected.size) throw new Error("Bundle entries do not match plan");
  const paths = new Map<string, string>();
  for (const entry of manifest.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.key !== "string" || typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid bundle entry");
    const spec = expected.get(entry.key);
    if (!spec || paths.has(entry.key) || entry.path !== spec.path || entry.kind !== spec.kind) throw new Error("Unexpected bundle entry");
    const path = await entryPath(root, entry.path);
    const digest = entry.kind === "tree" ? await sha256SnapshotDirectory(path) : (await regular(path), await sha256File(path));
    if (digest !== entry.sha256) throw new Error("Bundle content identity mismatch");
    paths.set(entry.key, path);
  }
  const get = (key: string): string => { const path = paths.get(key); if (!path) throw new Error("Missing bundle entry"); return path; };
  const tasks = Object.fromEntries(manifest.plan.plan.tasks.map((task, i) => [task.id, { publicRoot: dirname(get(`task:${i}:prompt`)), evaluatorRoot: get(`task:${i}:evaluator`) }]));
  const sources = { pack: get("pack"), tasks, common: { environment: get("common:environment"), modelParameters: get("common:modelParameters"), profile: get("common:profile"), toolPolicy: get("common:toolPolicy"), systemPrompt: get("common:systemPrompt") } };
  // Verify the bundle against the plan, not only its self-described checksums.
  if (await sha256SnapshotDirectory(sources.pack) !== manifest.plan.plan.pack.snapshot_sha256) throw new Error("Bundle Pack does not match plan");
  for (const task of manifest.plan.plan.tasks) {
    const source = sources.tasks[task.id];
    const starter = await sha256SnapshotDirectory(join(source.publicRoot, "starter"));
    const prompt = await sha256File(join(source.publicRoot, "task.md"));
    if (starter !== task.source_sha256 || hashContract({ task_sha256: prompt, starter_sha256: starter }) !== task.input_sha256 || await sha256SnapshotDirectory(source.evaluatorRoot) !== task.evaluator_sha256) throw new Error("Bundle task does not match plan");
    const binding = manifest.plan.task_contracts.find(item => item.id === task.id)!;
    const declared = await inspectCodingTask(dirname(source.publicRoot));
    if (declared.declaration.id !== binding.id || declared.declaration.environment.runtime !== binding.runtime || declared.identities.declaration_sha256 !== binding.declaration_sha256 || declared.identities.calibration_sha256 !== binding.calibration_sha256) throw new Error("Bundle task declaration does not match plan");
  }
  for (const [key, expectedSha] of [["environment", manifest.plan.plan.common.environment_sha256], ["modelParameters", manifest.plan.plan.common.model_parameters_sha256], ["profile", manifest.plan.plan.common.profile_sha256], ["toolPolicy", manifest.plan.plan.common.tool_policy_sha256], ["systemPrompt", manifest.plan.plan.common.system_prompt_sha256]] as const) {
    if (await sha256File(sources.common[key]) !== expectedSha) throw new Error("Bundle common input does not match plan");
  }
  const environment = Bun.YAML.parse(await readFile(sources.common.environment, "utf8")) as { task_runtimes?: Record<string, unknown> } | null;
  if (!environment || !environment.task_runtimes || typeof environment.task_runtimes !== "object" || manifest.plan.task_contracts.some(binding => typeof environment.task_runtimes![binding.runtime] !== "string" || !environment.task_runtimes![binding.runtime])) throw new Error("Bundle task runtime does not match environment");
  const profile = JSON.parse(await readFile(sources.common.profile, "utf8")) as { model_sha256?: string; empty_index_sha256?: string; empty_metadata_sha256?: string; installed_metadata_sha256?: string; profile_id?: string; encoding_id?: string };
  const empty = JSON.parse(await readFile(get("index:empty:metadata"), "utf8")) as { condition?: string; pack_sha256?: string; model_sha256?: string; profile_id?: string; encoding_id?: string; index_sha256?: string };
  const installed = JSON.parse(await readFile(get("index:installed:metadata"), "utf8")) as typeof empty;
  if (!profile || !empty || !installed ||
      await sha256File(get("model")) !== profile.model_sha256 ||
      await sha256File(get("index:empty:archive")) !== profile.empty_index_sha256 ||
      await sha256File(get("index:empty:metadata")) !== profile.empty_metadata_sha256 ||
      await sha256File(get("index:installed:archive")) !== manifest.plan.plan.pack.index_sha256 ||
      await sha256File(get("index:installed:metadata")) !== profile.installed_metadata_sha256 ||
      empty.condition !== "empty-store" || installed.condition !== "pack-installed" ||
      [empty, installed].some(metadata => metadata.pack_sha256 !== manifest.plan.plan.pack.snapshot_sha256 || metadata.model_sha256 !== profile.model_sha256 || metadata.profile_id !== profile.profile_id || metadata.encoding_id !== profile.encoding_id) ||
      empty.index_sha256 !== profile.empty_index_sha256 || installed.index_sha256 !== manifest.plan.plan.pack.index_sha256) throw new Error("Bundle model or indexes do not match plan");
  return { plan: manifest.plan, sources, outputDirectory: "", modelFile: get("model"), indexes: { empty: { archive: get("index:empty:archive"), metadata: get("index:empty:metadata") }, installed: { archive: get("index:installed:archive"), metadata: get("index:installed:metadata") } }, auditWaitMs: manifest.auditWaitMs };
}
