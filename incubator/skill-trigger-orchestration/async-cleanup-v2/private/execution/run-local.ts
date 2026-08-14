import { cp, mkdir, readFile, stat } from "node:fs/promises";
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
type ToolPolicy = {
  pi_runtime?: {
    shell_path?: unknown;
    config_scope?: unknown;
  };
};
type Options = { dryRun: boolean; skipInstall: boolean; qualityPilot: boolean; qualification: boolean; repeat?: number; outputPath: string };
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
  let qualityPilot = false;
  let qualification = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") { dryRun = true; continue; }
    if (argument === "--skip-install") { skipInstall = true; continue; }
    if (argument === "--quality-pilot") { qualityPilot = true; continue; }
    if (argument === "--qualification") { qualification = true; continue; }
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
  if (qualification && qualityPilot) fail("--qualification cannot be combined with --quality-pilot");
  return { dryRun, skipInstall, qualityPilot, qualification, repeat, outputPath };
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

async function loadPiRuntime(): Promise<{ shellPath: string }> {
  const document = Bun.YAML.parse(await Bun.file(resolve(candidateRoot, "private/execution/tool-policy.yaml")).text()) as ToolPolicy;
  const runtime = document?.pi_runtime;
  if (!runtime || runtime.config_scope !== "attempt-private" || typeof runtime.shell_path !== "string" || !runtime.shell_path) {
    fail("tool-policy.yaml must declare an attempt-private pi_runtime.shell_path");
  }
  return { shellPath: runtime.shell_path };
}

