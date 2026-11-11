import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertPlan, hashContract, schedulePlan, type AutonomousPlan, type ScheduledRun } from "./plan";
import { snapshotPack } from "./snapshot";

/** Host sources are copied into an exclusively created preparation directory;
 * only the resulting public starter may ever be mounted in an agent container. */
export type PreparationSources = {
  pack: string;
  tasks: Readonly<Record<string, { publicRoot: string; evaluatorRoot: string }>>;
  common: {
    environment: string;
    modelParameters: string;
    profile: string;
    toolPolicy: string;
    systemPrompt: string;
  };
};

export type PreparedInputs = {
  root: string;
  pack: string;
  tasks: ReadonlyMap<string, { task: string; starter: string; evaluator: string; starterSha256: string }>;
  common: { environment: string; modelParameters: string; profile: string; toolPolicy: string; systemPrompt: string };
  schedule: ScheduledRun[];
  planSha256: string;
};

async function snapshotFile(source: string, destination: string, expected?: string): Promise<string> {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Input must be a regular file, not a link");
  const bytes = await readFile(source);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (expected !== undefined && sha !== expected) throw new Error("Input file digest mismatch");
  await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  const after = await lstat(source);
  if (!after.isFile() || after.isSymbolicLink() || createHash("sha256").update(await readFile(source)).digest("hex") !== sha) {
    throw new Error("Input file changed during snapshot");
  }
  return sha;
}

/** Freeze and verify the bytes identified by an autonomous-pack/v1 plan. This
 * does not establish container isolation, index readiness, or authorization. */
export async function prepareInputs(plan: AutonomousPlan, sources: PreparationSources, destination: string): Promise<PreparedInputs> {
  assertPlan(plan);
  const schedule = schedulePlan(plan);
  const root = resolve(destination);
  // Exclusive creation prevents overwriting a previous snapshot or unrelated files.
  await mkdir(root, { mode: 0o700 });
  try {
    const pack = join(root, "pack");
    if (await snapshotPack(sources.pack, pack) !== plan.pack.snapshot_sha256) throw new Error("Pack snapshot digest mismatch");
    await mkdir(join(root, "tasks"), { mode: 0o700 });
    const tasks = new Map<string, { task: string; starter: string; evaluator: string; starterSha256: string }>();
    for (const [index, planned] of plan.tasks.entries()) {
      if (!Object.hasOwn(sources.tasks, planned.id)) throw new Error(`Missing task source: ${planned.id}`);
      const source = sources.tasks[planned.id];
      const dir = join(root, "tasks", String(index));
      await mkdir(dir, { mode: 0o700 });
      const starter = join(dir, "starter");
      const starterSha = await snapshotPack(join(source.publicRoot, "starter"), starter);
      if (starterSha !== planned.source_sha256) throw new Error(`Starter digest mismatch: ${planned.id}`);
      const task = join(dir, "task.md");
      const taskSha = await snapshotFile(join(source.publicRoot, "task.md"), task);
      if (hashContract({ task_sha256: taskSha, starter_sha256: starterSha }) !== planned.input_sha256) throw new Error(`Public input digest mismatch: ${planned.id}`);
      const evaluator = join(dir, "evaluator");
      if (await snapshotPack(source.evaluatorRoot, evaluator) !== planned.evaluator_sha256) throw new Error(`Evaluator digest mismatch: ${planned.id}`);
      tasks.set(planned.id, { task, starter, evaluator, starterSha256: starterSha });
    }
    const commonDir = join(root, "common");
    await mkdir(commonDir, { mode: 0o700 });
    const common = {
      environment: join(commonDir, "environment"),
      modelParameters: join(commonDir, "model-parameters"),
      profile: join(commonDir, "profile"),
      toolPolicy: join(commonDir, "tool-policy"),
      systemPrompt: join(commonDir, "system-prompt"),
    };
    for (const [key, expected] of [
      ["environment", plan.common.environment_sha256],
      ["modelParameters", plan.common.model_parameters_sha256],
      ["profile", plan.common.profile_sha256],
      ["toolPolicy", plan.common.tool_policy_sha256],
      ["systemPrompt", plan.common.system_prompt_sha256],
    ] as const) await snapshotFile(sources.common[key], common[key], expected);
    return { root, pack, tasks, common, schedule, planSha256: hashContract(plan) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

// This tree is public and dedicated to one agent. Docker's container UID may
// map to any host UID (including a subordinate rootless UID), so ownership
// changes cannot reliably grant access. Keep executable bits on starter files.
async function makeWorkspaceWritable(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error("Workspace cannot contain symbolic links");
  if (info.isDirectory()) {
    await chmod(path, 0o777);
    for (const entry of await readdir(path)) await makeWorkspaceWritable(join(path, entry));
  } else if (info.isFile()) {
    await chmod(path, 0o666 | (info.mode & 0o111));
  } else throw new Error("Workspace cannot contain special files");
}

/** Materialize one fresh public workspace from the frozen starter, never the
 * evaluator or Pack. The prompt is returned separately, after re-verification. */
export async function prepareRunWorkspace(inputs: PreparedInputs, ordinal: number): Promise<{ workspace: string; prompt: string }> {
  const slot = inputs.schedule[ordinal];
  if (!Number.isSafeInteger(ordinal) || !slot || slot.ordinal !== ordinal) throw new Error("Unknown scheduled ordinal");
  const task = inputs.tasks.get(slot.task_id);
  if (!task) throw new Error("Missing frozen task input");
  const taskStat = await lstat(task.task);
  if (!taskStat.isFile() || taskStat.isSymbolicLink()) throw new Error("Frozen task is not a regular file");
  const bytes = await readFile(task.task);
  const taskSha = createHash("sha256").update(bytes).digest("hex");
  if (hashContract({ task_sha256: taskSha, starter_sha256: task.starterSha256 }) !== slot.input_sha256) throw new Error("Frozen public input digest mismatch");
  const prompt = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const workspace = join(inputs.root, "workspaces", String(ordinal));
  await mkdir(join(inputs.root, "workspaces"), { recursive: true, mode: 0o700 });
  const starterSha = await snapshotPack(task.starter, workspace);
  if (starterSha !== task.starterSha256) {
    await rm(workspace, { recursive: true, force: true });
    throw new Error("Frozen starter digest mismatch");
  }
  // Windows bind mounts use Docker Desktop's file sharing rather than POSIX
  // host ownership; do not change their Windows read-only attributes.
  if (process.platform !== "win32") await makeWorkspaceWritable(workspace);
  return { workspace, prompt };
}
