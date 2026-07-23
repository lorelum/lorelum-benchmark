import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { joinPath, workspaceRoot } from "../../fs";
import { evaluatorResultFromOutput, failedExecutionEntry, piResultFromOutput, taskReferenceFromId, type LocalDiagnosticEntry } from "./v2/local-diagnostic";
import type { PiRunRequestV2 } from "./v2/types";

type Options = { planPath: string; outputPath: string; smoke: boolean; dryRun: boolean; continueOnFailure: boolean; resume: boolean };

function fail(message: string): never { throw new Error(message); }

function parseOptions(): Options {
  const args = Bun.argv.slice(2);
  const plan = args.shift();
  if (!plan) fail("Usage: bun run pi:diagnose -- <experiment-plan.yaml> [--smoke] [--output <ignored-directory>] [--dry-run] [--continue-on-failure]");
  const outputIndex = args.indexOf("--output");
  const resume = args.includes("--resume");
  const output = outputIndex === -1 ? joinPath(workspaceRoot, "scratch", "local-diagnostics", `${new Date().toISOString().replaceAll(/[:.]/g, "-")}`) : args[outputIndex + 1];
  if (!output) fail("--output requires a directory");
  const outputPath = resolve(workspaceRoot, output);
  if (!outputPath.startsWith(resolve(workspaceRoot, "scratch"))) fail("Local diagnostic output must stay under ignored scratch/");
  if (resume && outputIndex === -1) fail("--resume requires --output <existing-diagnostic-directory>");
  return { planPath: resolve(workspaceRoot, plan), outputPath, smoke: args.includes("--smoke"), dryRun: args.includes("--dry-run"), continueOnFailure: args.includes("--continue-on-failure"), resume };
}

async function command(command: string[], env = Bun.env): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { cwd: workspaceRoot, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

async function requestsFor(options: Options): Promise<PiRunRequestV2[]> {
  const result = await command([process.execPath, "run", "src/benchmark/runner/pi/request-generator.ts", options.planPath, ...(options.smoke ? ["--smoke"] : []), "--dry-run"]);
  if (result.code !== 0) fail(`Request generation failed: ${result.stderr.trim() || result.stdout.trim()}`);
  const requests = JSON.parse(result.stdout) as unknown;
  if (!Array.isArray(requests)) fail("Request generator did not emit an array");
  return requests as PiRunRequestV2[];
}

function assertLocalPlan(plan: Record<string, unknown>): void {
  if (plan.run_kind === "official" || plan.environment === undefined) fail("Local diagnostics cannot execute an official plan");
  const environment = plan.environment as Record<string, unknown>;
  if (environment.id === "formal-pi-deepseek-v4-pro") fail("Local diagnostics cannot execute the formal environment");
}

async function writeSummary(path: string, plan: Record<string, unknown>, requests: PiRunRequestV2[], entries: LocalDiagnosticEntry[], interrupted: boolean): Promise<void> {
  await Bun.write(joinPath(path, "summary.json"), `${JSON.stringify({
    schema_version: "local-diagnostic-summary/v1",
    generated_at: new Date().toISOString(),
    plan_id: plan.id,
    planned_runs: requests.length,
    started_runs: entries.length,
    interrupted,
    entries
  }, null, 2)}\n`);
}

async function existingEntries(path: string, resume: boolean): Promise<LocalDiagnosticEntry[]> {
  if (!resume || !(await Bun.file(joinPath(path, "summary.json")).exists())) return [];
  const document = JSON.parse(await Bun.file(joinPath(path, "summary.json")).text()) as { entries?: unknown };
  return Array.isArray(document.entries) ? document.entries as LocalDiagnosticEntry[] : [];
}

const options = parseOptions();
const plan = Bun.YAML.parse(await Bun.file(options.planPath).text()) as Record<string, unknown>;
assertLocalPlan(plan);
if (!options.dryRun && Bun.env.LORELUM_LOCAL_EXPERIMENT !== "1") fail("Local diagnostics require LORELUM_LOCAL_EXPERIMENT=1");
const requests = await requestsFor(options);

if (options.dryRun) {
  console.log(JSON.stringify({ plan_id: plan.id, planned_runs: requests.length, run_ids: requests.map((request) => request.run_id) }, null, 2));
  process.exit(0);
}

await mkdir(options.outputPath, { recursive: true });
await Bun.write(joinPath(options.outputPath, "requests.json"), `${JSON.stringify(requests, null, 2)}\n`);
const entries = await existingEntries(options.outputPath, options.resume);
const completedRunIds = new Set(entries.filter((entry) => entry.status === "evaluated").map((entry) => entry.run_id));
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });

for (const request of requests) {
  if (interrupted) break;
  if (completedRunIds.has(request.run_id)) continue;
  if (options.resume) {
    await rm(joinPath(workspaceRoot, ".run-workspaces", request.run_id), { recursive: true, force: true });
    await rm(joinPath(workspaceRoot, "artifacts", "runs", request.run_id), { recursive: true, force: true });
  }
  const requestPath = joinPath(options.outputPath, `${request.run_id}.json`);
  await Bun.write(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  const pi = await command([process.execPath, "run", "src/benchmark/runner/pi/v2/execute.ts", requestPath]);
  let piResult;
  try { piResult = piResultFromOutput(pi.stdout); } catch { piResult = undefined; }
  if (pi.code !== 0 || !piResult || piResult.status !== "completed") {
    entries.push(failedExecutionEntry(request, pi.stderr.trim() || "Pi execution did not complete", piResult));
    await writeSummary(options.outputPath, plan, requests, entries, interrupted);
    if (!options.continueOnFailure) break;
    continue;
  }

  const evaluation = await command(
    [process.execPath, "run", "src/benchmark/evaluate.ts", request.suite.id, taskReferenceFromId(request.task.id)],
    { ...Bun.env, CANDIDATE_PATH: joinPath(workspaceRoot, piResult.workspace, request.candidate_path) }
  );
  try {
    const evaluator = evaluatorResultFromOutput(evaluation.stdout);
    entries.push({ run_id: request.run_id, task: request.task.id, condition: request.condition_id, repeat: request.repeat, status: evaluator.semantic.passed ? "evaluated" : "evaluation-failed", pi: piResult, evaluator });
  } catch (error) {
    entries.push(failedExecutionEntry(request, `Evaluator did not emit a structured result: ${error instanceof Error ? error.message : String(error)}`, piResult));
  }
  await writeSummary(options.outputPath, plan, requests, entries, interrupted);
}

await writeSummary(options.outputPath, plan, requests, entries, interrupted);
console.log(JSON.stringify({ output: options.outputPath, planned_runs: requests.length, completed_entries: entries.length, interrupted }, null, 2));
process.exit(interrupted || entries.some((entry) => entry.status !== "evaluated") ? 1 : 0);
