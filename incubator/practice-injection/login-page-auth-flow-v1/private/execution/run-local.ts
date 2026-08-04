import { cp, mkdir, stat } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { generateUnifiedDiff } from "./unified-diff";
import { frozenPlan, TASK_PROMPT } from "./plan";
import { sha256Text } from "../../../../../src/benchmark/fs";
import { runJudge } from "./judge";
import type { JudgeAttemptOutcome } from "./judge";

type Practice = { path: string; injection_channel: string; sha256: string };
type Condition = { id: string; status: string; practice: Practice | "none" | "unavailable" };
type Conditions = {
  source_commit: string;
  candidate_snapshot_manifest: string;
  shared_execution: {
    pi_version: string;
    model: { id: string };
    budget: { max_duration_minutes: number };
    repetitions: number;
  };
  conditions: Condition[];
};
type Options = { dryRun: boolean; preflightOnly: boolean; repeat?: number; outputPath: string };
type CommandResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; stalled?: boolean; durationMs: number };

const candidateRoot = resolve(import.meta.dir, "../..");
const repositoryRoot = resolve(candidateRoot, "../../..");
const scratchRoot = resolve(repositoryRoot, "scratch");

function fail(message: string): never { throw new Error(message); }

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[:.]/g, "-");
}

function relativeToRepository(path: string): string {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function requireScratchPath(path: string): string {
  const resolved = resolve(repositoryRoot, path);
  const fromScratch = relative(scratchRoot, resolved);
  if (fromScratch === "" || fromScratch.startsWith("..") || isAbsolute(fromScratch)) {
    fail("Local output must stay inside ignored scratch/");
  }
  return resolved;
}

function parseOptions(): Options {
  const args = Bun.argv.slice(2);
  let outputPath = requireScratchPath(`scratch/login-page-auth-flow-pilot/${timestamp()}`);
  let repeat: number | undefined;
  let dryRun = false;
  let preflightOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (argument === "--preflight-only") { preflightOnly = true; continue; }
    if (argument === "--repeat") {
      const value = Number(args[++index]);
      if (!Number.isInteger(value) || value < 1) fail("--repeat must be a positive integer");
      repeat = value;
      continue;
    }
    if (argument === "--output") {
      const value = args[++index];
      if (!value) fail("--output requires a directory");
      outputPath = requireScratchPath(value);
      continue;
    }
    fail(`Unknown option: ${argument}`);
  }
  return { dryRun, preflightOnly, repeat, outputPath };
}

