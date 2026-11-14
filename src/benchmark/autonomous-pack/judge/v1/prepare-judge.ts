import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir, release, arch } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { fileURLToPath } from "node:url";
export type PrepareJudgeOptions = {
  /** Trusted Git repository path or URL. Never persisted in the result. */
  repository: string;
  /** Full, lowercase SHA-1 commit identity. */
  commit: string;
  /** Absolute, nonexistent directory, under an existing trusted parent. */
  destination: string;
};

export type PreparedJudge = {
  directory: string;
  manifest: string;
  identity: JudgeEnvironmentIdentity;
};

export type JudgeEnvironmentIdentity = {
  schema: "judge-node-environment/v1";
  source: { kind: "user-supplied-git"; commit: string };
  lockfile: { name: "bun.lock"; sha256: string };
  build: { recipe: string[]; platform: string; architecture: string; kernel: string; node: string; bun: string; declaredPackageManager: string; git: string; compiler: string };
  packages: { name: string; version: string; sha256: string }[];
  dependencies: { name: string; version: string; sha256: string }[];
  nativeHelperSha256: string;
  consumption: "node-esm-import";
};

type Manifest = { name: string; version: string; packageManager?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; exports?: Record<string, unknown> };
const packageDirectories = ["protocol", "runtime", "runtime-bubblewrap", "judge", "workflow", "testing", "provider-openai-compatible"];
const recipe = ["bun --no-env-file install --frozen-lockfile", "bun --no-env-file run build"];

function command(file: string, args: string[], cwd: string, label: string, git = false): string {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(key) && !/^GIT_/i.test(key) && key !== "NODE_OPTIONS" && key !== "NODE_PATH"));
  if (git) Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" });
  try {
    return execFileSync(file, args, {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, env,
    }).trim();
  } catch (error) {
    // Do not expose command output or remote URLs, which may contain credentials.
    const status = (error as NodeJS.ErrnoException & { status?: number | null }).status;
    throw new Error(`Judge provisioning failed during ${label}${typeof status === "number" ? ` (exit ${status})` : ""}`);
  }
}

async function manifest(path: string): Promise<Manifest> {
  const value = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as Manifest;
  if (!value.name || !value.version) throw new Error("Invalid package manifest in Judge build");
  return value;
}

/** Hash path names, modes and bytes, not timestamps or absolute paths. */
async function hashTree(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(path: string, name: string): Promise<void> {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("Unexpected symlink in delivered Judge environment");
    hash.update(`${info.isDirectory() ? "d" : "f"}\0${name}\0${info.mode & 0o777}\0`);
    if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry), name ? `${name}/${entry}` : entry);
    } else if (info.isFile()) {
      const data = await readFile(path);
      hash.update(`${data.length}\0`); hash.update(data);
    } else throw new Error("Unexpected special file in delivered Judge environment");
  }
  await visit(root, "");
  return hash.digest("hex");
}

/** Verify the actual public package bytes, not only their saved manifest. */
export async function verifyJudgeEnvironment(directory: string): Promise<JudgeEnvironmentIdentity> {
  const identity = JSON.parse(await readFile(join(directory, "judge-environment.json"), "utf8")) as JudgeEnvironmentIdentity;
  const expected = ["@lorelum/judge-protocol", "@lorelum/judge-runtime", "@lorelum/runtime-bubblewrap", "@lorelum/judge", "@lorelum/judge-workflow", "@lorelum/judge-testing", "@lorelum/provider-openai-compatible"];
  if (identity.schema !== "judge-node-environment/v1" || identity.consumption !== "node-esm-import" || !Array.isArray(identity.packages) ||
      identity.packages.length !== expected.length || new Set(identity.packages.map(item => item.name)).size !== expected.length ||
      expected.some(name => !identity.packages.some(item => item.name === name))) throw new Error("Invalid Judge environment manifest");
  for (const item of identity.packages) {
    const path = join(directory, "node_modules", ...item.name.split("/"));
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || (await manifest(path)).version !== item.version || await hashTree(path) !== item.sha256) throw new Error(`Judge package identity mismatch: ${item.name}`);
  }
  const helper = join(directory, "node_modules", "@lorelum", "judge-workflow", "dist", "native", "safe-source-helper");
  if (createHash("sha256").update(await readFile(helper)).digest("hex") !== identity.nativeHelperSha256) throw new Error("Judge native helper identity mismatch");
  return identity;
}

