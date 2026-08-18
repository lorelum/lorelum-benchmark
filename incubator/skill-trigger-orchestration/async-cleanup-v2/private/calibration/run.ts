import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expected: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const structureProbePath = join(candidateRoot, "private", "evaluator", "verify-operation-authority.ts");
const runtimeProbePath = join(candidateRoot, "private", "evaluator", "verify-operation-authority-runtime.ts");
const manifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
const publicStarterRoot = process.env.LORELUM_CALIBRATION_PUBLIC_STARTER;

if (!manifestPath || !publicStarterRoot) {
  throw new Error("Calibration fixtures must be staged by the kernel");
}

const staged = JSON.parse(await Bun.file(manifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string }> }>;
};
const fixtures = staged.sets["operation-authority/v1"]?.fixtures;
if (!fixtures) throw new Error("Missing staged operation-authority/v1 fixtures");

const parserRoot = join(publicStarterRoot, "app");

const cases: CalibrationCase[] = [
  { id: "public-starter", path: parserRoot, expected: "fail" },
  { id: "reference", path: fixtures.reference.path, expected: "pass" },
  { id: "equivalent", path: fixtures.equivalent.path, expected: "pass" },
  { id: "anti-pattern", path: fixtures["anti-pattern"].path, expected: "fail" },
];

const modes = ["scope-resolve", "scope-reject", "reload-resolve", "reload-reject", "background-resolve", "background-reject"];
const results: Array<{ id: string; semantic: "pass" | "fail"; practice_probe: "pass" | "fail"; expected: "pass" | "fail" }> = [];
for (const calibration of cases) {
  if (!existsSync(join(calibration.path, "node_modules", "typescript", "lib", "typescript.js"))) {
    const install = Bun.spawn([process.execPath, "install"], { cwd: calibration.path, stdout: "inherit", stderr: "inherit" });
    if (await install.exited !== 0) throw new Error(`Unable to install calibration dependencies: ${calibration.id}`);
  }
  const semantic = Bun.spawn([process.execPath, "run", "test"], { cwd: calibration.path, stdout: "inherit", stderr: "inherit" });
  const semanticPassed = await semantic.exited === 0;
  const structure = Bun.spawn([process.execPath, "run", structureProbePath, calibration.path], { cwd: candidateRoot, stdout: "inherit", stderr: "inherit" });
  const structurePassed = await structure.exited === 0;
  let runtimePassed = structurePassed;
  for (const mode of modes) {
    if (!runtimePassed) break;
    const child = Bun.spawn([process.execPath, "run", runtimeProbePath, calibration.path, "--mode", mode], { cwd: candidateRoot, stdout: "inherit", stderr: "inherit" });
    runtimePassed = await child.exited === 0;
  }
  const practiceProbe = structurePassed && runtimePassed ? "pass" : "fail";
  results.push({ id: calibration.id, semantic: semanticPassed ? "pass" : "fail", practice_probe: practiceProbe, expected: calibration.expected });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => (result.semantic === "pass" && result.practice_probe === "pass") === (result.expected === "pass")) ? 0 : 1);
