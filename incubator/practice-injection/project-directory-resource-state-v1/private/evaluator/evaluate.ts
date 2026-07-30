import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appRoot = resolve(Bun.argv[2] ?? "public/starter/app");
const evaluatorRoot = resolve(import.meta.dirname);
const candidateRoot = resolve(evaluatorRoot, "..", "..");
const run = async (command: string[], cwd: string) => await Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" }).exited;

async function resolveParserRoot(): Promise<string> {
  const candidateId = (Bun.YAML.parse(await Bun.file(join(candidateRoot, "private", "candidate.yaml")).text()) as { id: string }).id;
  const repositoryRoot = resolve(candidateRoot, "..", "..", "..");
  const module = await import(pathToFileURL(join(repositoryRoot, "src", "benchmark", "evaluator", "runtime-closure.ts")).href) as typeof import("../../../../../src/benchmark/evaluator/runtime-closure");
  const override = Bun.env.LORELUM_EVALUATOR_RUNTIME_CLOSURE_ROOT;
  if (override) {
    const closure = await module.verifyRuntimeClosureRoot(candidateRoot, resolve(override));
    return closure.resolution_root;
  }
  const closure = await module.resolveRuntimeClosure(candidateRoot, candidateId);
  return closure.resolution_root;
}

async function practiceObservation(): Promise<{ practice_observation: string; observation_reason?: string }> {
  const parserRoot = await resolveParserRoot();
  const child = Bun.spawn([process.execPath, "run", join(evaluatorRoot, "verify-resource-state.ts"), appRoot, parserRoot], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [output] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  for (const line of output.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { practice_observation?: unknown; observation_reason?: unknown };
      if (typeof value.practice_observation === "string" && (value.observation_reason === undefined || typeof value.observation_reason === "string")) {
        return value as { practice_observation: string; observation_reason?: string };
      }
    } catch {
      // The private probe may include diagnostics before its final result.
    }
  }
  return { practice_observation: "indeterminate", observation_reason: "invalid-probe-output" };
}
const semantic = await run(["bun", "run", "test"], appRoot);
const observation = await practiceObservation();
console.log(JSON.stringify({ semantic: semantic === 0 ? "pass" : "fail", ...observation }));
process.exit(semantic === 0 ? 0 : 1);