async function verifySnapshot(): Promise<void> {
  const result = await run([
    process.execPath, "run",
    resolve(repositoryRoot, "src/benchmark/snapshot.ts"),
    "--incubator", "skill-trigger-orchestration", "async-cleanup-v2"
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

type EvaluatorResult = {
  semantic: string;
  astProbe: string;
  scopeResolveProbe: string;
  scopeRejectProbe: string;
  reloadResolveProbe: string;
  reloadRejectProbe: string;
  backgroundResolveProbe: string;
  backgroundRejectProbe: string;
  practiceProbe: string;
  dualPass: boolean;
};

function evaluatorResult(stdout: string): EvaluatorResult | undefined {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { semantic?: unknown; ast_probe?: unknown; runtime_scope_resolve_probe?: unknown; runtime_scope_reject_probe?: unknown; runtime_reload_resolve_probe?: unknown; runtime_reload_reject_probe?: unknown; runtime_background_resolve_probe?: unknown; runtime_background_reject_probe?: unknown; practice_probe?: unknown };
      if (typeof value.semantic === "string" && typeof value.ast_probe === "string" && typeof value.runtime_scope_resolve_probe === "string" && typeof value.runtime_scope_reject_probe === "string" && typeof value.runtime_reload_resolve_probe === "string" && typeof value.runtime_reload_reject_probe === "string" && typeof value.runtime_background_resolve_probe === "string" && typeof value.runtime_background_reject_probe === "string" && typeof value.practice_probe === "string") {
        return {
          semantic: value.semantic,
          astProbe: value.ast_probe,
          scopeResolveProbe: value.runtime_scope_resolve_probe,
          scopeRejectProbe: value.runtime_scope_reject_probe,
          reloadResolveProbe: value.runtime_reload_resolve_probe,
          reloadRejectProbe: value.runtime_reload_reject_probe,
          backgroundResolveProbe: value.runtime_background_resolve_probe,
          backgroundRejectProbe: value.runtime_background_reject_probe,
          practiceProbe: value.practice_probe,
          dualPass: value.semantic === "pass" && value.practice_probe === "pass"
        };
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

function traceAuditIssues(condition: Condition, events: AuditEvent[]): string[] {
  const names = events.map((event) => event.event);
  if (condition.id === "baseline") return names.length === 0 ? [] : ["baseline emitted retrieval audit events"];
  const issued = new Set(events.filter((event) => event.event === "practice_query_issued" && typeof event.query_id === "string").map((event) => event.query_id as string));
  const resolved = events.filter((event) => event.event === "practice_query_resolved" && typeof event.query_id === "string").map((event) => event.query_id as string);
  const issues: string[] = [];
  if (names.includes("skill_loaded") && !names.includes("skill_discovered")) issues.push("skill_loaded has no discovery event");
  if ((names.includes("practice_query_issued") || names.includes("practice_query_resolved")) && !names.includes("skill_loaded")) issues.push("query event has no load event");
  if (resolved.some((queryId) => !issued.has(queryId))) issues.push("query resolution has no issued event");
  return issues;
}

async function invalidityReasons(
  condition: Condition,
  pi: CommandResult,
  workspaceFilesAfterAgent: string[],
  auditEvents: AuditEvent[],
  trace: Record<string, unknown>
): Promise<string[]> {
  const reasons = traceAuditIssues(condition, auditEvents);
  if (/Extension error\b/i.test(pi.stderr)) reasons.push("extension error in Pi stderr");
  if (workspaceFilesAfterAgent.some((file) => file.includes("private/") || file.includes("practices/"))) reasons.push("agent workspace contains private material");
  const privateRoot = resolve(candidateRoot, "private").replaceAll("\\", "/");
  const visibleText = [pi.stdout, pi.stderr, JSON.stringify(trace), JSON.stringify(auditEvents)].join("\n").replaceAll("\\", "/");
  if (visibleText.includes("private/practices") || visibleText.includes(privateRoot)) reasons.push("execution output contains a private path");
  if (condition.practice !== "none") {
    const card = await readFile(resolve(candidateRoot, condition.practice.path), "utf8");
    if (visibleText.includes(card)) reasons.push("execution output contains Practice card source");
  }
  return reasons;
}

async function runAttempt(
  outputPath: string,
  condition: Condition,
  attempt: number,
  conditions: Conditions,
  piRuntime: { shellPath: string },
  command: string,
  skipInstall: boolean,
  evaluate: boolean
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
  const piAgentDirectory = resolve(attemptPath, "pi-agent");
  await mkdir(piAgentDirectory, { recursive: true });
  await writeJson(resolve(piAgentDirectory, "settings.json"), { shellPath: piRuntime.shellPath });
  let piEnvironment = { ...Bun.env, PI_CODING_AGENT_DIR: piAgentDirectory };
  if (condition.id !== "baseline") {
    if (condition.practice === "none" || typeof condition.practice !== "object") fail(`Condition ${condition.id} requires a Practice reference`);
    piArgs.push("--extension", resolve(candidateRoot, "private/execution/lorelum-extension.ts"));
    piEnvironment = {
      ...piEnvironment,
      LORELUM_MOCK_CONDITION: condition.id,
      LORELUM_MOCK_PRACTICE_PATH: resolve(candidateRoot, condition.practice.path),
      LORELUM_MOCK_PRACTICE_SHA256: condition.practice.sha256,
      LORELUM_MOCK_AUDIT_PATH: auditPath,
    };
  }

  const pi = await run([command, ...piArgs], workspace, conditions.shared_execution.budget.max_duration_minutes * 60_000, piEnvironment);
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  const workspaceFilesAfterAgent = await workspaceFiles(workspace);
  let evaluation: EvaluatorResult | undefined;
  let evaluator: CommandResult | undefined;
  if (evaluate && pi.code === 0 && !pi.timedOut) {
    if (!skipInstall) {
      const install = await run([process.execPath, "install"], resolve(workspace, "app"), 120_000);
    await Bun.write(resolve(attemptPath, "install.stdout.log"), install.stdout);
      await Bun.write(resolve(attemptPath, "install.stderr.log"), install.stderr);
    }
    evaluator = await run([process.execPath, "run", resolve(candidateRoot, "private/evaluator/evaluate-operation-authority.ts"), resolve(workspace, "app")], candidateRoot);
    await Bun.write(resolve(attemptPath, "evaluator.stdout.log"), evaluator.stdout);
    await Bun.write(resolve(attemptPath, "evaluator.stderr.log"), evaluator.stderr);
    evaluation = evaluatorResult(evaluator.stdout);
  }

  const diffOutput = await generateUnifiedDiff(resolve(candidateRoot, "public/starter/app"), resolve(workspace, "app"));
  await Bun.write(resolve(attemptPath, "candidate.diff"), diffOutput);

  const auditEvents = await readAudit(auditPath);
  const trace = observedTrace(condition, auditEvents);
  await writeJson(resolve(attemptPath, "trace.json"), trace);
  const invalidReasons = await invalidityReasons(condition, pi, workspaceFilesAfterAgent, auditEvents, trace);
  const valid = invalidReasons.length === 0;
  const completeTrace = (trace as { complete?: unknown }).complete === true;
  const traceEvents = (trace as { events: AuditEvent[] }).events;
  const discovered = traceEvents.some((event) => event.event === "skill_discovered");
  const queryAnchored = traceEvents.some((event) => event.event === "practice_query_issued" && Array.isArray(event.public_refs) && event.public_refs.length > 0);

  return {
    condition: condition.id,
    attempt,
    practice_sha256: typeof condition.practice === "object" ? condition.practice.sha256 : null,
    workspace: relativeToRepository(workspace),
    pi_runtime: { config_scope: "attempt-private", shell_path: piRuntime.shellPath },
    initial_workspace_files: initialFiles,
    agent_workspace_files: workspaceFilesAfterAgent,
    pi: { code: pi.code, timed_out: pi.timedOut, duration_ms: pi.durationMs },
    evaluator: evaluator ? { code: evaluator.code, duration_ms: evaluator.durationMs } : null,
    semantic: evaluation?.semantic ?? "not-run",
    ast_probe: evaluation?.astProbe ?? "not-run",
    runtime_scope_resolve_probe: evaluation?.scopeResolveProbe ?? "not-run",
    runtime_scope_reject_probe: evaluation?.scopeRejectProbe ?? "not-run",
    runtime_reload_resolve_probe: evaluation?.reloadResolveProbe ?? "not-run",
    runtime_reload_reject_probe: evaluation?.reloadRejectProbe ?? "not-run",
    runtime_background_resolve_probe: evaluation?.backgroundResolveProbe ?? "not-run",
    runtime_background_reject_probe: evaluation?.backgroundRejectProbe ?? "not-run",
    practice_probe: evaluation?.practiceProbe ?? "not-run",
    dual_pass: evaluation?.dualPass ?? false,
    validity: { valid, reasons: invalidReasons },
    skill_discovery: discovered,
    query_anchored: queryAnchored,
    constraint_adopted: condition.id === "lorelum-retrieval" && completeTrace && queryAnchored && evaluation?.dualPass === true,
    trace,
    output: relativeToRepository(attemptPath)
  };
}

async function runToolQualification(
  outputPath: string,
  condition: Condition,
  conditions: Conditions,
  piRuntime: { shellPath: string },
  command: string
): Promise<Record<string, unknown>> {
  if (condition.practice === "none" || typeof condition.practice !== "object") fail("Tool qualification requires a declared Practice reference");
  const attemptPath = resolve(outputPath, "tool-qualification", "attempt-1");
  const workspace = resolve(attemptPath, "workspace");
  await mkdir(attemptPath, { recursive: true });
  await copyPublicWorkspace(workspace);
  const initialFiles = await workspaceFiles(workspace);
  if (initialFiles.some((file) => file.includes("private/") || file.includes("practices/"))) fail("Private material was copied into a qualification workspace");

  const auditPath = resolve(attemptPath, "lorelum-audit.jsonl");
  const piAgentDirectory = resolve(attemptPath, "pi-agent");
  await mkdir(piAgentDirectory, { recursive: true });
  await writeJson(resolve(piAgentDirectory, "settings.json"), { shellPath: piRuntime.shellPath });
  const piArgs = [
    "--print", "--no-session", "--no-context-files", "--no-extensions",
    "--no-skills", "--no-prompt-templates",
    "--tools", "read,bash,edit,write,grep,find,ls,skills_list,skills_load,lorelum_query",
    "--extension", resolve(candidateRoot, "private/execution/lorelum-extension.ts"),
    "--model", conditions.shared_execution.model.id,
    "--thinking", "off",
    "Use the read tool to read task.md. Do not edit files. Then call skills_list for the project policy reference in task.md with public_refs set to [\"task.md\"]. Load the returned entry with skills_load, then call lorelum_query with task.md as public_refs and a query using factual wording from task.md. Stop after those calls."
  ];
  const piEnvironment = {
    ...Bun.env,
    PI_CODING_AGENT_DIR: piAgentDirectory,
    LORELUM_MOCK_CONDITION: condition.id,
    LORELUM_MOCK_PRACTICE_PATH: resolve(candidateRoot, condition.practice.path),
    LORELUM_MOCK_PRACTICE_SHA256: condition.practice.sha256,
    LORELUM_MOCK_AUDIT_PATH: auditPath,
  };
  const pi = await run([command, ...piArgs], workspace, conditions.shared_execution.budget.max_duration_minutes * 60_000, piEnvironment);
  await Bun.write(resolve(attemptPath, "pi.stdout.log"), pi.stdout);
  await Bun.write(resolve(attemptPath, "pi.stderr.log"), pi.stderr);

  const workspaceFilesAfterAgent = await workspaceFiles(workspace);
  const auditEvents = await readAudit(auditPath);
  const trace = observedTrace(condition, auditEvents);
  await writeJson(resolve(attemptPath, "trace.json"), trace);
  const invalidReasons = await invalidityReasons(condition, pi, workspaceFilesAfterAgent, auditEvents, trace);
  const traceEvents = (trace as { events: AuditEvent[] }).events;
  const queryAnchored = traceEvents.some((event) => event.event === "practice_query_issued" && Array.isArray(event.public_refs) && event.public_refs.length > 0);
  const qualified = pi.code === 0 && !pi.timedOut && invalidReasons.length === 0 && (trace as { complete?: unknown }).complete === true && queryAnchored;
  return {
    kind: "forced-tool-qualification",
    condition: condition.id,
    workspace: relativeToRepository(workspace),
    initial_workspace_files: initialFiles,
    agent_workspace_files: workspaceFilesAfterAgent,
    pi: { code: pi.code, timed_out: pi.timedOut, duration_ms: pi.durationMs },
    validity: { valid: invalidReasons.length === 0, reasons: invalidReasons },
    complete_trace: (trace as { complete?: unknown }).complete === true,
    query_anchored: queryAnchored,
    status: qualified ? "pass" : "fail",
    trace,
    output: relativeToRepository(attemptPath),
  };
}

function outcome(entries: Record<string, unknown>[], repetitions: number): "signal" | "diagnostic-only" {
  const byCondition = new Map<string, Record<string, unknown>[]>();
  for (const entry of entries) {
    if (typeof entry.condition !== "string") continue;
    byCondition.set(entry.condition, [...(byCondition.get(entry.condition) ?? []), entry]);
  }
  const every = (condition: string, predicate: (entry: Record<string, unknown>) => boolean) => {
    const values = byCondition.get(condition) ?? [];
    return values.length === repetitions && values.every(predicate);
  };
  const valid = (entry: Record<string, unknown>) => (entry.validity as { valid?: unknown } | undefined)?.valid === true;
  const treatmentPasses = every("lorelum-retrieval", (entry) => valid(entry) && entry.dual_pass === true && (entry.trace as { complete?: unknown } | undefined)?.complete === true);
  const baselineFailsQuality = every("baseline", (entry) => valid(entry) && entry.practice_probe === "fail");
  const irrelevantFailsQuality = every("irrelevant-practice", (entry) => valid(entry) && entry.practice_probe === "fail");
  return treatmentPasses && baselineFailsQuality && irrelevantFailsQuality ? "signal" : "diagnostic-only";
}

const options = parseOptions();
const conditions = await loadConditions();
const piRuntime = await loadPiRuntime();
await verifySnapshot();
const runnable = plannedConditions(conditions);
const repeat = options.repeat ?? conditions.shared_execution.repetitions;
const discoveryCondition = runnable.find((condition) => condition.id === "lorelum-retrieval");
if (!discoveryCondition) fail("Missing lorelum-retrieval discovery condition");
const discoveryPlan = Array.from({ length: repeat }, (_, index) => ({ condition: discoveryCondition.id, attempt: index + 1 }));
const qualityPlan = runnable.flatMap((condition) => Array.from({ length: repeat }, (_, index) => ({ condition: condition.id, attempt: index + 1 })));

if (options.dryRun) {
  console.log(JSON.stringify({
    schema_version: "skill-trigger-local-plan/v2",
    tool_qualification: options.qualification ? "forced-real-pi-canary" : "not-requested",
    discovery_gate: { planned_runs: discoveryPlan },
    quality_pilot: options.qualityPilot ? { planned_runs: qualityPlan } : "not-requested",
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

if (options.qualification) {
  const qualification = await runToolQualification(options.outputPath, discoveryCondition, conditions, piRuntime, command);
  const summary = {
    schema_version: "skill-trigger-local-tool-qualification/v1",
    generated_at: new Date().toISOString(),
    pi_version: version.stdout.trim(),
    model: conditions.shared_execution.model.id,
    qualification,
    discovery_gate: "not-run",
    quality_pilot: "not-run",
    outcome: "not-an-experiment",
  };
  await writeJson(resolve(options.outputPath, "summary.json"), summary);
  console.log(JSON.stringify({ output: relativeToRepository(options.outputPath), ...summary }, null, 2));
  process.exit((qualification as { status: string }).status === "pass" ? 0 : 1);
}

const discoveryEntries: Record<string, unknown>[] = [];
for (let attempt = 1; attempt <= repeat; attempt += 1) {
  const entry = await runAttempt(resolve(options.outputPath, "discovery-gate"), discoveryCondition, attempt, conditions, piRuntime, command, options.skipInstall, false);
  discoveryEntries.push(entry);
}
const discoveryPassed = discoveryEntries.length === repeat && discoveryEntries.every((entry) => {
  const validity = entry.validity as { valid?: unknown } | undefined;
  const trace = entry.trace as { complete?: unknown } | undefined;
  return validity?.valid === true && trace?.complete === true && entry.query_anchored === true;
});
const discoveryGate = { status: discoveryPassed ? "pass" : "fail", attempts: discoveryEntries };

if (!discoveryPassed || !options.qualityPilot) {
  const summary = {
    schema_version: "skill-trigger-local-summary/v2",
    generated_at: new Date().toISOString(),
    pi_version: version.stdout.trim(),
    model: conditions.shared_execution.model.id,
    discovery_gate: discoveryGate,
    quality_pilot: !discoveryPassed ? "blocked" : "not-requested",
    outcome: "diagnostic-only",
  };
  await writeJson(resolve(options.outputPath, "summary.json"), summary);
  console.log(JSON.stringify({ output: relativeToRepository(options.outputPath), ...summary }, null, 2));
  process.exit(0);
}

const entries: Record<string, unknown>[] = [];
for (const condition of runnable) {
  for (let attempt = 1; attempt <= repeat; attempt += 1) {
    const entry = await runAttempt(resolve(options.outputPath, "quality-pilot"), condition, attempt, conditions, piRuntime, command, options.skipInstall, true);
    entries.push(entry);
    await writeJson(resolve(options.outputPath, "summary.json"), {
      schema_version: "skill-trigger-local-summary/v2",
      generated_at: new Date().toISOString(),
      pi_version: version.stdout.trim(),
      model: conditions.shared_execution.model.id,
      discovery_gate: discoveryGate,
      planned_runs: qualityPlan.length,
      decision_rule: "lorelum-passes-and-irrelevant-fails",
      outcome: outcome(entries, repeat),
      entries
    });
  }
}

console.log(JSON.stringify({ output: relativeToRepository(options.outputPath), outcome: outcome(entries, repeat), entries }, null, 2));
