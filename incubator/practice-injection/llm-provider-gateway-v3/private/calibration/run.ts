import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type CalibrationCase = {
  id: string;
  path: string;
  expectedSemantic: "pass" | "fail";
  expectedObservation: "observed" | "not-observed";
};

type ProbeResult = {
  practice_observation: "observed" | "not-observed" | "indeterminate";
  evidence?: string;
  failures?: string[];
  reason?: string;
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-provider-gateway-v3.ts");
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
const qualityProbe = staged.sets["quality-probe/v3"];
if (!qualityProbe) throw new Error("Missing staged quality-probe/v3 calibration set");

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
  { id: "oracle-naming-variant-a", path: stagedFixture("oracle-naming-variant-a"), expectedSemantic: "pass", expectedObservation: "observed" },
  { id: "oracle-naming-variant-b", path: stagedFixture("oracle-naming-variant-b"), expectedSemantic: "pass", expectedObservation: "observed" },
  { id: "different-layout", path: stagedFixture("different-layout"), expectedSemantic: "pass", expectedObservation: "observed" },
  { id: "irrelevant-naming-collision", path: stagedFixture("irrelevant-naming-collision"), expectedSemantic: "pass", expectedObservation: "not-observed" },
  { id: "unused-boundary-modules", path: stagedFixture("unused-boundary-modules"), expectedSemantic: "pass", expectedObservation: "not-observed" },
  { id: "ledger-naming-variant", path: stagedFixture("ledger-naming-variant"), expectedSemantic: "pass", expectedObservation: "observed" },
];

async function run(command: string[], cwd: string): Promise<number> {
  const executable = command[0] === "bun" ? process.execPath : command[0];
  return await Bun.spawn([executable, ...command.slice(1)], { cwd, stdout: "inherit", stderr: "inherit" }).exited;
}

async function ensureDependencies(appPath: string): Promise<void> {
  if (existsSync(join(appPath, "node_modules", "typescript", "lib", "typescript.js"))) return;
  if (await run(["bun", "install", "--frozen-lockfile"], appPath) !== 0) {
    throw new Error(`Unable to install locked dependencies for ${appPath}`);
  }
}

async function observe(appPath: string): Promise<ProbeResult> {
  const child = Bun.spawn([process.execPath, "run", probePath, appPath, parserRoot], {
    cwd: candidateRoot,
    stdout: "pipe",
    stderr: "inherit",
  });
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const result = JSON.parse(line) as Partial<ProbeResult>;
      if (result.practice_observation === "observed" || result.practice_observation === "not-observed" || result.practice_observation === "indeterminate") {
        return {
          practice_observation: result.practice_observation,
          ...(typeof result.evidence === "string" ? { evidence: result.evidence } : {}),
          ...(Array.isArray(result.failures) ? { failures: result.failures } : {}),
          ...(typeof result.reason === "string" ? { reason: result.reason } : {}),
        };
      }
    } catch {
      // The probe may print diagnostics before its final result.
    }
  }
  return { practice_observation: "indeterminate", reason: "invalid-probe-output" };
}

const results: Array<{
  id: string;
  semantic: "pass" | "fail";
  practice_observation: "observed" | "not-observed" | "indeterminate";
  reason: string;
  expected_semantic: "pass" | "fail";
  expected_practice_observation: "observed" | "not-observed";
}> = [];

for (const calibration of cases) {
  const appPath = calibration.path;
  await ensureDependencies(appPath);
  const semantic = await run(["bun", "run", "test"], appPath) === 0 ? "pass" : "fail";
  const result = await observe(appPath);
  const reason = result.evidence ?? result.failures?.join("; ") ?? result.reason ?? "no probe reason";
  results.push({
    id: calibration.id,
    semantic,
    practice_observation: result.practice_observation,
    reason,
    expected_semantic: calibration.expectedSemantic,
    expected_practice_observation: calibration.expectedObservation,
  });
}

console.log(JSON.stringify({ calibration: results }, null, 2));
process.exit(results.every((result) =>
  result.semantic === result.expected_semantic &&
  result.practice_observation === result.expected_practice_observation &&
  result.reason.length > 0
) ? 0 : 1);
