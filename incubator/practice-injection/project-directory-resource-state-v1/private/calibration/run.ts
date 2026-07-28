import { existsSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

type ViteDevServer = {
  middlewares: (request: IncomingMessage, response: ServerResponse) => void;
  close: () => Promise<void>;
};

async function startDevServer(appPath: string): Promise<{ baseUrl: string; kill: () => Promise<void> }> {
  const viteModulePath = pathToFileURL(join(appPath, "node_modules", "vite", "dist", "node", "index.js")).href;
  const { createServer } = await import(viteModulePath) as {
    createServer: (options: { root: string; server: { host: string; hmr: false; middlewareMode: { server: Server } } }) => Promise<ViteDevServer>;
  };
  const httpServer = createHttpServer();
  const server = await createServer({ root: appPath, server: { host: "127.0.0.1", hmr: false, middlewareMode: { server: httpServer } } });
  httpServer.on("request", server.middlewares);
  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => {
        httpServer.removeListener("error", reject);
        resolve();
      });
    });
    const address = httpServer.address();
    if (typeof address !== "object" || address === null || typeof address.port !== "number") {
      throw new Error("Calibration dev server did not yield a valid local port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Calibration dev server returned ${response.status} at ${baseUrl}`);
    return {
      baseUrl,
      kill: async () => {
        await server.close();
        if (httpServer.listening) await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
      },
    };
  } catch (error) {
    await server.close().catch(() => {});
    if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    throw error;
  }
}

const results: Array<{ id: string; semantic: "pass" | "fail"; practice_probe: "pass" | "fail"; expected_practice_probe: "pass" | "fail" }> = [];
for (const calibration of cases) {
  const appPath = calibration.path;
  await ensureDependencies(appPath);
  const server = await startDevServer(appPath);
  try {
    const semantic = await run(["bun", "run", "test"], appPath, { PLAYWRIGHT_BASE_URL: server.baseUrl }) === 0 ? "pass" : "fail";
    const probe = await run([process.execPath, "run", probePath, appPath, appPath], candidateRoot) === 0 ? "pass" : "fail";
    results.push({ id: calibration.id, semantic, practice_probe: probe, expected_practice_probe: calibration.expectedProbe });
  } finally {
    await server.kill();
  }
}

console.log(JSON.stringify({ calibration: results }));
process.exit(results.every((result) => result.semantic === "pass" && result.practice_probe === result.expected_practice_probe) ? 0 : 1);
