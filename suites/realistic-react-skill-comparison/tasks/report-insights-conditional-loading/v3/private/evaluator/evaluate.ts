import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type ProcessResult = { code: number; stdout: string; stderr: string };

const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["components/reports", "app/reports"];

async function sha256(path: string): Promise<string> { return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex"); }

async function filesAt(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report", "tsconfig.tsbuildinfo"].includes(entry.name)) continue;
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
  for (const path of await filesAt(candidateRoot)) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  return failures;
}

async function run(command: string[], cwd: string): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env: Bun.env, stdout: "pipe", stderr: "pipe" });
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

async function visualizationChunkExists(appRoot: string): Promise<boolean> {
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
  return matches.length === 1;
}

async function defersVisualizationUntilOpen(appRoot: string): Promise<boolean> {
  const panel = await Bun.file(join(appRoot, "components", "reports", "insights-panel.tsx")).text();
  return panel.includes('import("./insights-visualization")') && !panel.includes('from "./insights-visualization"') && panel.includes("if (!opened || Visualization) return");
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const protection = await protectionFailures(candidateRoot);
  const protectedCandidate = () => { if (protection.length > 0) throw new Error(protection.join("; ")); };
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "production-build-emits-insights-chunk", async run() { protectedCandidate(); const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot); expect(install.code, install.stderr || install.stdout).toBe(0); const build = await run([process.execPath, "run", "build"], candidateRoot); expect(build.code, build.stderr || build.stdout).toBe(0); expect(await visualizationChunkExists(candidateRoot)).toBeTrue(); } },
    { id: "report-browser-behavior", async run() { protectedCandidate(); const browser = await run([process.execPath, "run", "test:e2e:built"], candidateRoot); expect(browser.code, browser.stderr || browser.stdout).toBe(0); } },
  ], [
    { id: "explicit-insights-module-loading", maxPoints: 100, async run() { return await defersVisualizationUntilOpen(candidateRoot) ? 100 : 0; } },
  ]);
}
