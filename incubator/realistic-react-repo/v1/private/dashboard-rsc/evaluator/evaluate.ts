import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Deferred = { promise: Promise<void>; resolve: () => void };
type Evaluation = {
  semantic: { passed: boolean; failures: string[] };
  quality: { score: number; behaviors: Record<string, { passed: boolean; rule_behavior_id: string }> };
  protection: { passed: boolean; failures: string[] };
};

const evaluatorRoot = resolve(import.meta.dir, "..");
const defaultBaselineRoot = resolve(evaluatorRoot, "..", "..", "public", "starter", "app");
const protectedPaths = ["package.json", "bun.lock", "next.config.ts", "tsconfig.json", "lib/repository.ts"];
const allowedSourceRoots = ["lib/dashboard-runtime.ts", "components/dashboard"];

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
  const entries: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) entries.push(relative(root, fullPath));
    }
  }
  await visit(root);
  return entries.sort();
}

function isAllowedSource(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return allowedSourceRoots.some((allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`));
}

async function verifyCandidate(candidateRoot: string, baselineRoot: string): Promise<string[]> {
  const failures: string[] = [];
  const candidatePackage = join(candidateRoot, "package.json");
  const candidateStat = await stat(candidatePackage).catch(() => undefined);
  if (!candidateStat?.isFile()) return ["candidate anchor must be a regular app/package.json file"];

  for (const path of protectedPaths) {
    if (await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) {
      failures.push(`protected file changed: ${path}`);
    }
  }
  const baselineFiles = new Set(await filesAt(baselineRoot));
  for (const path of await filesAt(candidateRoot)) {
    if (!baselineFiles.has(path) && !isAllowedSource(path)) failures.push(`unauthorized added file: ${path}`);
    if (baselineFiles.has(path) && !isAllowedSource(path) && await sha256(join(candidateRoot, path)) !== await sha256(join(baselineRoot, path))) {
      failures.push(`unauthorized changed file: ${path}`);
    }
  }
  return failures;
}

async function evaluate(candidateRoot: string, baselineRoot: string): Promise<Evaluation> {
  const protectionFailures = await verifyCandidate(candidateRoot, baselineRoot);
  const semanticFailures: string[] = [];
  let implementation: { renderWorkspaceDashboard?: unknown } = {};
  let repositoryModule: typeof import("../../../public/starter/app/lib/repository");
  try {
    implementation = await import(`${pathToFileURL(join(candidateRoot, "lib", "dashboard-runtime.ts")).href}?evaluation=${Date.now()}`);
    repositoryModule = await import(`${pathToFileURL(join(candidateRoot, "lib", "repository.ts")).href}?evaluation=${Date.now()}`);
  } catch (error) {
    semanticFailures.push(`candidate cannot be imported: ${error instanceof Error ? error.message : String(error)}`);
    return { semantic: { passed: false, failures: semanticFailures }, quality: { score: 0, behaviors: {} }, protection: { passed: protectionFailures.length === 0, failures: protectionFailures } };
  }
  if (typeof implementation.renderWorkspaceDashboard !== "function") {
    semanticFailures.push("renderWorkspaceDashboard must be exported");
    return { semantic: { passed: false, failures: semanticFailures }, quality: { score: 0, behaviors: {} }, protection: { passed: protectionFailures.length === 0, failures: protectionFailures } };
  }

  const render = implementation.renderWorkspaceDashboard as (repository: InstanceType<typeof repositoryModule.DeterministicRepository>, id: string) => Promise<{ workspace: { name: string }; quota: { used: number; limit: number }; projects: readonly { name: string }[] }>;
  try {
    const model = await render(new repositoryModule.DeterministicRepository(), " ATLAS ");
    if (model.workspace.name !== "Atlas" || model.quota.used !== 32 || model.quota.limit !== 100 || model.projects.map((project) => project.name).join(",") !== "Launch,Migration") {
      semanticFailures.push("dashboard visible model changed");
    }
    await render(new repositoryModule.DeterministicRepository(), "missing");
    semanticFailures.push("missing workspace error was not preserved");
  } catch (error) {
    if (!(error instanceof repositoryModule.RepositoryError)) semanticFailures.push(`unexpected semantic error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const workspaceGate = deferred();
  const quotaGate = deferred();
  const projectsGate = deferred();
  const repository = new repositoryModule.DeterministicRepository({ gates: { workspace: workspaceGate.promise, quota: quotaGate.promise, projects: projectsGate.promise } });
  const pending = render(repository, "atlas");
  await settle();
  const initialTrace = [...repository.trace];
  workspaceGate.resolve();
  await settle();
  const afterWorkspaceTrace = [...repository.trace];
  quotaGate.resolve();
  projectsGate.resolve();
  try { await pending; } catch (error) { semanticFailures.push(`gated render failed: ${error instanceof Error ? error.message : String(error)}`); }

  const initialOperations = initialTrace.map((event) => event.operation);
  const afterWorkspaceOperations = afterWorkspaceTrace.map((event) => event.operation);
  const behaviors = {
    "request-scope-workspace-dedup": { passed: repository.trace.filter((event) => event.operation === "workspace").length === 1, rule_behavior_id: "server-cache-react.md" },
    "independent-root-start": { passed: initialOperations.includes("workspace") && initialOperations.includes("quota"), rule_behavior_id: "async-parallel.md" },
    "projects-after-workspace": { passed: afterWorkspaceOperations.includes("projects") && !initialOperations.includes("projects"), rule_behavior_id: "async-dependencies.md" },
  };
  const quality = semanticFailures.length === 0 && protectionFailures.length === 0
    ? Object.values(behaviors).filter((behavior) => behavior.passed).length * (100 / 3)
    : 0;
  return { semantic: { passed: semanticFailures.length === 0, failures: semanticFailures }, quality: { score: Math.round(quality * 100) / 100, behaviors }, protection: { passed: protectionFailures.length === 0, failures: protectionFailures } };
}

const argument = Bun.argv[2] ?? Bun.env.CANDIDATE_ROOT;
if (!argument) {
  console.error("Usage: bun evaluate.ts <candidate-app-root> [baseline-app-root]");
  process.exit(2);
}
const candidateRoot = resolve(argument);
const baselineRoot = resolve(Bun.argv[3] ?? Bun.env.BASELINE_ROOT ?? defaultBaselineRoot);
const result = await evaluate(candidateRoot, baselineRoot);
console.log(JSON.stringify(result));
process.exit(result.semantic.passed && result.protection.passed ? 0 : 1);
