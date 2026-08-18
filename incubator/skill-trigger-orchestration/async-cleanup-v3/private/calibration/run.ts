import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expected: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
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

// v3 校准只判定现象级公开测试：naive 必须失败（地板），reference/等价实现/anti-pattern
// 都必须通过公开测试；anti-pattern（后台永不覆盖）是陷阱，其政策符合性由 judge v2 另行校准。
const cases: CalibrationCase[] = [
  { id: "public-starter", path: join(publicStarterRoot, "app"), expected: "fail" },
  { id: "reference", path: fixtures.reference.path, expected: "pass" },
  { id: "equivalent", path: fixtures.equivalent.path, expected: "pass" },
  { id: "anti-pattern", path: fixtures["anti-pattern"].path, expected: "pass" },
];

const results: Array<{ id: string; semantic: "pass" | "fail"; expected: "pass" | "fail" }> = [];
for (const calibration of cases) {
  if (!existsSync(join(calibration.path, "node_modules", "typescript", "lib", "typescript.js"))) {
    const install = Bun.spawn([process.execPath, "install"], { cwd: calibration.path, stdout: "inherit", stderr: "inherit" });
    if (await install.exited !== 0) throw new Error("Unable to install calibration dependencies: " + calibration.id);
  }
  const semantic = Bun.spawn([process.execPath, "run", "test"], { cwd: calibration.path, stdout: "inherit", stderr: "inherit" });
  const semanticPassed = await semantic.exited === 0;
  results.push({ id: calibration.id, semantic: semanticPassed ? "pass" : "fail", expected: calibration.expected });
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === result.expected) ? 0 : 1);
