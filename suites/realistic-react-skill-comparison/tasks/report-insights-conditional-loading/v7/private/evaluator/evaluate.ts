import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type ProcessResult = { code: number; stdout: string; stderr: string };
const processTimeoutMs = 120_000;

const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const chunkProbePath = join(import.meta.dir, "conditional-chunk-probe.mjs");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["components/reports", "app/reports"];

async function sha256(path: string): Promise<string> { return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex"); }

async function filesAt(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", ".playwright", ".playwright-browsers", "package-lock.json", "test-results", "playwright-report", "tsconfig.tsbuildinfo"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  }
  await visit(root);
  return files.sort();
}

function isAllowed(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return allowedRoots.some((allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`));
}

async function protectionFailures(candidateRoot: string): Promise<string[]> {
  const anchor = await stat(join(candidateRoot, "package.json")).catch(() => undefined);
  if (!anchor?.isFile()) return ["candidate anchor must be a regular app/package.json file"];
  const failures: string[] = [];
  for (const path of protectedPaths) if (await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`protected file changed: ${path}`);
  const baseline = new Set(await filesAt(baselineRoot));
  const candidate = new Set(await filesAt(candidateRoot));
  for (const path of candidate) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  for (const path of baseline) if (!candidate.has(path) && !isAllowed(path)) failures.push(`unauthorized removed file: ${path}`);
  return failures;
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
    return;
  }
  try { process.kill(pid, "SIGTERM"); } catch { }
}

async function run(command: string[], cwd: string): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env: Bun.env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void terminateProcessTree(child.pid); }, processTimeoutMs);
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  clearTimeout(timeout);
  return { code: timedOut ? 1 : code, stdout, stderr: timedOut ? `${stderr}\nCommand timed out after ${processTimeoutMs}ms` : stderr };
}

async function visualizationChunk(appRoot: string): Promise<string | undefined> {
  const marker = "Insights visualization ready";
  const matches: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".js") && (await Bun.file(path).text()).includes(marker)) matches.push(path);
    }
  }
  await visit(join(appRoot, ".next", "static"));
  return matches.length === 1 ? basename(matches[0]) : undefined;
}

async function defersVisualizationUntilOpen(appRoot: string, chunk: string): Promise<boolean> {
  const probe = await run(["node", chunkProbePath, appRoot, chunk], appRoot);
  if (probe.code !== 0) throw new Error(probe.stderr || probe.stdout);
  const result = JSON.parse(probe.stdout) as { beforeClick?: unknown; afterClick?: unknown };
  return result.beforeClick === false && result.afterClick === true;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const protection = await protectionFailures(candidateRoot);
  const protectedCandidate = () => { if (protection.length > 0) throw new Error(protection.join("; ")); };
  let builtChunk: Promise<string> | undefined;
  async function buildCandidate(): Promise<string> {
    if (!builtChunk) {
      builtChunk = (async () => {
        protectedCandidate();
        const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot);
        expect(install.code, install.stderr || install.stdout).toBe(0);
        const build = await run([process.execPath, "run", "build"], candidateRoot);
        expect(build.code, build.stderr || build.stdout).toBe(0);
        const chunk = await visualizationChunk(candidateRoot);
        expect(chunk).toBeDefined();
        return chunk!;
      })();
    }
    return builtChunk;
  }
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "production-build-emits-insights-chunk", async run() { await buildCandidate(); } },
    { id: "report-browser-behavior", async run() { protectedCandidate(); const browser = await run([process.execPath, "run", "test:e2e:built"], candidateRoot); expect(browser.code, browser.stderr || browser.stdout).toBe(0); } },
  ], [
    { id: "explicit-insights-module-loading", maxPoints: 100, async run() { return await defersVisualizationUntilOpen(candidateRoot, await buildCandidate()) ? 100 : 0; } },
  ]);
}
