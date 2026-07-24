import { chmod, cp, lstat, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { containerCommand, containerEnvironment, formalContainerSandbox } from "./runner/pi/v2/sandbox";
import { joinPath, sha256File, sha256Text, workspaceRoot } from "./fs";

type RecordValue = Record<string, unknown>;
type Treatment = { id: string; version: string; content_sha256: string; length: number };
type Task = { id: string; candidate: string; candidate_entrypoint: string; task_snapshot_sha256: string; profile: string; profile_sha256: string; oracle: Treatment; irrelevant: Treatment };
type Plan = { id: string; version: string; source_commit: string; scope: { repetitions: number; conditions: string[]; total_executions: number }; execution: RecordValue; tasks: Task[] };

const planPath = joinPath(workspaceRoot, "protocol", "practice-effectiveness-exploratory", "v1", "plan.yaml");

function fail(message: string): never { throw new Error(message); }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function relativePath(path: string): string { return relative(workspaceRoot, path).replaceAll("\\", "/"); }
function insideWorkspace(path: string): boolean { const result = relative(workspaceRoot, resolve(path)); return !result.startsWith("..") && !isAbsolute(result); }

async function readPlan(): Promise<Plan> {
  const parsed = Bun.YAML.parse(await Bun.file(planPath).text()) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.scope) || !isRecord(parsed.execution) || !Array.isArray(parsed.tasks)) fail("Exploratory plan is invalid");
  return parsed as unknown as Plan;
}

async function assertGitAncestor(commit: string): Promise<void> {
  const child = Bun.spawn(["git", "merge-base", "--is-ancestor", commit, "HEAD"], { cwd: workspaceRoot, stdout: "ignore", stderr: "pipe" });
  if ((await child.exited) !== 0) fail(`Plan source commit is not an ancestor of HEAD: ${commit}`);
}

async function walkFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    const item = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) fail(`Symbolic links are not allowed: ${relativePath(path)}`);
    if (stats.isDirectory()) files.push(...await walkFiles(path, item));
    else if (stats.isFile()) files.push(item);
    else fail(`Unsupported filesystem entry: ${relativePath(path)}`);
  }
  return files.sort();
}

async function verifyCandidateSnapshot(candidate: string, expectedId: string): Promise<void> {
  const root = joinPath(workspaceRoot, candidate);
  const snapshotPath = joinPath(root, "private", "snapshot.json");
  const snapshot = await Bun.file(snapshotPath).json() as { snapshot_id?: unknown; files?: unknown };
  if (snapshot.snapshot_id !== expectedId || !isRecord(snapshot.files)) fail(`Candidate snapshot ID mismatch: ${candidate}`);
  const files = (await walkFiles(root)).filter((file) => file !== "private/snapshot.json");
  const actual = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha256File(joinPath(root, file))])));
  const actualId = await sha256Text(JSON.stringify(actual));
  if (actualId !== expectedId || JSON.stringify(actual) !== JSON.stringify(snapshot.files)) fail(`Candidate snapshot content mismatch: ${candidate}`);
}

function profileTreatments(profile: RecordValue): RecordValue {
  const treatments = profile.pinned_treatment_content ?? profile.static_prompt_interventions;
  if (!isRecord(treatments)) fail("Profile has no private pinned treatment content");
  return treatments;
}

