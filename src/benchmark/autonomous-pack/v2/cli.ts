import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { inspectCodingTask } from "./task";
import { calibrateTask } from "./calibrate";
import { prepareExperiment, type PrepareConfiguration } from "./prepare";
import { exportBundle, verifyBundle } from "./bundle";
import { executionPlan, runPairedPilot, type PairedPilotOptions } from "./paired-runner";

type PilotFile = Omit<PairedPilotOptions, "upstreamBaseUrl" | "upstreamApiKey">;
async function readJson(path: string, maxBytes = 1_048_576): Promise<unknown> {
  if (!isAbsolute(path)) throw new Error("Configuration path must be absolute");
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error("Invalid JSON file");
  return JSON.parse(await readFile(path, "utf8"));
}
function pilot(value: unknown): PilotFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pilot configuration");
  const keys = ["plan", "sources", "outputDirectory", "modelFile", "indexes", "auditWaitMs"];
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error("Invalid pilot configuration fields");
  const config = value as PilotFile;
  executionPlan(config.plan);
  return config;
}
async function run(config: PilotFile): Promise<void> {
  const result = await runPairedPilot({ ...config, upstreamBaseUrl: process.env.LORELUM_PI_BASE_URL ?? "", upstreamApiKey: process.env.LORELUM_PI_API_KEY ?? "" });
  console.log(JSON.stringify({ planned_runs: result.summary.planned_runs, eligible_pairs: result.summary.pairs.eligible, output_directory: config.outputDirectory }));
}

async function main(args: string[]): Promise<void> {
  if (args[0] === "task" && args[1] === "inspect" && args.length === 3) {
    const task = await inspectCodingTask(resolve(args[2]));
    console.log(JSON.stringify({ id: task.declaration.id, runtime: task.declaration.environment.runtime, identities: task.identities }, null, 2));
  } else if (args[0] === "task" && args[1] === "calibrate" && args.length === 5) {
    const result = await calibrateTask(resolve(args[2]), args[3], resolve(args[4]));
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } else if (args[0] === "prepare" && args.length === 3) {
    const raw = await readJson(resolve(args[1]));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid preparation configuration");
    const keys = ["id", "tasks", "packSource", "environment", "agentImage", "proxyImage", "modelParameters", "systemPrompt", "modelFile", "indexes", "repetitions", "orderSeed", "budget", "auditWaitMs"];
    if (Object.keys(raw).length !== keys.length || keys.some(key => !Object.hasOwn(raw, key))) throw new Error("Invalid preparation configuration fields");
    const path = await prepareExperiment(raw as PrepareConfiguration, resolve(args[2]), process.env.LORELUM_PI_BASE_URL ?? "");
    console.log(JSON.stringify({ pilot: path }));
  } else if (args[0] === "run" && args.length === 2) {
    await run(pilot(await readJson(resolve(args[1]))));
  } else if (args[0] === "report" && args.length === 2) {
    const value = await readJson(joinOutput(resolve(args[1]), "summary.json"), Number.MAX_SAFE_INTEGER);
    console.log(JSON.stringify(value, null, 2));
  } else if (args[0] === "bundle" && args[1] === "export" && args.length === 5 && args[4] === "--include-private") {
    await exportBundle(pilot(await readJson(resolve(args[2]))), resolve(args[3]));
    console.log(JSON.stringify({ bundle: resolve(args[3]), visibility: "private" }));
  } else if (args[0] === "bundle" && args[1] === "verify" && args.length === 3) {
    const config = await verifyBundle(resolve(args[2]));
    console.log(JSON.stringify({ schema_version: "autonomous-pack-bundle/v1", tasks: config.plan.plan.tasks.map(task => task.id), visibility: "private" }));
  } else if (args[0] === "bundle" && args[1] === "run" && args.length === 4) {
    const config = await verifyBundle(resolve(args[2]));
    config.outputDirectory = resolve(args[3]);
    await run(config);
  } else {
    throw new Error("Usage: bench task inspect <task> | task calibrate <task> <image-id> <new-dir> | prepare <config.json> <new-dir> | run <pilot.json> | report <output-dir> | bundle export <pilot.json> <new-dir> --include-private | bundle verify <dir> | bundle run <dir> <new-output-dir>");
  }
}
function joinOutput(directory: string, name: string): string {
  return resolve(directory, name);
}

if (import.meta.main) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    // Inputs can contain credentials or private test data. Never echo parser,
    // Docker, provider or user-controlled error messages to the terminal.
    if (error instanceof Error && error.message.startsWith("Usage:")) console.error(error.message);
    else console.error("Command failed; check the private configuration, identities and prerequisites.");
    process.exitCode = 1;
  }
}
