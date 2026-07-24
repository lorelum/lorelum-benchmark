import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type Deferred = { promise: Promise<void>; resolve: () => void };

const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["lib/dashboard-runtime.ts", "components/dashboard"];

function deferred(): Deferred {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  return { promise, resolve: () => release?.() };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(Buffer.from(await Bun.file(path).arrayBuffer())).digest("hex");
}

async function filesAt(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
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

async function implementation(candidateRoot: string) {
  const runtime = await import(`${pathToFileURL(join(candidateRoot, "lib", "dashboard-runtime.ts")).href}?evaluation=${Date.now()}`) as { renderWorkspaceDashboard?: unknown };
  const repository = await import(`${pathToFileURL(join(candidateRoot, "lib", "repository.ts")).href}?evaluation=${Date.now()}`) as typeof import("../../public/starter/app/lib/repository");
  if (typeof runtime.renderWorkspaceDashboard !== "function") throw new Error("renderWorkspaceDashboard must be exported");
  return { render: runtime.renderWorkspaceDashboard as (repository: InstanceType<typeof repository.DeterministicRepository>, id: string) => Promise<{ workspace: { name: string }; quota: { used: number; limit: number }; projects: readonly { name: string }[] }>, repository };
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const protection = await protectionFailures(candidateRoot);
  const loaded = await implementation(candidateRoot);
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "visible-dashboard-model", async run() { const model = await loaded.render(new loaded.repository.DeterministicRepository(), " ATLAS "); expect(model.workspace.name).toBe("Atlas"); expect(model.quota).toEqual({ used: 32, limit: 100 }); expect(model.projects.map((project) => project.name)).toEqual(["Launch", "Migration"]); } },
    { id: "repository-error-preserved", async run() { await expect(loaded.render(new loaded.repository.DeterministicRepository(), "missing")).rejects.toBeInstanceOf(loaded.repository.RepositoryError); } },
  ], [
    { id: "request-scope-workspace-dedup", maxPoints: 34, async run() { const repository = new loaded.repository.DeterministicRepository(); await loaded.render(repository, "atlas"); return repository.trace.filter((event) => event.operation === "workspace").length === 1 ? 34 : 0; } },
    { id: "independent-root-start", maxPoints: 33, async run() { const workspace = deferred(); const quota = deferred(); const projects = deferred(); const repository = new loaded.repository.DeterministicRepository({ gates: { workspace: workspace.promise, quota: quota.promise, projects: projects.promise } }); const pending = loaded.render(repository, "atlas"); await settle(); const startsTogether = repository.trace.some((event) => event.operation === "workspace") && repository.trace.some((event) => event.operation === "quota"); workspace.resolve(); quota.resolve(); projects.resolve(); await pending; return startsTogether ? 33 : 0; } },
    { id: "projects-after-workspace", maxPoints: 33, async run() { const workspace = deferred(); const quota = deferred(); const projects = deferred(); const repository = new loaded.repository.DeterministicRepository({ gates: { workspace: workspace.promise, quota: quota.promise, projects: projects.promise } }); const pending = loaded.render(repository, "atlas"); await settle(); const beforeWorkspace = repository.trace.some((event) => event.operation === "projects"); workspace.resolve(); await settle(); const afterWorkspace = repository.trace.some((event) => event.operation === "projects"); quota.resolve(); projects.resolve(); await pending; return !beforeWorkspace && afterWorkspace ? 33 : 0; } },
  ]);
}
