import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expectedProbe: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-command-boundary.ts");
const stagedManifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!stagedManifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const stagedPublicStarter = process.env.LORELUM_CALIBRATION_PUBLIC_STARTER;
if (!stagedPublicStarter) throw new Error("Calibration public starter must be staged by the kernel");
const staged = JSON.parse(await Bun.file(stagedManifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string; tree_hash: string }> }>;
};
const qualityProbe = staged.sets["quality-probe/v1"];
if (!qualityProbe) throw new Error("Missing staged quality-probe/v1 calibration set");
function stagedFixture(id: string): string {
  const fixture = qualityProbe.fixtures[id];
  if (!fixture) throw new Error(`Missing staged calibration fixture: ${id}`);
  return fixture.path;
}
const cases: CalibrationCase[] = [
  { id: "public-starter", path: stagedPublicStarter, expectedProbe: "fail" },
  { id: "reference", path: stagedFixture("reference"), expectedProbe: "pass" },
  { id: "equivalent", path: stagedFixture("equivalent"), expectedProbe: "pass" },
  { id: "anti-pattern", path: stagedFixture("anti-pattern"), expectedProbe: "fail" },
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

const results: Array<{ id: string; semantic: "pass" | "fail"; practice_probe: "pass" | "fail"; expected_practice_probe: "pass" | "fail" }> = [];
for (const calibration of cases) {
  const appPath = calibration.path;
  await ensureDependencies(appPath);
  const semantic = await run(["bun", "run", "test"], appPath) === 0 ? "pass" : "fail";
  const probe = await run([process.execPath, "run", probePath, appPath, appPath], candidateRoot) === 0 ? "pass" : "fail";
  results.push({ id: calibration.id, semantic, practice_probe: probe, expected_practice_probe: calibration.expectedProbe });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === "pass" && result.practice_probe === result.expected_practice_probe) ? 0 : 1);