async function run(command: string[], cwd: string, options: { timeoutMs?: number; stallMs?: number; env?: Record<string, string> } = {}): Promise<CommandResult> {
  const started = Date.now();
  const child = Bun.spawn(command, { cwd, env: { ...Bun.env, ...options.env }, stdout: "pipe", stderr: "pipe" });
  const exitPromise = child.exited;
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  let lastOutput = Date.now();
  let timedOut = false;
  let stalled = false;
  let code: number | null = null;

  const pump = async (stream: ReadableStream<Uint8Array> | null, target: string[]) => {
    if (!stream) return;
    try {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        target.push(decoder.decode(value, { stream: true }));
        lastOutput = Date.now();
      }
    } catch {
      // stream closed or errored
    }
  };
  const outPump = pump(child.stdout, outChunks);
  const errPump = pump(child.stderr, errChunks);

  const killTree = () => {
    // Fire-and-forget so the watchdog never blocks on the kill (taskkill can
    // be slow on Windows; blocking here would stall the whole pilot).
    try {
      if (process.platform === "win32") {
        Bun.spawn([`${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\taskkill.exe`, "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
        child.kill("SIGKILL").catch(() => {});
      } else {
        child.kill("SIGKILL").catch(() => {});
      }
    } catch {
      // best-effort
    }
  };

  // Watchdog: stop when the child exits, or fire (and kill the tree) when the
  // per-command budget is exhausted or the child stops producing output for
  // stallMs. This keeps the pilot self-bounded without manual termination.
  const watchdogPromise = (async () => {
    for (;;) {
      const outcome = await Promise.race([
        exitPromise.then(() => "exit"),
        new Promise<string>((resolvePromise) => setTimeout(() => resolvePromise("tick"), 250)),
      ]);
      if (outcome === "exit") return;
      const elapsed = Date.now() - started;
      if (options.timeoutMs !== undefined && elapsed >= options.timeoutMs) {
        timedOut = true;
        killTree();
        return;
      }
      if (options.stallMs !== undefined && Date.now() - lastOutput > options.stallMs) {
        stalled = true;
        killTree();
        return;
      }
    }
  })();

  const finished = await Promise.race([
    exitPromise.then((exitCode) => ({ kind: "exit" as const, code: exitCode })),
    watchdogPromise.then(() => ({ kind: "watchdog" as const })),
  ]);
  if (finished.kind === "exit") {
    code = finished.code;
  } else {
    // Watchdog fired: give the killed tree a short grace to die, then return
    // regardless so the pilot never blocks on a stuck child.
    const grace = await Promise.race([
      exitPromise.then((exitCode) => ({ died: true as const, code: exitCode })),
      new Promise<{ died: false }>((resolvePromise) => setTimeout(() => resolvePromise({ died: false }), 2000)),
    ]);
    if (grace.died) code = grace.code;
  }
  // Bound the pump wait: if the killed child's process tree survives, its
  // stdout pipe may never close; do not block the pilot on it.
  await Promise.race([
    Promise.all([outPump, errPump]),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2000)),
  ]);
  return {
    code,
    stdout: outChunks.join(""),
    stderr: errChunks.join(""),
    timedOut,
    ...(stalled ? { stalled: true } : {}),
    durationMs: Math.round(Date.now() - started),
  };
}
async function hashFile(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadConditions(): Promise<Conditions> {
  const document = Bun.YAML.parse(await Bun.file(resolve(candidateRoot, "private/conditions.yaml")).text()) as Conditions;
  if (!document?.shared_execution || !Array.isArray(document.conditions)) fail("private/conditions.yaml is invalid");
  if (!Number.isInteger(document.shared_execution.repetitions) || document.shared_execution.repetitions < 1) {
    fail("conditions.yaml must declare a positive repetition count");
  }
  if (!Number.isInteger(document.shared_execution.budget.max_duration_minutes) || document.shared_execution.budget.max_duration_minutes < 1) {
    fail("conditions.yaml must declare a positive duration budget");
  }
  for (const condition of document.conditions.filter((item) => item.status === "declared")) {
    if (condition.practice === "none") continue;
    if (!condition.practice || typeof condition.practice !== "object") fail(`Condition ${condition.id} has no usable Practice`);
    if (condition.practice.injection_channel !== "condition-scoped-private-runtime") {
      fail(`Condition ${condition.id} uses an unsupported Practice channel`);
    }
    const practicePath = resolve(candidateRoot, condition.practice.path);
    if (!practicePath.startsWith(resolve(candidateRoot, "private/practices/"))) fail(`Condition ${condition.id} Practice path is outside private/practices/`);
    if (await hashFile(practicePath) !== condition.practice.sha256) fail(`Condition ${condition.id} Practice hash does not match`);
  }
  return document;
}

async function verifySnapshot(): Promise<void> {
  const result = await run([
    process.execPath,
    "run",
    resolve(repositoryRoot, "src/benchmark/snapshot.ts"),
    "--incubator",
    "practice-injection",
    "login-page-auth-flow-v1",
  ], repositoryRoot, { timeoutMs: 120_000 });
  if (result.code !== 0) fail(`Candidate snapshot verification failed: ${(result.stderr || result.stdout).trim()}`);
}

function plannedConditions(conditions: Conditions): Condition[] {
  const declared = conditions.conditions.filter((condition) => condition.status === "declared");
  const ids = declared.map((condition) => condition.id);
  for (const required of ["baseline", "oracle-practice", "irrelevant-practice"]) {
    if (!ids.includes(required)) fail(`Missing declared condition: ${required}`);
  }
  return declared;
}

async function copyPublicWorkspace(workspace: string): Promise<void> {
  await mkdir(workspace, { recursive: true });
  await Bun.write(resolve(workspace, "task.md"), await Bun.file(resolve(candidateRoot, "public/task.md")).text());
  const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report", ".vite"]);
  await cp(resolve(candidateRoot, "public/starter/app"), resolve(workspace, "app"), {
    recursive: true,
    errorOnExist: true,
    filter: (source) => !generatedDirectories.has(basename(source)),
  });
}

async function workspaceFiles(workspace: string): Promise<string[]> {
  const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: workspace, onlyFiles: true }));
  return entries.map((entry) => entry.split(sep).join("/")).sort();
}

