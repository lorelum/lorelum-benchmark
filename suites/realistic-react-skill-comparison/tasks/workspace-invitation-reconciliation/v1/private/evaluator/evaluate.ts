import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

type Deferred = { promise: Promise<void>; resolve: () => void };
type LoadedRuntime = {
  resolve: (repository: InstanceType<typeof import("../../public/starter/app/lib/repository").DeterministicRepository>, activity: InstanceType<typeof import("../../public/starter/app/lib/activity").DeterministicActivity>, input: import("../../public/starter/app/lib/types").InvitationResolutionInput) => Promise<import("../../public/starter/app/lib/types").InvitationReconciliationModel>;
  repository: typeof import("../../public/starter/app/lib/repository");
  activity: typeof import("../../public/starter/app/lib/activity");
};

const taskRoot = resolve(import.meta.dir, "..", "..");
const baselineRoot = join(taskRoot, "public", "starter", "app");
const allowedRoots = ["lib/invitation-resolution-runtime.ts"];

function deferred(): Deferred {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  return { promise, resolve: () => release?.() };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 64; index += 1) await Promise.resolve();
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
  const baseline = new Set(await filesAt(baselineRoot));
  const candidate = new Set(await filesAt(candidateRoot));
  for (const path of candidate) {
    if (!baseline.has(path) && !isAllowed(path)) failures.push(`unauthorized added file: ${path}`);
    if (baseline.has(path) && !isAllowed(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) failures.push(`unauthorized changed file: ${path}`);
  }
  for (const path of baseline) if (!candidate.has(path) && !isAllowed(path)) failures.push(`unauthorized removed file: ${path}`);
  return failures;
}

async function implementation(candidateRoot: string): Promise<LoadedRuntime> {
  const runtime = await import(`${pathToFileURL(join(candidateRoot, "lib", "invitation-resolution-runtime.ts")).href}?evaluation=${Date.now()}`) as { resolveWorkspaceInvitations?: unknown };
  const repository = await import(`${pathToFileURL(join(candidateRoot, "lib", "repository.ts")).href}?evaluation=${Date.now()}`) as LoadedRuntime["repository"];
  const activity = await import(`${pathToFileURL(join(candidateRoot, "lib", "activity.ts")).href}?evaluation=${Date.now()}`) as LoadedRuntime["activity"];
  if (typeof runtime.resolveWorkspaceInvitations !== "function") throw new Error("resolveWorkspaceInvitations must be exported");
  return { resolve: runtime.resolveWorkspaceInvitations as LoadedRuntime["resolve"], repository, activity };
}

function input(loaded: LoadedRuntime, invitationIds: readonly string[]) {
  return { workspaceId: " ATLAS ", viewer: loaded.repository.viewerFor("atlas"), invitationIds };
}

function count(trace: readonly { operation: string }[], operation: string): number {
  return trace.filter((event) => event.operation === operation).length;
}

