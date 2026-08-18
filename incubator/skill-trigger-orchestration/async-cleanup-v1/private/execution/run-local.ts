import { cp, mkdir, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { generateUnifiedDiff } from "./unified-diff";

type PracticeReference = { path: string; sha256: string };
type Condition = { id: string; status: string; channel: string; practice: PracticeReference | "none" };
type Conditions = {
  candidate_snapshot_manifest: string;
  shared_execution: {
    pi_version: string;
    model: { id: string };
    budget: { max_duration_minutes: number };
    repetitions: number;
  };
  conditions: Condition[];
};
type Options = { dryRun: boolean; skipInstall: boolean; repeat?: number; outputPath: string };
type CommandResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number };
type AuditEvent = Record<string, unknown> & { event: string };

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
  let outputPath = requireScratchPath(`scratch/skill-trigger-local/${timestamp()}`);
  let repeat: number | undefined;
  let dryRun = false;
  let skipInstall = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (argument === "--skip-install") { skipInstall = true; continue; }
    if (argument === "--repeat") {
      const value = Number(args[++index]);
      if (!Number.isInteger(value) || value < 1) fail("--repeat must be a positive integer");
      repeat = value; continue;
    }
    if (argument === "--output") {
      const value = args[++index];
      if (!value) fail("--output requires a directory");
      outputPath = requireScratchPath(value); continue;
    }
    fail(`Unknown option: ${argument}`);
  }
  return { dryRun, skipInstall, repeat, outputPath };
}

async function run(command: string[], cwd: string, timeoutMs?: number, env = Bun.env): Promise<CommandResult> {
  const started = performance.now();
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = timeoutMs === undefined ? undefined : setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ]);
  if (timeout) clearTimeout(timeout);
  return { code, stdout, stderr, timedOut, durationMs: Math.round(performance.now() - started) };
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
    if (condition.id === "baseline") {
      if (condition.channel !== "none") fail(`Condition ${condition.id} channel must be none`);
      if (condition.practice !== "none") fail(`Condition ${condition.id} practice must be none`);
      continue;
    }
    if (condition.channel !== "mock-retrieval-tool-call") {
      fail(`Condition ${condition.id} uses an unsupported channel: ${condition.channel}`);
    }
    if (!condition.practice || typeof condition.practice !== "object") fail(`Condition ${condition.id} has no usable Practice`);
    const practicePath = resolve(candidateRoot, condition.practice.path);
    if (!practicePath.startsWith(resolve(candidateRoot, "private/practices/"))) fail(`Condition ${condition.id} Practice path is outside private/practices/`);
    if (await hashFile(practicePath) !== condition.practice.sha256) fail(`Condition ${condition.id} Practice hash does not match`);
  }
  return document;
}

async function verifySnapshot(): Promise<void> {
  const result = await run([
    process.execPath, "run",
    resolve(repositoryRoot, "src/benchmark/snapshot.ts"),
    "--incubator", "skill-trigger-orchestration", "async-cleanup-v1"
  ], repositoryRoot);
  if (result.code !== 0) fail(`Candidate snapshot verification failed: ${(result.stderr || result.stdout).trim()}`);
}

function plannedConditions(conditions: Conditions): Condition[] {
  const declared = conditions.conditions.filter((condition) => condition.status === "declared");
  const ids = declared.map((condition) => condition.id);
  for (const required of ["baseline", "lorelum-retrieval", "irrelevant-practice"]) {
    if (!ids.includes(required)) fail(`Missing declared condition: ${required}`);
  }
  if (ids.includes("oracle-practice")) fail("oracle-practice must not be declared (no ceiling)");
  return declared;
}

async function copyPublicWorkspace(workspace: string): Promise<void> {
  await mkdir(workspace, { recursive: true });
  await Bun.write(resolve(workspace, "task.md"), await Bun.file(resolve(candidateRoot, "public/task.md")).text());
  const generatedDirectories = new Set(["node_modules", "dist", "test-results", "playwright-report"]);
  await cp(resolve(candidateRoot, "public/starter/app"), resolve(workspace, "app"), {
    recursive: true,
    errorOnExist: true,
    filter: (source) => !generatedDirectories.has(basename(source))
  });
}

async function workspaceFiles(workspace: string): Promise<string[]> {
  const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: workspace, onlyFiles: true }));
  return entries.map((entry) => entry.split(sep).join("/")).sort();
}

