import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expectedProbe: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-resource-state.ts");
const cases: CalibrationCase[] = [
  { id: "public-starter", path: "public/starter/app", expectedProbe: "fail" },
  { id: "reference", path: "private/calibration/reference", expectedProbe: "pass" },
  { id: "equivalent", path: "private/calibration/fixtures/equivalent", expectedProbe: "pass" },
  { id: "anti-pattern", path: "private/calibration/fixtures/anti-pattern", expectedProbe: "fail" },
];

async function run(command: string[], cwd: string): Promise<number> {
  return await Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" }).exited;
}

async function ensureDependencies(appPath: string): Promise<void> {
  if (existsSync(join(appPath, "node_modules", "typescript", "lib", "typescript.js"))) return;
  if (await run(["bun", "install", "--frozen-lockfile"], appPath) !== 0) {
    throw new Error(`Unable to install locked dependencies for ${appPath}`);
  }
}

const results: Array<{ id: string; semantic: "pass" | "fail"; practice_probe: "pass" | "fail"; expected_practice_probe: "pass" | "fail" }> = [];
for (const calibration of cases) {
  const appPath = join(candidateRoot, calibration.path);
  await ensureDependencies(appPath);
  const semantic = await run(["bun", "run", "test"], appPath) === 0 ? "pass" : "fail";
  const probe = await run([process.execPath, "run", probePath, appPath, appPath], candidateRoot) === 0 ? "pass" : "fail";
  results.push({ id: calibration.id, semantic, practice_probe: probe, expected_practice_probe: calibration.expectedProbe });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === "pass" && result.practice_probe === result.expected_practice_probe) ? 0 : 1);
