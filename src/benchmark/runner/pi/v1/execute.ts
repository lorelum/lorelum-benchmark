import type { PiRunRequest, PiRunResult } from "./types";

const [requestPath, ...options] = Bun.argv.slice(2);
const dryRun = options.includes("--dry-run");

if (!requestPath) {
  console.error("Usage: bun run pi -- <pi-run-request.json> [--dry-run]");
  process.exit(1);
}

let request: PiRunRequest;
try {
  const parsed = JSON.parse(await Bun.file(requestPath).text()) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("request must be a JSON object");
  request = parsed as PiRunRequest;
} catch (error) {
  console.error(`Unable to read Pi run request: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const requiredValues: Array<[string, unknown]> = [
  ["schema_version", request.schema_version],
  ["run_id", request.run_id],
  ["suite.id", request.suite?.id],
  ["suite.version", request.suite?.version],
  ["task.id", request.task?.id],
  ["task.revision", request.task?.revision],
  ["task.snapshot_id", request.task?.snapshot_id],
  ["treatment.id", request.treatment?.id],
  ["treatment.version", request.treatment?.version],
  ["environment.id", request.environment?.id],
  ["environment.version", request.environment?.version],
  ["scorer.id", request.scorer?.id],
  ["scorer.version", request.scorer?.version],
  ["agent.id", request.agent?.id],
  ["agent.version", request.agent?.version],
  ["agent.model", request.agent?.model],
  ["execution.command", request.execution?.command],
  ["execution.cwd", request.execution?.cwd]
];
const missing = requiredValues.filter(([, value]) => typeof value !== "string" || value.length === 0).map(([key]) => key);
if (request.schema_version !== "pi-run/v1" || missing.length > 0 || !Array.isArray(request.execution?.args)) {
  console.error(`Invalid Pi run request: ${missing.length > 0 ? `missing ${missing.join(", ")}` : "unsupported schema or execution.args"}`);
  process.exit(1);
}

if (dryRun) {
  console.log(JSON.stringify({ run_id: request.run_id, command: request.execution.command, args: request.execution.args, cwd: request.execution.cwd }, null, 2));
  process.exit(0);
}

const child = Bun.spawn([request.execution.command, ...request.execution.args], {
  cwd: request.execution.cwd,
  env: Bun.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit"
});
const exitCode = await child.exited;
const result: PiRunResult = {
  schema_version: "pi-run-result/v1",
  run_id: request.run_id,
  status: exitCode === 0 ? "completed" : "failed",
  exit_code: exitCode,
  completed_at: new Date().toISOString()
};
console.log(JSON.stringify(result));
process.exit(exitCode);