function evaluatorResult(stdout: string): { semantic: string; practiceProbe: string; dualPass: boolean } | undefined {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { semantic?: unknown; practice_probe?: unknown };
      if (typeof value.semantic === "string" && typeof value.practice_probe === "string") {
        return { semantic: value.semantic, practiceProbe: value.practice_probe, dualPass: value.semantic === "pass" && value.practice_probe === "pass" };
      }
    } catch { }
  }
  return undefined;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function usableCommand(path: string): Promise<string | undefined> {
  try { return (await stat(path)).size > 0 ? path : undefined; } catch { return undefined; }
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
  if (result.timedOut) return "model unreachable: preflight timed out after 60s";
  if (/api[_-]?key|unauthorized|401|invalid api key/i.test(stderr)) return "model unreachable: API key missing or invalid";
  if (/connection|refused|unreachable|network|timeout|ENOTFOUND|ECONNREFUSED/i.test(stderr)) return "model unreachable: endpoint not reachable";
  if (/model|not found|invalid/i.test(stderr)) return "model unreachable: model id invalid or unknown";
  return `model unreachable: ${redactSecrets(stderr).trim() || "unknown error"}`;
}

async function preflightModel(command: string, modelId: string): Promise<void> {
  const result = await run([command, "--print", "--no-session", "--model", modelId, "--thinking", "off", "ok"], repositoryRoot, preflightTimeoutMs);
  if (result.code !== 0) fail(classifyPreflightFailure(result));
}

async function readAudit(path: string): Promise<AuditEvent[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const events: AuditEvent[] = [];
  for (const line of (await file.text()).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as AuditEvent;
    if (typeof event.event === "string") events.push(event);
  }
  return events;
}

function observedTrace(condition: Condition, events: AuditEvent[]): Record<string, unknown> {
  const names = events.map((event) => event.event);
  const required = ["public_input_read", "skill_discovered", "skill_loaded", "practice_query_issued", "practice_query_resolved"];
  const complete = condition.id !== "baseline" && required.every((event) => names.includes(event));
  return { condition_id: condition.id, channel: condition.id === "baseline" ? "none" : "mock-retrieval-tool-call", events, complete };
}

async function runAttempt(
  outputPath: string,
  condition: Condition,
  attempt: number,
  conditions: Conditions,
  command: string,
  skipInstall: boolean
): Promise<Record<string, unknown>> {
  const attemptPath = resolve(outputPath, condition.id, `attempt-${attempt}`);
  const workspace = resolve(attemptPath, "workspace");
  await mkdir(attemptPath, { recursive: true });
  await copyPublicWorkspace(workspace);
  const initialFiles = await workspaceFiles(workspace);
  if (initialFiles.some((file) => file.includes("private/") || file.includes("practices/"))) fail("Private material was copied into an agent workspace");

  const piArgs = [
    "--print", "--no-session", "--no-context-files", "--no-extensions",
    "--no-skills", "--no-prompt-templates",
    "--tools", "read,bash,edit,write,grep,find,ls,skills_list,skills_load,lorelum_query",
    "--model", conditions.shared_execution.model.id,
    "--thinking", "off",
    "@task.md", "Complete the coding task. Work only inside app/."
  ];

  const auditPath = resolve(attemptPath, "lorelum-audit.jsonl");
  let piEnvironment = Bun.env;
  if (condition.id !== "baseline") {
    if (condition.practice === "none" || typeof condition.practice !== "object") fail(`Condition ${condition.id} requires a Practice reference`);
    piArgs.push("--extension", resolve(candidateRoot, "private/execution/lorelum-extension.ts"));
    piEnvironment = {
      ...Bun.env,
      LORELUM_MOCK_CONDITION: condition.id,
      LORELUM_MOCK_PRACTICE_PATH: resolve(candidateRoot, condition.practice.path),
      LORELUM_MOCK_PRACTICE_SHA256: condition.practice.sha256,
      LORELUM_MOCK_AUDIT_PATH: auditPath,
    };
  }

  const pi = await run([command, ...piArgs], workspace, conditions.shared_execution.budget.max_duration_minutes * 60_000, piEnvironment);
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  let evaluation: { semantic: string; practiceProbe: string; dualPass: boolean } | undefined;
  let evaluator: CommandResult | undefined;
  if (pi.code === 0 && !pi.timedOut) {
    if (!skipInstall) {
      const install = await run([process.execPath, "install"], resolve(workspace, "app"), 120_000);
    await Bun.write(resolve(attemptPath, "install.stdout.log"), install.stdout);
      await Bun.write(resolve(attemptPath, "install.stderr.log"), install.stderr);
    }
    evaluator = await run([process.execPath, "run", resolve(candidateRoot, "private/evaluator/evaluate.ts"), resolve(workspace, "app")], candidateRoot);
    await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluator.stdout);
    await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluator.stderr);
    evaluation = evaluatorResult(evaluator.stdout);
  }

  const diffOutput = await generateUnifiedDiff(resolve(candidateRoot, "public/starter/app"), resolve(workspace, "app"));
  await Bun.write(resolve(attemptPath, "candidate.diff"), diffOutput);

  const trace = observedTrace(condition, await readAudit(auditPath));

  return {
    condition: condition.id,
    attempt,
    practice_sha256: typeof condition.practice === "object" ? condition.practice.sha256 : null,
    workspace: relativeToRepository(workspace),
    initial_workspace_files: initialFiles,
    pi: { code: pi.code, timed_out: pi.timedOut, duration_ms: pi.durationMs },
    evaluator: evaluator ? { code: evaluator.code, duration_ms: evaluator.durationMs } : null,
    semantic: evaluation?.semantic ?? "not-run",
    practice_probe: evaluation?.practiceProbe ?? "not-run",
    dual_pass: evaluation?.dualPass ?? false,
    trace,
    output: relativeToRepository(attemptPath)
  };
}

