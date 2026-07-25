import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type ProcessResult = { code: number; stdout: string; stderr: string };
const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedRoots = ["lib/workspace-profile-runtime.ts"];
const processTimeoutMs = 120_000;
let importSequence = 0;

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
  const candidate = new Set(await filesAt(candidateRoot));
  for (const path of candidate) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  for (const path of baseline) if (!candidate.has(path) && !isAllowed(path)) failures.push(`unauthorized removed file: ${path}`);
  return failures;
}

async function runtime(candidateRoot: string) {
  const module = await import(`${pathToFileURL(join(candidateRoot, "lib", "workspace-profile-runtime.ts")).href}?evaluation=${++importSequence}`) as { renderWorkspaceProfile?: unknown };
  const repository = await import(`${pathToFileURL(join(candidateRoot, "lib", "repository.ts")).href}`) as typeof import("../../public/starter/app/lib/repository");
  if (typeof module.renderWorkspaceProfile !== "function") throw new Error("renderWorkspaceProfile must be exported");
  return { render: module.renderWorkspaceProfile as (repository: InstanceType<typeof repository.DeterministicRepository>, id: string) => Promise<{ profile: { workspaceId: string; displayName: string; plan: string; memberCount: number; region: string } }>, repository };
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
  } else {
    try { process.kill(pid, "SIGTERM"); } catch { }
  }
}

async function run(command: string[], cwd: string): Promise<ProcessResult> {
  const child = Bun.spawn(command, { cwd, env: Bun.env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void terminateProcessTree(child.pid); }, processTimeoutMs);
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  clearTimeout(timeout);
  return { code: timedOut ? 1 : code, stdout, stderr: timedOut ? `${stderr}\nCommand timed out after ${processTimeoutMs}ms` : stderr };
}

function profileCalls(repository: { trace: readonly { operation: string; key: string }[] }): readonly string[] {
  return repository.trace.filter((event) => event.operation === "profile").map((event) => event.key);
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const protection = await protectionFailures(candidateRoot);
  const protectedCandidate = () => { if (protection.length > 0) throw new Error(protection.join("; ")); };
  const semanticRuntime = await runtime(candidateRoot);
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "visible-profile-model", async run() { const model = await semanticRuntime.render(new semanticRuntime.repository.DeterministicRepository(), " ATLAS "); expect(model.profile).toEqual({ workspaceId: "atlas", displayName: "Atlas", plan: "pro", memberCount: 4, region: "us-east" }); } },
    { id: "missing-workspace-error-preserved", async run() { await expect(semanticRuntime.render(new semanticRuntime.repository.DeterministicRepository(), "missing")).rejects.toBeInstanceOf(semanticRuntime.repository.RepositoryError); } },
    { id: "production-build-and-profile-browser", async run() { protectedCandidate(); const install = await run([process.execPath, "install", "--frozen-lockfile"], candidateRoot); expect(install.code, install.stderr || install.stdout).toBe(0); const build = await run([process.execPath, "run", "build"], candidateRoot); expect(build.code, build.stderr || build.stdout).toBe(0); const browser = await run([process.execPath, "run", "test:e2e:built"], candidateRoot); expect(browser.code, browser.stderr || browser.stdout).toBe(0); } },
  ], [
    { id: "sequential-profile-reuse", maxPoints: 40, async run() { const loaded = await runtime(candidateRoot); const repository = new loaded.repository.DeterministicRepository(); await loaded.render(repository, "empty"); await loaded.render(repository, "empty"); return profileCalls(repository).length === 1 ? 40 : 0; } },
    { id: "bounded-recent-profile-cache", maxPoints: 30, async run() { const loaded = await runtime(candidateRoot); const repository = new loaded.repository.DeterministicRepository(); for (const id of ["nova", "orbit", "nova", "gamma", "orbit"]) await loaded.render(repository, id); return JSON.stringify(profileCalls(repository)) === JSON.stringify(["nova", "orbit", "gamma", "orbit"]) ? 30 : 0; } },
    { id: "rejected-reads-are-not-cached", maxPoints: 15, async run() { const loaded = await runtime(candidateRoot); const repository = new loaded.repository.DeterministicRepository(); await expect(loaded.render(repository, "missing")).rejects.toBeInstanceOf(loaded.repository.RepositoryError); await expect(loaded.render(repository, "missing")).rejects.toBeInstanceOf(loaded.repository.RepositoryError); const delta = await loaded.render(repository, "delta"); return JSON.stringify(profileCalls(repository)) === JSON.stringify(["missing", "missing", "delta"]) && delta.profile.workspaceId === "delta" ? 15 : 0; } },
    { id: "concurrent-profile-isolation", maxPoints: 15, async run() { let release: (() => void) | undefined; const gate = new Promise<void>((resolveGate) => { release = resolveGate; }); const loaded = await runtime(candidateRoot); const repository = new loaded.repository.DeterministicRepository({ gates: { profile: gate } }); const horizon = loaded.render(repository, "horizon"); const comet = loaded.render(repository, "comet"); for (let index = 0; index < 8; index += 1) await Promise.resolve(); release?.(); const [horizonModel, cometModel] = await Promise.all([horizon, comet]); return horizonModel.profile.workspaceId === "horizon" && cometModel.profile.workspaceId === "comet" && JSON.stringify(profileCalls(repository)) === JSON.stringify(["horizon", "comet"]) ? 15 : 0; } },
  ]);
}