async function ensureDependencies(appPath: string): Promise<void> {
  const typescript = resolve(appPath, "node_modules", "typescript", "lib", "typescript.js");
  try {
    if ((await stat(typescript)).size > 0) return;
  } catch {
    // fall through to install
  }
  if (await run(["bun", "install", "--frozen-lockfile"], appPath, { timeoutMs: 300_000 }).then((result) => result.code) !== 0) {
    fail(`Unable to install locked dependencies for ${relativeToRepository(appPath)}`);
  }
}

function evaluatorResult(stdout: string): { semantic: string; practiceObservation: string; dualPass: boolean } | undefined {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { semantic?: unknown; practice_observation?: unknown };
      if (typeof value.semantic === "string" && typeof value.practice_observation === "string") {
        return {
          semantic: value.semantic,
          practiceObservation: value.practice_observation,
          dualPass: value.semantic === "pass" && value.practice_observation === "observed",
        };
      }
    } catch {
      // The evaluator may print diagnostics before its final result.
    }
  }
  return undefined;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function usableCommand(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).size > 0 ? path : undefined;
  } catch {
    return undefined;
  }
}

async function piCommand(): Promise<string> {
  const configured = Bun.env.LORELUM_PI_COMMAND;
  if (configured) return configured;
  const names = process.platform === "win32" ? ["pi.exe", "pi.cmd", "pi"] : ["pi"];
  for (const name of names) {
    const command = await usableCommand(resolve(repositoryRoot, "node_modules/.bin", name));
    if (command) return command;
  }
  return "pi";
}

const preflightTimeoutMs = 60_000;