function outcome(entries: Record<string, unknown>[], repetitions: number): "signal" | "no-obvious-signal" {
  const byCondition = new Map<string, Record<string, unknown>[]>();
  for (const entry of entries) {
    if (typeof entry.condition !== "string") continue;
    byCondition.set(entry.condition, [...(byCondition.get(entry.condition) ?? []), entry]);
  }
  const every = (condition: string, predicate: (entry: Record<string, unknown>) => boolean) => {
    const values = byCondition.get(condition) ?? [];
    return values.length === repetitions && values.every(predicate);
  };
  const treatmentPasses = every("lorelum-retrieval", (entry) => entry.dual_pass === true && (entry.trace as { complete?: unknown } | undefined)?.complete === true);
  const baselineFailsQuality = every("baseline", (entry) => entry.semantic === "pass" && entry.practice_probe === "fail");
  const irrelevantFailsQuality = every("irrelevant-practice", (entry) => entry.semantic === "pass" && entry.practice_probe === "fail");
  return treatmentPasses && baselineFailsQuality && irrelevantFailsQuality ? "signal" : "no-obvious-signal";
}

const options = parseOptions();
const conditions = await loadConditions();
await verifySnapshot();
const runnable = plannedConditions(conditions);
const repeat = options.repeat ?? conditions.shared_execution.repetitions;
const planned = runnable.flatMap((condition) => Array.from({ length: repeat }, (_, index) => ({ condition: condition.id, attempt: index + 1 })));

if (options.dryRun) {
  console.log(JSON.stringify({
    schema_version: "skill-trigger-local-plan/v1",
    planned_runs: planned,
    workspace_template: ["task.md", "app/**"],
    output: relativeToRepository(options.outputPath)
  }, null, 2));
  process.exit(0);
}

await mkdir(options.outputPath, { recursive: true });
const command = await piCommand();
const version = await run([command, "--version"], repositoryRoot);
if (version.code !== 0) fail(`Unable to start Pi command ${command}: ${(version.stderr || version.stdout).trim()}`);
await preflightModel(command, conditions.shared_execution.model.id);

const entries: Record<string, unknown>[] = [];
for (const condition of runnable) {
  for (let attempt = 1; attempt <= repeat; attempt += 1) {
    const entry = await runAttempt(options.outputPath, condition, attempt, conditions, command, options.skipInstall);
    entries.push(entry);
    await writeJson(resolve(options.outputPath, "summary.json"), {
      schema_version: "skill-trigger-local-summary/v1",
      generated_at: new Date().toISOString(),
      pi_version: version.stdout.trim(),
      model: conditions.shared_execution.model.id,
      planned_runs: planned.length,
      decision_rule: "lorelum-passes-and-irrelevant-fails",
      outcome: outcome(entries, repeat),
      entries
    });
  }
}

console.log(JSON.stringify({ output: relativeToRepository(options.outputPath), outcome: outcome(entries, repeat), entries }, null, 2));
