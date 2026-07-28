import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

type CalibrationCase = {
  id: string;
  path: string;
  expectedProbe: "pass" | "fail";
};

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const probePath = join(candidateRoot, "private", "evaluator", "verify-resource-state.ts");
const stagedManifestPath = process.env.LORELUM_CALIBRATION_SETS_MANIFEST;
if (!stagedManifestPath) throw new Error("Calibration fixtures must be staged by the kernel");
const stagedPublicStarterRoot = process.env.LORELUM_CALIBRATION_PUBLIC_STARTER;
if (!stagedPublicStarterRoot) throw new Error("Calibration public starter must be staged by the kernel");
const calibrationBaseUrl = process.env.LORELUM_CALIBRATION_BASE_URL;
if (!calibrationBaseUrl) throw new Error("Calibration base URL must be provided by the kernel");
const portMatch = calibrationBaseUrl.match(/^http:\/\/127\.0\.0\.1:(\d+)$/);
if (!portMatch) throw new Error(`Calibration base URL must be http://127.0.0.1:<port>: ${calibrationBaseUrl}`);
const calibrationPort = Number(portMatch[1]);
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
  { id: "public-starter", path: stagedPublicStarter, expectedProbe: "fail" },
  { id: "reference", path: stagedFixture("reference"), expectedProbe: "pass" },
  { id: "equivalent", path: stagedFixture("equivalent"), expectedProbe: "pass" },
  { id: "anti-pattern", path: stagedFixture("anti-pattern"), expectedProbe: "fail" },
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

async function startDevServer(appPath: string): Promise<{ kill: () => Promise<void> }> {
  const child = Bun.spawn([process.execPath, "run", "dev", "--", "--port", String(calibrationPort), "--host", "127.0.0.1"], {
    cwd: appPath,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const readyTimeout = 60_000;
  const deadline = Date.now() + readyTimeout;
  let ready = false;
  const stderr = new Response(child.stderr).text();
  while (Date.now() < deadline && !ready) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const response = await fetch(calibrationBaseUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok || response.status > 0) ready = true;
    } catch {
      // server not ready yet
    }
  }
  if (!ready) {
    child.kill("SIGKILL");
    const log = await stderr;
    throw new Error(`Calibration dev server did not become ready at ${calibrationBaseUrl}${log ? `: ${log}` : ""}`);
  }
  return {
    kill: async () => {
      child.kill("SIGTERM");
      await child.exited.catch(() => {});
    },
  };
}

const results: Array<{ id: string; semantic: "pass" | "fail"; practice_probe: "pass" | "fail"; expected_practice_probe: "pass" | "fail" }> = [];
for (const calibration of cases) {
  const appPath = calibration.path;
  await ensureDependencies(appPath);
  const server = await startDevServer(appPath);
  try {
    const semantic = await run(["bun", "run", "test"], appPath, { PLAYWRIGHT_BASE_URL: calibrationBaseUrl }) === 0 ? "pass" : "fail";
    const probe = await run([process.execPath, "run", probePath, appPath, appPath], candidateRoot) === 0 ? "pass" : "fail";
    results.push({ id: calibration.id, semantic, practice_probe: probe, expected_practice_probe: calibration.expectedProbe });
  } finally {
    await server.kill();
  }
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === "pass" && result.practice_probe === result.expected_practice_probe) ? 0 : 1);