function redactSecrets(text: string): string {
  return text
    .replace(/(?:sk-|api[_-]?key["']?\s*[:=]\s*["']?|bearer\s+)[A-Za-z0-9._~+/\-]{8,}={0,2}/gi, "<redacted>")
    .replace(/\b[A-Za-z0-9_\-]{20,}\b/g, "<redacted>");
}

function classifyPreflightFailure(result: CommandResult): string {
  const stderr = result.stderr || result.stdout;
  if (result.timedOut) return "model unreachable: preflight timed out after 30s";
  if (/api[_-]?key|unauthorized|401|invalid api key/i.test(stderr)) return "model unreachable: API key missing or invalid";
  if (/connection|refused|unreachable|network|timeout|ENOTFOUND|ECONNREFUSED/i.test(stderr)) return "model unreachable: endpoint not reachable";
  if (/model|not found|invalid/i.test(stderr)) return "model unreachable: model id invalid or unknown";
  return `model unreachable: ${redactSecrets(stderr).trim() || "unknown error"}`;
}

async function preflightModel(command: string, modelId: string): Promise<void> {
  // Model API latency is variable; retry before failing so a single slow
  // response does not block the whole pilot.
  let lastFailure = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await run([command, "--print", "--no-session", "--model", modelId, "ok"], repositoryRoot, { timeoutMs: preflightTimeoutMs });
    if (result.code === 0 && !result.timedOut) return;
    lastFailure = classifyPreflightFailure(result);
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  fail(lastFailure);
}

type ViteDevServer = {
  middlewares: (request: IncomingMessage, response: ServerResponse) => void;
  close: () => Promise<void>;
};

async function startDevServer(appPath: string): Promise<{ baseUrl: string; kill: () => Promise<void> }> {
  const viteModulePath = pathToFileURL(join(appPath, "node_modules", "vite", "dist", "node", "index.js")).href;
  const { createServer } = await import(viteModulePath) as {
    createServer: (options: { root: string; server: { host: string; hmr: false; middlewareMode: { server: Server } } }) => Promise<ViteDevServer>;
  };
  const httpServer = createHttpServer();
  const server = await createServer({ root: appPath, server: { host: "127.0.0.1", hmr: false, middlewareMode: { server: httpServer } } });
  httpServer.on("request", server.middlewares);
  try {
    await new Promise<void>((resolvePromise, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => {
        httpServer.removeListener("error", reject);
        resolvePromise();
      });
    });
    const address = httpServer.address();
    if (typeof address !== "object" || address === null || typeof address.port !== "number") {
      throw new Error("Dev server did not yield a valid local port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Dev server returned ${response.status} at ${baseUrl}`);
    return {
      baseUrl,
      kill: async () => {
        await server.close();
        if (httpServer.listening) await new Promise<void>((resolvePromise, reject) => httpServer.close((error) => error ? reject(error) : resolvePromise()));
      },
    };
  } catch (error) {
    await server.close().catch(() => {});
    if (httpServer.listening) await new Promise<void>((resolvePromise) => httpServer.close(() => resolvePromise()));
    throw error;
  }
}

async function runAttempt(
  outputPath: string,
  condition: Condition,
  label: string,
  conditions: Conditions,
  command: string,
  taskMd: string,
): Promise<Record<string, unknown>> {
  const attemptPath = resolve(outputPath, condition.id, label);
  const workspace = resolve(attemptPath, "workspace");
  await mkdir(attemptPath, { recursive: true });
  await copyPublicWorkspace(workspace);
  const initialFiles = await workspaceFiles(workspace);
  if (initialFiles.some((file) => file.includes("private/") || file.includes("practices/") || file.includes("oracle"))) fail("Private material was copied into an agent workspace");

  const practice = typeof condition.practice === "object" ? condition.practice : undefined;
  const piArgs = [
    "--print",
    "--no-session",
    "--no-context-files",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--tools",
    "read,bash,edit,write,grep,find,ls",
    "--model",
    conditions.shared_execution.model.id,
    "@task.md",
    TASK_PROMPT,
  ];
  if (practice) {
    piArgs.push("--append-system-prompt", `Apply this Practice while completing the task:\n\n${await Bun.file(resolve(candidateRoot, practice.path)).text()}`);
  }

  // pi.exe buffers its stdout until exit, so pipe-based stall detection cannot
  // observe live model progress and would kill working runs; rely on the
  // per-attempt budget and the global cap to bound the pilot instead.
  const pi = await run([command, ...piArgs], workspace, { timeoutMs: conditions.shared_execution.budget.max_duration_minutes * 60_000 });
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  let evaluation: { semantic: string; practiceObservation: string; dualPass: boolean } | undefined;
  let evaluator: CommandResult | undefined;
  let judgeOutcome: JudgeAttemptOutcome | undefined;
  if (pi.code === 0 && !pi.timedOut) {
    try {
      await ensureDependencies(resolve(workspace, "app"));
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    const appPath = resolve(workspace, "app");
    const server = await startDevServer(appPath);
    try {
      evaluator = await run([process.execPath, "run", resolve(candidateRoot, "private/evaluator/evaluate.ts"), appPath], candidateRoot, { timeoutMs: 300_000, env: { PLAYWRIGHT_BASE_URL: server.baseUrl } });
    } finally {
      await server.kill();
    }
    await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluator.stdout);
    await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluator.stderr);
    evaluation = evaluatorResult(evaluator.stdout);
    judgeOutcome = await runJudge(resolve(workspace, "app"), taskMd, 3);
    await writeJson(resolve(attemptPath, "judge.sidecar.json"), {
      state: judgeOutcome.state,
      ...(judgeOutcome.sidecar ? { sidecar: judgeOutcome.sidecar } : {}),
      ...(judgeOutcome.reason ? { reason: judgeOutcome.reason } : {}),
      report: judgeOutcome.report,
      hashes: judgeOutcome.hashes,
      judge: judgeOutcome.judge,
    });
  }

  const diffOutput = await generateUnifiedDiff(
    resolve(candidateRoot, "public/starter/app"),
    resolve(workspace, "app"),
  );
  await Bun.write(resolve(attemptPath, "candidate.diff"), diffOutput);

  return {
    condition: condition.id,
    attempt: label,
    practice_sha256: practice?.sha256 ?? null,
    workspace: relativeToRepository(workspace),
    initial_workspace_files: initialFiles,
    pi: { code: pi.code, timed_out: pi.timedOut, stalled: pi.stalled ?? false, duration_ms: pi.durationMs },
    evaluator: evaluator ? { code: evaluator.code, duration_ms: evaluator.durationMs } : null,
    semantic: evaluation?.semantic ?? "not-run",
    practice_observation: evaluation?.practiceObservation ?? "not-run",
    dual_pass: evaluation?.dualPass ?? false,
    judge: judgeOutcome
      ? {
          state: judgeOutcome.state,
          score: judgeOutcome.score,
          confidence: judgeOutcome.confidence,
          criteria: judgeOutcome.criteria.map((criterion) => ({ id: criterion.id, points: criterion.points, max_points: criterion.max_points })),
          report: judgeOutcome.report,
          hashes: judgeOutcome.hashes,
        }
      : null,
    output: relativeToRepository(attemptPath),
  };
}

function outcome(entries: Record<string, unknown>[], repeat: number): "signal" | "no-obvious-signal" | "uncertain" {
  const totals = new Map<string, number>();
  const healthy = new Map<string, number>();
  const judgeHealthy = new Map<string, number>();
  for (const entry of entries) {
    const condition = entry.condition;
    if (typeof condition !== "string") continue;
    totals.set(condition, (totals.get(condition) ?? 0) + (entry.dual_pass === true ? 1 : 0));
    if (entry.semantic !== "not-run") healthy.set(condition, (healthy.get(condition) ?? 0) + 1);
    const judge = entry.judge as { state?: string } | null | undefined;
    if (judge && judge.state !== "judge-unavailable") judgeHealthy.set(condition, (judgeHealthy.get(condition) ?? 0) + 1);
  }
  for (const required of ["baseline", "oracle-practice", "irrelevant-practice"]) {
    if ((healthy.get(required) ?? 0) < repeat) return "uncertain";
    if ((judgeHealthy.get(required) ?? 0) < repeat) return "uncertain";
  }
  const oracle = totals.get("oracle-practice") ?? 0;
  return oracle > (totals.get("baseline") ?? 0) && oracle > (totals.get("irrelevant-practice") ?? 0)
    ? "signal"
    : "no-obvious-signal";
}

export { outcome, evaluatorResult, classifyPreflightFailure, redactSecrets, plannedConditions, loadConditions, verifySnapshot, copyPublicWorkspace, workspaceFiles, parseOptions, startDevServer, run };

export function buildSummary(input: {
  generated_at: string;
  candidate: string;
  source_commit: string;
  snapshot_id: string;
  rubric_hash: string;
  profile: string;
  profile_input_hash: string;
  pi_version: string;
  prompt_hash: string;
  model: string;
  repetitions: number;
  judge: unknown;
  planned_runs: number;
  outcome: string;
  entries: Record<string, unknown>[];
}): Record<string, unknown> {
  return { schema_version: "login-page-diagnostic-pilot-summary/v1", ...input };
}

const maxAttemptRetries = 2;
const globalCapMs = 40 * 60_000; // whole pilot self-bounds, allowing retries

function isCleanPi(entry: Record<string, unknown>): boolean {
  const pi = entry.pi as { code?: number | null; timed_out?: boolean; stalled?: boolean } | null | undefined;
  return Boolean(pi) && pi.code === 0 && pi.timed_out !== true && pi.stalled !== true;
}

// Retry a timed-out or failed attempt with a fresh workspace so a transient
// slow/stalled model call never leaves a slot without a result. Up to
// maxAttemptRetries extra attempts per slot; the final summary records the
// logical attempt number and the number of retries used.
async function runAttemptWithRetries(
  outputPath: string,
  condition: Condition,
  attempt: number,
  conditions: Conditions,
  command: string,
  taskMd: string,
): Promise<Record<string, unknown>> {
  let entry: Record<string, unknown> | undefined;
  let usedRetries = 0;
  for (let retry = 0; retry <= maxAttemptRetries; retry += 1) {
    const label = retry === 0 ? `attempt-${attempt}` : `attempt-${attempt}-r${retry}`;
    entry = await runAttempt(outputPath, condition, label, conditions, command, taskMd);
    usedRetries = retry;
    if (isCleanPi(entry)) break;
    if (retry < maxAttemptRetries) {
      console.log(`retrying ${condition.id}/${label}: pi code=${String(entry.pi?.code)} timedOut=${String(entry.pi?.timed_out)} stalled=${String(entry.pi?.stalled)}`);
    }
  }
  return { ...(entry ?? {}), attempt, retry_count: usedRetries };
}

export async function main(): Promise<number> {
  const options = parseOptions();
  const planBundle = await frozenPlan();
const conditions = await loadConditions();
await verifySnapshot();
const runnable = plannedConditions(conditions);
const repeat = options.repeat ?? conditions.shared_execution.repetitions;
const planned = runnable.flatMap((condition) => Array.from({ length: repeat }, (_, index) => ({ condition: condition.id, attempt: index + 1 })));
const taskMd = await Bun.file(resolve(candidateRoot, "public/task.md")).text();

if (options.dryRun) {
  console.log(JSON.stringify({
    schema_version: "login-page-diagnostic-pilot-plan/v1",
    candidate: planBundle.plan.candidate,
    source_commit: planBundle.plan.source_commit,
    snapshot_id: planBundle.snapshot_id,
    rubric_hash: planBundle.rubric_hash,
    profile: planBundle.plan.profile,
    profile_input_hash: planBundle.profile_input_hash,
    model: planBundle.plan.model,
    pi_version: planBundle.plan.pi_version,
    prompt_hash: await sha256Text(`${taskMd}\n${TASK_PROMPT}`),
    budget: planBundle.plan.budget,
    repetitions: repeat,
    judge: planBundle.plan.judge,
    planned_runs: planned,
    workspace_template: ["task.md", "app/**"],
    output: relativeToRepository(options.outputPath),
  }, null, 2));
  process.exit(0);
}

await mkdir(options.outputPath, { recursive: true });
const command = await piCommand();
const version = await run([command, "--version"], repositoryRoot);
if (version.code !== 0) fail(`Unable to start Pi command ${command}: ${(version.stderr || version.stdout).trim()}`);
if (version.stdout.trim() !== planBundle.plan.pi_version) {
  fail(`pi version mismatch: expected ${planBundle.plan.pi_version}, received ${version.stdout.trim()}`);
}

await preflightModel(command, conditions.shared_execution.model.id);

console.log(JSON.stringify({
  schema_version: "login-page-diagnostic-pilot-preflight/v1",
  pi_version: version.stdout.trim(),
  prompt_hash: await sha256Text(`${taskMd}\n${TASK_PROMPT}`),
  model: conditions.shared_execution.model.id,
  source_commit: planBundle.plan.source_commit,
  snapshot_id: planBundle.snapshot_id,
  rubric_hash: planBundle.rubric_hash,
  judge_preflight: "ok",
  preflight: "passed",
}, null, 2));

if (options.preflightOnly) process.exit(0);

  const entries: Record<string, unknown>[] = [];
  const pilotStart = Date.now();
  for (const condition of runnable) {
    for (let attempt = 1; attempt <= repeat; attempt += 1) {
      if (Date.now() - pilotStart > globalCapMs) {
        console.log(`global cap ${globalCapMs / 60_000}min reached; marking remaining attempts as not-run`);
        break;
      }
      const entry = await runAttemptWithRetries(options.outputPath, condition, attempt, conditions, command, taskMd);
      entries.push(entry);
      await writeJson(resolve(options.outputPath, "summary.json"), buildSummary({
        generated_at: new Date().toISOString(),
        candidate: planBundle.plan.candidate,
        source_commit: planBundle.plan.source_commit,
        snapshot_id: planBundle.snapshot_id,
        rubric_hash: planBundle.rubric_hash,
        profile: planBundle.plan.profile,
        profile_input_hash: planBundle.profile_input_hash,
        pi_version: version.stdout.trim(),
        prompt_hash: await sha256Text(`${taskMd}\n${TASK_PROMPT}`),
        model: conditions.shared_execution.model.id,
        repetitions: repeat,
        judge: planBundle.plan.judge,
        planned_runs: planned.length,
        outcome: outcome(entries, repeat),
        global_cap_reached: Date.now() - pilotStart > globalCapMs,
        entries,
      }));
    }
  }

  console.log(JSON.stringify({ output: relativeToRepository(options.outputPath), outcome: outcome(entries, repeat),
        global_cap_reached: Date.now() - pilotStart > globalCapMs, entries }, null, 2));
  return 0;
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