async function verifyTreatment(task: Task, key: "oracle_practice" | "irrelevant_control", expected: Treatment, publicFiles: string[]): Promise<string> {
  const profilePath = joinPath(workspaceRoot, task.profile);
  if (!insideWorkspace(profilePath) || !task.profile.includes("/private/validation-profile/")) fail(`Profile must be a private validation profile: ${task.id}`);
  if ((await sha256File(profilePath)) !== task.profile_sha256) fail(`Profile hash mismatch: ${task.id}`);
  const profile = Bun.YAML.parse(await Bun.file(profilePath).text()) as unknown;
  if (!isRecord(profile) || profile.version !== 1 || profile.lifecycle_stage !== "candidate") fail(`Profile revision is not candidate/v1: ${task.id}`);
  const entry = profileTreatments(profile)[key];
  if (!isRecord(entry) || entry.id !== expected.id || expected.version !== "v1" || typeof entry.content !== "string") fail(`Private treatment reference mismatch: ${task.id}/${key}`);
  const content = entry.content;
  if ((await sha256Text(content)) !== expected.content_sha256 || [...content].length !== expected.length) fail(`Private treatment hash mismatch: ${task.id}/${key}`);
  for (const file of publicFiles) if ((await Bun.file(file).text()).includes(content)) fail(`Private treatment leaked into public material: ${relativePath(file)}`);
  if ((await Bun.file(planPath).text()).includes(content)) fail("Private treatment leaked into committed plan");
  return content;
}

async function verifyCandidateEntrypoint(task: Task, publicRoot: string): Promise<void> {
  if (typeof task.candidate_entrypoint !== "string" || task.candidate_entrypoint.length === 0) fail(`Candidate entrypoint is missing: ${task.id}`);
  const starterRoot = resolve(publicRoot, "starter");
  const entrypoint = resolve(publicRoot, task.candidate_entrypoint);
  const entrypointRelative = relative(starterRoot, entrypoint);
  if (entrypointRelative.startsWith("..") || isAbsolute(entrypointRelative)) fail(`Candidate entrypoint escapes public starter: ${task.id}`);
  const stats = await lstat(entrypoint);
  if (!stats.isFile() && !stats.isDirectory()) fail(`Candidate entrypoint is not a file or directory: ${task.id}`);
}

async function verifyPlan(plan: Plan): Promise<Map<string, { oracle: string; irrelevant: string }>> {
  const execution = plan.execution;
  if (plan.id !== "practice-effectiveness-exploratory" || plan.version !== "v1" || plan.scope.repetitions !== 2 || plan.scope.total_executions !== 36 || JSON.stringify(plan.scope.conditions) !== JSON.stringify(["baseline", "oracle-practice", "irrelevant-practice"])) fail("Exploratory plan scope is not the authorized 36-run design");
  if (execution.pi_version !== "0.80.10" || execution.model_alias !== "deepseek-v4-pro" || execution.pi_model !== "deepseek/deepseek-v4-pro" || execution.max_turns !== 20 || execution.max_duration_ms !== 600000 || execution.seed !== null) fail("Exploratory execution envelope is invalid");
  const promptPath = joinPath(workspaceRoot, String(execution.system_prompt_path));
  const policyPath = joinPath(workspaceRoot, String(execution.tool_policy_path));
  if ((await sha256File(promptPath)) !== execution.system_prompt_sha256 || (await sha256File(policyPath)) !== execution.tool_policy_sha256) fail("Prompt or tool policy hash mismatch");
  await assertGitAncestor(plan.source_commit);
  if (plan.tasks.length !== 6 || new Set(plan.tasks.map((task) => task.id)).size !== 6) fail("Exploratory plan must name exactly six candidates");
  const content = new Map<string, { oracle: string; irrelevant: string }>();
  for (const task of plan.tasks) {
    const candidateRoot = joinPath(workspaceRoot, task.candidate);
    const publicRoot = joinPath(candidateRoot, "public");
    const evaluatorRoot = joinPath(candidateRoot, "private", "evaluator");
    if (!(await Bun.file(joinPath(publicRoot, "task.md")).exists()) || !(await Bun.file(joinPath(publicRoot, "task.yaml")).exists()) || !(await Bun.file(joinPath(evaluatorRoot, "functional.test.ts")).exists())) fail(`Candidate public/private boundary is incomplete: ${task.id}`);
    await verifyCandidateSnapshot(task.candidate, task.task_snapshot_sha256);
    await verifyCandidateEntrypoint(task, publicRoot);
    const publicFiles = (await walkFiles(publicRoot)).map((file) => joinPath(publicRoot, file));
    const oracle = await verifyTreatment(task, "oracle_practice", task.oracle, publicFiles);
    const irrelevant = await verifyTreatment(task, "irrelevant_control", task.irrelevant, publicFiles);
    const ratio = task.irrelevant.length / task.oracle.length;
    if (ratio < 0.75 || ratio > 1.25) fail(`Irrelevant treatment is not length comparable: ${task.id}`);
    content.set(task.id, { oracle, irrelevant });
  }
  return content;
}