async function buildCandidate(candidateRoot: string): Promise<void> {
  const next = await stat(join(candidateRoot, "node_modules", "next")).catch(() => undefined);
  if (!next?.isDirectory()) {
    const install = Bun.spawn([process.execPath, "install", "--frozen-lockfile"], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
    const [exitCode, stdout, stderr] = await Promise.all([install.exited, new Response(install.stdout).text(), new Response(install.stderr).text()]);
    if (exitCode !== 0) throw new Error(`dependency installation failed:\n${stdout}\n${stderr}`);
  }
  const child = Bun.spawn([process.execPath, "run", "build"], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exitCode !== 0) throw new Error(`production build failed:\n${stdout}\n${stderr}`);
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const candidateRoot = dirname(candidatePath);
  const loaded = await implementation(candidateRoot);
  const protection = await protectionFailures(candidateRoot);
  return evaluateV2([
    { id: "candidate-protection", run() { expect(protection).toEqual([]); } },
    { id: "production-build", async run() { await buildCandidate(candidateRoot); } },
    { id: "visible-reconciliation-model", async run() {
      const model = await loaded.resolve(new loaded.repository.DeterministicRepository(), new loaded.activity.DeterministicActivity(), input(loaded, ["inv-a1"]));
      expect(model.workspace.name).toBe("Atlas");
      expect(model.resolvedInvitationIds).toEqual(["inv-a1"]);
    } },
    { id: "repository-and-access-errors-preserved", async run() {
      await expect(loaded.resolve(new loaded.repository.DeterministicRepository(), new loaded.activity.DeterministicActivity(), { ...input(loaded, []), workspaceId: "missing" })).rejects.toBeInstanceOf(loaded.repository.RepositoryError);
      await expect(loaded.resolve(new loaded.repository.DeterministicRepository(), new loaded.activity.DeterministicActivity(), { workspaceId: "atlas", viewer: loaded.repository.viewerFor("empty"), invitationIds: [] })).rejects.toBeInstanceOf(loaded.repository.RepositoryError);
      await expect(loaded.resolve(new loaded.repository.DeterministicRepository(), new loaded.activity.DeterministicActivity(), input(loaded, ["inv-n1"]))).rejects.toBeInstanceOf(loaded.repository.RepositoryError);
    } },
    { id: "duplicate-ids-are-not-resolved-twice", async run() {
      const model = await loaded.resolve(new loaded.repository.DeterministicRepository(), new loaded.activity.DeterministicActivity(), input(loaded, ["inv-a1", " inv-a1 "]));
      expect(model.resolvedInvitationIds).toEqual(["inv-a1"]);
    } },
  ], [
    { id: "empty-selection-short-circuit", maxPoints: 20, async run() {
      const repository = new loaded.repository.DeterministicRepository();
      const activity = new loaded.activity.DeterministicActivity();
      await loaded.resolve(repository, activity, input(loaded, []));
      return count(repository.trace, "policy") === 0 && count(repository.trace, "reconcile") === 0 && activity.trace.length === 0 ? 20 : 0;
    } },
    { id: "settled-selection-short-circuit", maxPoints: 20, async run() {
      const repository = new loaded.repository.DeterministicRepository();
      const activity = new loaded.activity.DeterministicActivity();
      await loaded.resolve(repository, activity, input(loaded, ["inv-a2"]));
      return count(repository.trace, "policy") === 0 && count(repository.trace, "reconcile") === 0 && activity.trace.length === 0 ? 20 : 0;
    } },
    { id: "normalized-actionable-selection", maxPoints: 20, async run() {
      const repository = new loaded.repository.DeterministicRepository();
      const activity = new loaded.activity.DeterministicActivity();
      const model = await loaded.resolve(repository, activity, input(loaded, ["inv-a1", " inv-a1 "]));
      return model.resolvedInvitationIds.length === 1 && count(repository.trace, "policy") === 1 && count(repository.trace, "reconcile") === 1 ? 20 : 0;
    } },
    { id: "response-does-not-await-activity", maxPoints: 20, async run() {
      const record = deferred();
      const repository = new loaded.repository.DeterministicRepository();
      const activity = new loaded.activity.DeterministicActivity({ gates: { record: record.promise } });
      let settled = false;
      const response = loaded.resolve(repository, activity, input(loaded, ["inv-a1"])).then(() => { settled = true; });
      await settle();
      const passed = settled && count(activity.trace, "record") === 1;
      record.resolve();
      await response;
      return passed ? 20 : 0;
    } },
    { id: "activity-record-is-causal-and-scoped", maxPoints: 20, async run() {
      const repository = new loaded.repository.DeterministicRepository();
      const activity = new loaded.activity.DeterministicActivity();
      await loaded.resolve(repository, activity, input(loaded, ["inv-a1"]));
      await settle();
      await loaded.resolve(repository, activity, input(loaded, ["inv-a1"]));
      await settle();
      const record = activity.records[0];
      return activity.records.length === 1 && record?.workspaceId === "atlas" && record.actorId === "viewer-atlas" && JSON.stringify(record.invitationIds) === JSON.stringify(["inv-a1"]) ? 20 : 0;
    } },
  ]);
}
