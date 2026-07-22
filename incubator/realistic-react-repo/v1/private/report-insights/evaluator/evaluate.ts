import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

type ProcessResult = { code: number; stdout: string; stderr: string };

const evaluatorRoot = resolve(import.meta.dir, "..");
const incubatorRoot = resolve(evaluatorRoot, "..", "..");
const defaultBaselineRoot = resolve(incubatorRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["components/reports", "app/reports"];

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex");
}

async function filesAt(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report", ".lorelum-browser-audit.ts"].includes(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) output.push(relative(root, full));
    }
  }
  await visit(root);
  return output.sort();
}

function isAllowed(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

async function protectionFailures(candidateRoot: string, baselineRoot: string): Promise<string[]> {
  const anchor = await stat(join(candidateRoot, "package.json")).catch(() => undefined);
  if (!anchor?.isFile()) return ["candidate anchor must be a regular app/package.json file"];
  const failures: string[] = [];
  for (const path of protectedPaths) {
    if (await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`protected file changed: ${path}`);
  }
  const baseline = new Set(await filesAt(baselineRoot));
  for (const path of await filesAt(candidateRoot)) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  return failures;
}

async function run(command: string[], cwd: string, env: Record<string, string | undefined> = Bun.env): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
}

async function hasVisualizationBuildChunk(appRoot: string): Promise<boolean> {
  const staticRoot = join(appRoot, ".next", "static");
  const marker = "Insights visualization ready";
  const matches: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name.endsWith(".js") && (await Bun.file(full).text()).includes(marker)) matches.push(full);
    }
  }
  await visit(staticRoot);
  return matches.length === 1;
}

async function defersVisualizationUntilOpen(appRoot: string): Promise<boolean> {
  const panel = await Bun.file(join(appRoot, "components", "reports", "insights-panel.tsx")).text();
  return panel.includes('import("./insights-visualization")')
    && !panel.includes('from "./insights-visualization"')
    && panel.includes("if (!opened || Visualization) return");
}

async function evaluate(candidateRoot: string, baselineRoot: string): Promise<Record<string, unknown>> {
  const protection = await protectionFailures(candidateRoot, baselineRoot);
  const semanticFailures: string[] = [];
  let qualityPassed = false;
  try {
    if (!(await Bun.file(join(candidateRoot, "node_modules")).exists())) {
      const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot);
      if (install.code !== 0) throw new Error(`Frozen install failed: ${install.stderr || install.stdout}`);
    }
    const build = await run([process.execPath, "run", "build"], candidateRoot);
    if (build.code !== 0) throw new Error(`Production build failed: ${build.stderr || build.stdout}`);
    if (!(await hasVisualizationBuildChunk(candidateRoot))) semanticFailures.push("production build did not emit an insights visualization chunk");
    const browser = await run([process.execPath, "run", "test:e2e:built"], candidateRoot);
    if (browser.code !== 0) semanticFailures.push(`browser behavior failed: ${browser.stderr || browser.stdout}`);
    qualityPassed = await defersVisualizationUntilOpen(candidateRoot);
  } catch (error) {
    semanticFailures.push(error instanceof Error ? error.message : String(error));
  }
  const semanticPassed = semanticFailures.length === 0 && protection.length === 0;
  return {
    semantic: { passed: semanticPassed, failures: semanticFailures },
    protection: { passed: protection.length === 0, failures: protection },
    quality: {
      score: semanticPassed && qualityPassed ? 100 : 0,
      behaviors: { "explicit-insights-module-loading": { passed: qualityPassed, rule_behavior_id: "bundle-conditional.md" } }
    }
  };
}

const candidateRoot = Bun.argv[2] ?? Bun.env.CANDIDATE_ROOT;
if (!candidateRoot) throw new Error("Usage: bun evaluate.ts <candidate-app-root> [baseline-app-root]");
const result = await evaluate(resolve(candidateRoot), resolve(Bun.argv[3] ?? Bun.env.BASELINE_ROOT ?? defaultBaselineRoot));
console.log(JSON.stringify(result));
process.exit(result.semantic.passed && result.protection.passed ? 0 : 1);
