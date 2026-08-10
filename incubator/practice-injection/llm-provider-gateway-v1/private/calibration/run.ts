import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type CalibrationCase = {
  id: string;
  path: string;
  expectedSemantic: "pass" | "fail";
  expectedObservation: "observed" | "not-observed";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-provider-gateway.ts");
const repositoryRoot = resolve(candidateRoot, "..", "..", "..");
const closureModule = await import(pathToFileURL(join(repositoryRoot, "src", "benchmark", "evaluator", "runtime-closure.ts")).href) as typeof import("../../../../../src/benchmark/evaluator/runtime-closure");
const candidateId = (Bun.YAML.parse(await Bun.file(join(candidateRoot, "private", "candidate.yaml")).text()) as { id: string }).id;
const parserRoot = (await closureModule.resolveRuntimeClosure(candidateRoot, candidateId)).resolution_root;
const stagedManifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!stagedManifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const stagedPublicStarterRoot = process.env.LORELUM_CALIBRATION_PUBLIC_STARTER;
if (!stagedPublicStarterRoot) throw new Error("Calibration public starter must be staged by the kernel");
const stagedPublicStarter = join(stagedPublicStarterRoot, "app");
const staged = JSON.parse(await Bun.file(stagedManifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }>;
};
const qualityProbe = staged.sets["quality-probe/v2"] ?? staged.sets["quality-probe/v1"];
if (!qualityProbe) throw new Error("Missing staged quality-probe calibration set");
function stagedFixture(id: string): string {
  const fixture = qualityProbe.fixtures[id];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${id}`);
  return fixture.path;
}
const cases: CalibrationCase[] = [
  { id: "public-starter", path: stagedPublicStarter, expectedSemantic: "fail", expectedObservation: "not-observed" },
  { id: "reference", path: stagedFixture("reference"), expectedSemantic: "pass", expectedObservation: "observed" },
  { id: "equivalent", path: stagedFixture("equivalent"), expectedSemantic: "pass", expectedObservation: "observed" },
  { id: "anti-pattern", path: stagedFixture("anti-pattern"), expectedSemantic: "pass", expectedObservation: "not-observed" },
  { id: "docs-present", path: stagedFixture("docs-present"), expectedSemantic: "pass", expectedObservation: "not-observed" },
  { id: "type-based", path: stagedFixture("type-based"), expectedSemantic: "pass", expectedObservation: "observed" },
];

async function run(command: string[], cwd: string, env?: Record<string, string>): Promise<number> {
  const executable = command[0] === "bun" ? process.execPath : command[0];
  return await Bun.spawn([executable, ...command.slice(1)], { cwd, stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } }).exited;
}

async function ensureDependencies(appPath: string): Promise<void> {
  if (existsSync(join(appPath, "node_modules", "typescript", "lib", "typescript.js"))) return;
  if (await run(["bun", "install", "--frozen-lockfile"], appPath) !== 0) {
    throw new Error(`Unable to install locked dependencies for ${appPath}`);
  }
}

async function observe(appPath: string): Promise<"observed" | "not-observed" | "indeterminate"> {
  const child = Bun.spawn([process.execPath, "run", probePath, appPath, parserRoot], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const result = JSON.parse(line) as { practice_observation?: unknown };
      if (result.practice_observation === "observed" || result.practice_observation === "not-observed" || result.practice_observation === "indeterminate") return result.practice_observation;
    } catch {
      // The probe may print diagnostics before its final result.
    }
  }
  return "indeterminate";
}

const results: Array<{ id: string; semantic: "pass" | "fail"; practice_observation: "observed" | "not-observed" | "indeterminate"; expected_semantic: "pass" | "fail"; expected_practice_observation: "observed" | "not-observed" }> = [];
for (const calibration of cases) {
  const appPath = calibration.path;
  await ensureDependencies(appPath);
  const semantic = await run(["bun", "run", "test"], appPath) === 0 ? "pass" : "fail";
  const practiceObservation = await observe(appPath);
  results.push({ id: calibration.id, semantic, practice_observation: practiceObservation, expected_semantic: calibration.expectedSemantic, expected_practice_observation: calibration.expectedObservation });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === result.expected_semantic && result.practice_observation === result.expected_practice_observation) ? 0 : 1);