async function copyPublicTree(source: string, destination: string): Promise<void> {
  const stats = await lstat(source);
  if (stats.isSymbolicLink()) fail(`Public source must not be a symbolic link: ${relativePath(source)}`);
  if (stats.isDirectory()) { await mkdir(destination, { recursive: true }); for (const entry of await readdir(source)) await copyPublicTree(join(source, entry), join(destination, entry)); return; }
  if (!stats.isFile()) fail(`Public source must be a file: ${relativePath(source)}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: false, errorOnExist: true });
}

async function makeStarterWritableForContainer(path: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) fail(`Starter must not contain a symbolic link: ${relativePath(path)}`);
  if (stats.isDirectory()) {
    await chmod(path, 0o777);
    for (const entry of await readdir(path)) await makeStarterWritableForContainer(join(path, entry));
    return;
  }
  if (!stats.isFile()) fail(`Starter contains an unsupported entry: ${relativePath(path)}`);
  await chmod(path, 0o666);
}

async function runProcess(command: string[], cwd: string, env: Record<string, string | undefined>, timeoutMs: number, onTimeout?: () => Promise<void>): Promise<{ exit_code: number; timed_out: boolean; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  let cleanup: Promise<void> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
    cleanup = onTimeout?.();
  }, timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  clearTimeout(timer);
  await cleanup;
  return { exit_code: exitCode, timed_out: timedOut, stdout, stderr };
}

async function apiKey(authFile?: string): Promise<string> {
  if (Bun.env.DEEPSEEK_API_KEY) return Bun.env.DEEPSEEK_API_KEY;
  if (!authFile) fail("Missing DEEPSEEK_API_KEY. Pass --auth-file with a local Pi auth.json, or provide the variable through the protected runner environment.");
  const document = JSON.parse(await Bun.file(authFile).text()) as unknown;
  const deepseek = isRecord(document) ? document.deepseek : undefined;
  if (!isRecord(deepseek) || typeof deepseek.key !== "string" || deepseek.key.length === 0) fail("The supplied Pi auth file does not contain deepseek.key");
  return deepseek.key;
}

async function sandboxPreflight(): Promise<void> {
  if (Bun.env.LORELUM_SANDBOX_ENFORCED !== "1") fail("Sandbox preflight requires LORELUM_SANDBOX_ENFORCED=1");
  const result = await runProcess([process.execPath, "run", "src/benchmark/runner/pi/v2/sandbox-preflight.ts"], workspaceRoot, Bun.env, 120000);
  if (result.exit_code !== 0 || result.timed_out) fail(`Sandbox preflight failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

async function docker(command: string[], timeoutMs = 120000): Promise<{ exit_code: number; timed_out: boolean; stdout: string; stderr: string }> {
  return runProcess(["docker", ...command], workspaceRoot, { PATH: Bun.env.PATH ?? "" }, timeoutMs);
}

async function localDirectImage(plan: Plan): Promise<{ tag: string; image_id: string }> {
  const local = isRecord(plan.execution.local_direct) ? plan.execution.local_direct : fail("Exploratory plan has no local-direct configuration");
  if (local.mode !== "local-direct-docker" || local.dockerfile !== "Dockerfile.formal-pi" || local.network !== "bridge" || local.isolation !== "public-workspace-and-readonly-treatment-only") fail("Local-direct configuration is invalid");
  const revision = await runProcess(["git", "rev-parse", "--short=12", "HEAD"], workspaceRoot, { PATH: Bun.env.PATH ?? "" }, 30000);
  if (revision.exit_code !== 0) fail("Unable to identify local exploratory source revision: " + revision.stderr.trim());
  const tag = String(local.image_tag_prefix) + ":" + revision.stdout.trim();
  const scratch = joinPath(workspaceRoot, "scratch");
  await mkdir(scratch, { recursive: true });
  const context = await mkdtemp(joinPath(scratch, "practice-effectiveness-exploratory-build-"));
  for (const file of ["Dockerfile.formal-pi", "package.json", "bun.lock"]) await copyPublicTree(joinPath(workspaceRoot, file), join(context, file));
  const build = await docker(["build", "--file", join(context, "Dockerfile.formal-pi"), "--tag", tag, context], 600000);
  if (build.exit_code !== 0 || build.timed_out) fail("Local exploratory image build failed: " + (build.stderr.trim() || build.stdout.trim()));
  const version = await docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--entrypoint", "/bin/sh", tag, "-ec", 'test "$(bun --version)" = "1.3.11"; test "$(node --version)" = "v22.19.0"; grep -q "\\\"version\\\": \\\"0.80.10\\\"" node_modules/@earendil-works/pi-coding-agent/package.json'], 120000);
  if (version.exit_code !== 0 || version.timed_out) fail("Local exploratory image version check failed: " + (version.stderr.trim() || version.stdout.trim()));
  const inspected = await docker(["image", "inspect", "--format", "{{.Id}}", tag], 30000);
  if (inspected.exit_code !== 0 || !inspected.stdout.trim()) fail("Unable to inspect local exploratory image: " + inspected.stderr.trim());
  return { tag, image_id: inspected.stdout.trim() };
}

function localDirectCommand(runId: string, image: string, workspace: string, skillPath: string | undefined, args: string[]): string[] {
  const command = ["docker", "run", "--rm", "--name", "lorelum-exploratory-" + runId, "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit", "256", "--memory", "2g", "--network", "bridge", "--workdir", "/workspace", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--mount", "type=bind,src=" + workspace + ",dst=/workspace"];
  if (skillPath) command.push("--mount", "type=bind,src=" + dirname(skillPath) + ",dst=/lorelum/treatment,readonly");
  command.push("-e", "DEEPSEEK_API_KEY", "-e", "NO_PROXY=", image, ...args);
  if (skillPath) command.push("--skill", "/lorelum/treatment/SKILL.md");
  return command;
}

async function removeLocalContainer(runId: string): Promise<void> {
  const removed = await docker(["rm", "--force", "lorelum-exploratory-" + runId], 60000);
  if (removed.exit_code !== 0 && !removed.stderr.includes("No such container")) console.error(`Timed-out local container cleanup failed for ${runId}: ${removed.stderr.trim() || removed.stdout.trim()}`);
}

function plannedRunIds(plan: Plan): Set<string> {
  return new Set(plan.tasks.flatMap((task) => Array.from({ length: plan.scope.repetitions }, (_, index) => plan.scope.conditions.map((condition) => `${task.id}-${condition}-${String(index + 1).padStart(2, "0")}`)).flat()));
}

async function execute(plan: Plan, treatments: Map<string, { oracle: string; irrelevant: string }>, authFile: string | undefined, mode: "formal" | "local-direct", selectedRunIds: Set<string>): Promise<void> {
  const key = await apiKey(authFile);
  const localImage = mode === "local-direct" ? await localDirectImage(plan) : undefined;
  if (mode === "formal") await sandboxPreflight();
  const environment = mode === "formal" ? Bun.YAML.parse(await Bun.file(joinPath(workspaceRoot, "environments", "formal-pi-deepseek-v4-pro", "v1", "environment.yaml")).text()) as RecordValue : undefined;
  const sandbox = environment ? formalContainerSandbox(environment) : undefined;
  const execution = plan.execution;
  const policy = Bun.YAML.parse(await Bun.file(joinPath(workspaceRoot, String(execution.tool_policy_path))).text()) as RecordValue;
  const piPolicy = isRecord(policy.pi) ? policy.pi : fail("Tool policy has no Pi configuration");
  const requiredArgs = Array.isArray(piPolicy.required_args) && piPolicy.required_args.every((value) => typeof value === "string") ? piPolicy.required_args as string[] : fail("Tool policy required_args are invalid");
  const session = "issue-59-" + mode + "-" + new Date().toISOString().replaceAll(/[:.]/g, "-");
  const scratchRoot = joinPath(workspaceRoot, "scratch", "practice-effectiveness-exploratory", session);
  await mkdir(scratchRoot, { recursive: true });
  await writeFile(join(scratchRoot, "session.json"), `${JSON.stringify({ kind: "scratch-only-exploratory-session", execution_mode: mode === "local-direct" ? "local-direct-docker" : "formal", network_boundary: mode === "local-direct" ? "direct-egress-non-formal" : "formal-allowlist-sandbox", local_image: localImage ?? null, selected_run_ids: [...selectedRunIds] }, null, 2)}\n`);
  const summary: Array<RecordValue> = [];
  for (const task of plan.tasks) for (let repeat = 1; repeat <= plan.scope.repetitions; repeat += 1) for (const condition of plan.scope.conditions) {
    const runId = `${task.id}-${condition}-${String(repeat).padStart(2, "0")}`;
    if (selectedRunIds.size > 0 && !selectedRunIds.has(runId)) continue;
    const runRoot = await mkdtemp(join(scratchRoot, `${runId}-`));
    const workspace = join(runRoot, "workspace");
    const treatment = condition === "oracle-practice" ? treatments.get(task.id)?.oracle : condition === "irrelevant-practice" ? treatments.get(task.id)?.irrelevant : undefined;
    if (condition !== "baseline" && !treatment) fail(`Missing pinned treatment for ${runId}`);
    await copyPublicTree(joinPath(workspaceRoot, task.candidate, "public", "task.md"), join(workspace, "task.md"));
    await copyPublicTree(joinPath(workspaceRoot, task.candidate, "public", "starter"), join(workspace, "starter"));
    if (mode === "local-direct") await makeStarterWritableForContainer(join(workspace, "starter"));
    const skillPath = treatment ? join(runRoot, "treatment", "SKILL.md") : undefined;
    if (skillPath) { await mkdir(dirname(skillPath), { recursive: true }); await writeFile(skillPath, treatment); }
    const args = ["--model", String(execution.pi_model), "--system-prompt", await Bun.file(joinPath(workspaceRoot, String(execution.system_prompt_path))).text(), ...requiredArgs, "--tools", String(piPolicy.tools), String(piPolicy.task_prompt), String(piPolicy.task_instruction)];
    const command = mode === "formal"
      ? containerCommand({ run_id: runId, execution: { command: "pi", args } } as never, sandbox!, workspace, skillPath)
      : localDirectCommand(runId, localImage!.tag, workspace, skillPath, args);
    const startedAt = new Date().toISOString();
    const pi = await runProcess(command, workspaceRoot, mode === "formal"
      ? { PATH: Bun.env.PATH ?? "", ...containerEnvironment(key, sandbox!) }
      : { PATH: Bun.env.PATH ?? "", DEEPSEEK_API_KEY: key }, Number(execution.max_duration_ms), mode === "local-direct" ? () => removeLocalContainer(runId) : undefined);
    await writeFile(join(runRoot, "pi.stdout.log"), pi.stdout); await writeFile(join(runRoot, "pi.stderr.log"), pi.stderr);
    const evaluator = pi.exit_code === 0 && !pi.timed_out ? await runProcess([process.execPath, "test", joinPath(workspaceRoot, task.candidate, "private", "evaluator")], workspaceRoot, { ...Bun.env, CANDIDATE_PATH: join(workspace, task.candidate_entrypoint) }, Number(execution.max_duration_ms)) : undefined;
    if (evaluator) { await writeFile(join(runRoot, "evaluator.stdout.log"), evaluator.stdout); await writeFile(join(runRoot, "evaluator.stderr.log"), evaluator.stderr); }
    const diff = await runProcess(["git", "diff", "--no-index", "--", joinPath(workspaceRoot, task.candidate, "public", "starter"), join(workspace, "starter")], workspaceRoot, Bun.env, 30000);
    await writeFile(join(runRoot, "candidate.diff"), `${diff.stdout}${diff.stderr}`);
    const treatmentHash = treatment ? await sha256Text(treatment) : await sha256Text("");
    const record = { kind: "scratch-only-exploratory-run", run_id: runId, task: { candidate: task.candidate, snapshot_sha256: task.task_snapshot_sha256, profile: task.profile, profile_sha256: task.profile_sha256 }, condition, repeat, treatment_content_sha256: treatmentHash, model_alias: execution.model_alias, pi_version: execution.pi_version, execution_mode: mode === "local-direct" ? "local-direct-docker" : "formal", network_boundary: mode === "local-direct" ? "direct-egress-non-formal" : "formal-allowlist-sandbox", local_image: localImage ?? null, started_at_utc: startedAt, completed_at_utc: new Date().toISOString(), system_prompt_sha256: execution.system_prompt_sha256, tool_policy_sha256: execution.tool_policy_sha256, budget: { max_turns: execution.max_turns, max_duration_ms: execution.max_duration_ms }, pi: { exit_code: pi.exit_code, timed_out: pi.timed_out, stdout: "pi.stdout.log", stderr: "pi.stderr.log" }, evaluator: evaluator ? { exit_code: evaluator.exit_code, timed_out: evaluator.timed_out, stdout: "evaluator.stdout.log", stderr: "evaluator.stderr.log" } : null, output: "pi.stdout.log", diff: "candidate.diff" };
    await writeFile(join(runRoot, "scratch-run.json"), `${JSON.stringify(record, null, 2)}\n`);
    summary.push({ run_id: runId, condition, repeat, execution_mode: mode, pi_exit_code: pi.exit_code, evaluator_exit_code: evaluator?.exit_code ?? null, scratch_directory: relativePath(runRoot) });
  }
  await writeFile(join(scratchRoot, "summary.json"), `${JSON.stringify({ kind: "scratch-only-exploratory-summary", execution_count: summary.length, runs: summary }, null, 2)}\n`);
  console.log(`Completed ${summary.length} scratch-only exploratory executions in ${relativePath(scratchRoot)}`);
}

const [action = "preflight", ...argumentsList] = Bun.argv.slice(2);
const authIndex = argumentsList.indexOf("--auth-file");
const authFile = authIndex === -1 ? undefined : argumentsList[authIndex + 1];
const modeIndex = argumentsList.indexOf("--mode");
const mode = modeIndex === -1 ? "formal" : argumentsList[modeIndex + 1];
const selectedRunIds = new Set(argumentsList.flatMap((argument, index) => argument === "--run-id" ? [argumentsList[index + 1]] : []).filter((value): value is string => Boolean(value)));
if (argumentsList.some((argument, index) => argument === "--run-id" && !argumentsList[index + 1])) fail("Missing value for --run-id");
if (!(["preflight", "execute"] as string[]).includes(action) || (authIndex !== -1 && !authFile) || (modeIndex !== -1 && !mode) || !["formal", "local-direct"].includes(mode)) fail("Usage: bun run exploratory:practice -- preflight | execute [--mode formal|local-direct] [--auth-file /path/to/auth.json]");
const plan = await readPlan();
const treatments = await verifyPlan(plan);
if (action === "preflight") console.log("Exploratory plan preflight passed for " + mode + ": six candidate snapshots, private treatments, public isolation, hashes, and fixed execution envelope verified.");
else {
  const knownRunIds = plannedRunIds(plan);
  for (const runId of selectedRunIds) if (!knownRunIds.has(runId)) fail(`Unknown planned run ID: ${runId}`);
  await execute(plan, treatments, authFile, mode as "formal" | "local-direct", selectedRunIds);
}
