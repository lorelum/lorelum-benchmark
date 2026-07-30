import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expected: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const evaluatorPath = join(candidateRoot, "private", "evaluator", "evaluate.ts");
const manifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
const publicStarterRoot = process.env.LORELUM_CALIBRATION_PUBLIC_STARTER;

if (!manifestPath || !publicStarterRoot) {
  throw new Error("Calibration fixtures must be staged by the kernel");
}

const staged = JSON.parse(await Bun.file(manifestPath).text()) as {
  sets: Record<string, { fixtures: Record<string, { path: string }> }>;
};
const fixtures = staged.sets["cleanup-probe/v2"]?.fixtures;
if (!fixtures) throw new Error("Missing staged cleanup-probe/v2 fixtures");

const parserRoot = join(publicStarterRoot, "app");

const cases: CalibrationCase[] = [
  { id: "public-starter", path: parserRoot, expected: "fail" },
  { id: "reference", path: fixtures.reference.path, expected: "pass" },
  { id: "equivalent", path: fixtures.equivalent.path, expected: "pass" },
  { id: "anti-pattern", path: fixtures["anti-pattern"].path, expected: "fail" },
];

const results: Array<{ id: string; practice_probe: "pass" | "fail"; expected: "pass" | "fail" }> = [];
for (const calibration of cases) {
  if (!existsSync(join(calibration.path, "node_modules", "typescript", "lib", "typescript.js"))) {
    const install = Bun.spawn([process.execPath, "install"], { cwd: calibration.path, stdout: "inherit", stderr: "inherit" });
    if (await install.exited !== 0) throw new Error(`Unable to install calibration dependencies: ${calibration.id}`);
  }
  const child = Bun.spawn([process.execPath, "run", evaluatorPath, calibration.path], { cwd: candidateRoot, stdout: "inherit", stderr: "inherit" });
  const practiceProbe = await child.exited === 0 ? "pass" : "fail";
  results.push({ id: calibration.id, practice_probe: practiceProbe, expected: calibration.expected });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.practice_probe === result.expected) ? 0 : 1);