async function findDependency(from: string, name: string): Promise<string> {
  // Resolve from the installed package's real location: Bun's isolated linker
  // places transitive dependencies alongside the real package, not its symlink.
  let current = await realpath(from);
  for (;;) {
    const candidate = join(current, "node_modules", ...name.split("/"));
    try { if ((await stat(candidate)).isDirectory()) return await realpath(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = dirname(current);
    if (parent === current) throw new Error(`Installed dependency not found: ${name}`);
    current = parent;
  }
}

/** Copy production dependency closure, preserving nested versions and eliminating workspace links. */
async function copyDependencies(source: string, target: string, workspaceNames: Set<string>, ancestors: Map<string, string>, identities: JudgeEnvironmentIdentity["dependencies"]): Promise<void> {
  const data = await manifest(source);
  for (const name of Object.keys({ ...data.dependencies, ...data.optionalDependencies }).sort()) {
    if (workspaceNames.has(name)) continue;
    let dependency: string;
    try { dependency = await findDependency(source, name); }
    catch (error) {
      if (data.optionalDependencies && name in data.optionalDependencies && error instanceof Error && error.message.startsWith("Installed dependency not found:")) continue;
      throw error;
    }
    // A matching ancestor already resolves from this package. This also ends cycles.
    if (ancestors.get(name) === dependency) continue;
    const output = join(target, "node_modules", ...name.split("/"));
    await mkdir(dirname(output), { recursive: true });
    await cp(dependency, output, { recursive: true, dereference: true, errorOnExist: true, force: false,
      filter: path => path === dependency || basename(path) !== "node_modules" });
    const nested = new Map(ancestors); nested.set(name, dependency);
    await copyDependencies(dependency, output, workspaceNames, nested, identities);
    const installed = await manifest(output);
    identities.push({ name: installed.name, version: installed.version, sha256: await hashTree(output) });
  }
}

/**
 * Build a trusted pinned Judge repository in an isolated temporary checkout.
 * The destination is a self-contained Node ESM package resolution root; place
 * the consumer .mjs inside it and run `node consumer.mjs`. This does not
 * provide Bun or TypeScript package resolution, a sandbox, or model credentials.
 * Git, genuine Node >=22, Bun, /usr/bin/cc, Linux headers and registry access
 * are prerequisites. Repository and install scripts run with
 * the caller's privileges, so the source and build environment must be trusted.
 */
export async function prepareJudge(options: PrepareJudgeOptions): Promise<PreparedJudge> {
  if (process.platform !== "linux") throw new Error("Judge provisioning requires Linux");
  if (!options || typeof options.repository !== "string" || !options.repository || options.repository.startsWith("-") || options.repository.includes("\0") ||
      !/^[a-f0-9]{40}$/.test(options.commit ?? "") || typeof options.destination !== "string" || !isAbsolute(options.destination)) {
    throw new Error("Expected a Git source, full lowercase SHA-1 commit, and absolute destination");
  }
  const destination = join(await realpath(dirname(resolve(options.destination))), basename(resolve(options.destination)));
  // A local source must not be modified by creating output inside its worktree.
  try {
    const source = await realpath(options.repository.startsWith("file:") ? fileURLToPath(options.repository) : options.repository);
    const part = relative(source, destination);
    if (part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part))) throw new Error("Destination must be outside the source repository");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(destination, { mode: 0o700 });
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(join(tmpdir(), "judge-build-"));
    const checkout = join(temporary, "source");
    command("git", ["clone", "--no-checkout", "--no-local", "--", options.repository, checkout], temporary, "Git clone", true);
    try { command("git", ["cat-file", "-e", `${options.commit}^{commit}`], checkout, "commit lookup", true); }
    catch { command("git", ["fetch", "--no-tags", "origin", options.commit], checkout, "commit fetch", true); }
    const actual = command("git", ["rev-parse", "--verify", `${options.commit}^{commit}`], checkout, "commit verification", true);
    if (actual !== options.commit) throw new Error("Git commit identity mismatch");
    command("git", ["checkout", "--detach", "--force", options.commit], checkout, "checkout", true);
    const root = await manifest(checkout);
    if (!/^bun@\d+\.\d+\.\d+$/.test(root.packageManager ?? "")) throw new Error("Judge source must pin an exact Bun package manager version");
    const node = command("node", ["--version"], checkout, "Node version");
    if (!/^v(\d+)\./.test(node) || Number(node.slice(1).split(".")[0]) < 22) throw new Error("Judge requires Node 22 or newer");
    if (command("node", ["-p", "process.versions.bun || ''"], checkout, "Node runtime identity")) throw new Error("Judge requires a genuine Node runtime, not a Bun compatibility wrapper");
    const bun = command("bun", ["--version"], checkout, "Bun version");
    const git = command("git", ["--version"], checkout, "Git version", true);
    const compiler = command("/usr/bin/cc", ["--version"], checkout, "C compiler version").split("\n")[0];
    const lock = await readFile(join(checkout, "bun.lock"));
    for (const directory of packageDirectories) await rm(join(checkout, "packages", directory, "dist"), { recursive: true, force: true });
    command("bun", ["--no-env-file", "install", "--frozen-lockfile"], checkout, "frozen dependency installation");
    command("bun", ["--no-env-file", "run", "build"], checkout, "Judge build");
    const sources = await Promise.all(packageDirectories.map(async directory => {
      const path = join(checkout, "packages", directory);
      return { path, manifest: await manifest(path) };
    }));
    const names = new Set(sources.map(item => item.manifest.name));
    if (names.size !== sources.length) throw new Error("Duplicate Judge package names");
    const packages: JudgeEnvironmentIdentity["packages"] = [];
    const dependencies: JudgeEnvironmentIdentity["dependencies"] = [];
    for (const item of sources) {
      const { name, version } = item.manifest;
      if (!/^@lorelum\/[a-z0-9-]+$/.test(name)) throw new Error("Unexpected Judge package name");
      const target = join(destination, "node_modules", ...name.split("/"));
      await mkdir(target, { recursive: true });
      await cp(join(item.path, "dist"), join(target, "dist"), { recursive: true, dereference: true, errorOnExist: true, force: false });
      await cp(join(item.path, "package.json"), join(target, "package.json"), { errorOnExist: true, force: false });
      await copyDependencies(item.path, target, names, new Map(), dependencies);
      packages.push({ name, version, sha256: await hashTree(target) });
    }
    const helper = join(destination, "node_modules", "@lorelum", "judge-workflow", "dist", "native", "safe-source-helper");
    await access(helper, constants.X_OK);
    const identity: JudgeEnvironmentIdentity = {
      schema: "judge-node-environment/v1", source: { kind: "user-supplied-git", commit: actual },
      lockfile: { name: "bun.lock", sha256: createHash("sha256").update(lock).digest("hex") },
      build: { recipe, platform: "linux", architecture: arch(), kernel: release(), node, bun, declaredPackageManager: root.packageManager!, git, compiler },
      packages, dependencies, nativeHelperSha256: createHash("sha256").update(await readFile(helper)).digest("hex"), consumption: "node-esm-import",
    };
    const manifestPath = join(destination, "judge-environment.json");
    await writeFile(manifestPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return { directory: destination, manifest: manifestPath, identity };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
