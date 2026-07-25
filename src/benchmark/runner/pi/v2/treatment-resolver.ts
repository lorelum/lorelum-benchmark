import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { directoryExists, joinPath, sha256Directory, workspaceRoot } from "../../../fs";

type RecordValue = Record<string, unknown>;

export type SkillBundle = {
  path: string;
  skillPath: string;
  name: string;
  repository: string;
  revision: string;
  sourcePath: string;
  sha256: string;
};

const runtimeEntries = ["SKILL.md", "rules"];

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: RecordValue, field: string, label: string): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) fail(`Skill treatment ${label} must be a non-empty string`);
  return result;
}

function safeRelativePath(value: string, label: string): string {
  if (isAbsolute(value) || value.split(/[\\/]/).some((part) => part === ".." || part.length === 0)) fail(`Skill treatment ${label} must be a relative path`);
  return value.replaceAll("\\", "/");
}

function cacheRoot(): string {
  return resolve(Bun.env.LORELUM_TREATMENT_CACHE ?? joinPath(workspaceRoot, ".lorelum-cache", "treatments"));
}

function cachePath(root: string, sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Skill treatment bundle_sha256 must be a SHA-256 hash");
  return joinPath(root, sha256);
}

async function runGit(args: string[], label: string): Promise<void> {
  const child = Bun.spawn(["git", ...args], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" });
  if ((await child.exited) !== 0) {
    const stderr = (await new Response(child.stderr).text()).trim();
    const stdout = (await new Response(child.stdout).text()).trim();
    fail(`${label} failed: ${stderr || stdout}`);
  }
}

async function copyEntry(source: string, destination: string): Promise<void> {
  const stats = await lstat(source);
  if (stats.isSymbolicLink()) fail(`Skill bundle cannot contain symbolic links: ${source}`);
  if (stats.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await Bun.write(destination, await Bun.file(source).arrayBuffer());
    return;
  }
  if (!stats.isDirectory()) fail(`Skill bundle contains an unsupported entry: ${source}`);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source)) await copyEntry(joinPath(source, entry), joinPath(destination, entry));
}

async function verifyBundle(path: string, sha256: string): Promise<void> {
  if (!(await directoryExists(path))) fail(`Skill bundle is missing: ${path}`);
  for (const entry of runtimeEntries) {
    const entryPath = joinPath(path, entry);
    const stats = await lstat(entryPath).catch(() => undefined);
    if (!stats || stats.isSymbolicLink() || (entry === "rules" ? !stats.isDirectory() : !stats.isFile())) {
      fail(`Skill bundle is missing required ${entry}: ${path}`);
    }
  }
  const actualHash = await sha256Directory(path);
  if (actualHash !== sha256) fail(`Skill bundle hash does not match: ${path}`);
}

function sourceSpec(treatment: RecordValue): Omit<SkillBundle, "path" | "skillPath" | "name"> {
  if (!isRecord(treatment.source)) fail("Skill treatment must define its source");
  const source = treatment.source;
  const repository = stringField(source, "repository", "source.repository");
  const revision = stringField(source, "revision", "source.revision");
  const sourcePath = safeRelativePath(stringField(source, "path", "source.path"), "source.path");
  const sha256 = stringField(source, "bundle_sha256", "source.bundle_sha256");
  if (repository !== "https://github.com/vercel-labs/agent-skills.git") fail("Skill treatment source.repository is not allowlisted");
  if (!/^[a-f0-9]{40}$/.test(revision)) fail("Skill treatment source.revision must be a Git commit SHA");
  if (sourcePath !== "skills/react-best-practices") fail("Skill treatment source.path is not allowlisted");
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Skill treatment source.bundle_sha256 must be a SHA-256 hash");
  return { repository, revision, sourcePath, sha256 };
}

export function declaredSkillBundle(treatment: RecordValue): Omit<SkillBundle, "path" | "skillPath"> {
  if (treatment.kind !== "skill" || !isRecord(treatment.injection) || treatment.injection.mode !== "pi-skill" || treatment.injection.skill_path !== "SKILL.md" || treatment.injection.skill_name !== "vercel-react-best-practices") {
    fail("Skill treatment must define a native pi-skill injection");
  }
  return { ...sourceSpec(treatment), name: treatment.injection.skill_name };
}

export async function resolveSkillBundle(treatment: RecordValue, treatmentCache = cacheRoot()): Promise<SkillBundle> {
  const declared = declaredSkillBundle(treatment);
  const destination = cachePath(treatmentCache, declared.sha256);
  if (await directoryExists(destination)) {
    await verifyBundle(destination, declared.sha256);
    return { ...declared, path: destination, skillPath: joinPath(destination, "SKILL.md") };
  }

  await mkdir(treatmentCache, { recursive: true });
  const temporary = joinPath(treatmentCache, `.fetch-${declared.sha256}-${crypto.randomUUID()}`);
  try {
    await runGit(["init", "--quiet", temporary], "Skill source initialization");
    await runGit(["-C", temporary, "remote", "add", "origin", declared.repository], "Skill source remote configuration");
    await runGit(["-C", temporary, "config", "core.autocrlf", "false"], "Skill source line-ending configuration");
    await runGit(["-C", temporary, "config", "core.eol", "lf"], "Skill source line-ending configuration");
    await runGit(["-C", temporary, "sparse-checkout", "init", "--no-cone"], "Skill source sparse checkout initialization");
    await runGit(["-C", temporary, "sparse-checkout", "set", "--no-cone", `/${declared.sourcePath}/`], "Skill source sparse checkout configuration");
    await runGit(["-C", temporary, "fetch", "--depth=1", "--filter=blob:none", "origin", declared.revision], "Skill source fetch");
    await runGit(["-C", temporary, "checkout", "--quiet", "--detach", "FETCH_HEAD"], "Skill source checkout");

    const source = resolve(temporary, declared.sourcePath);
    if (relative(temporary, source).startsWith("..") || isAbsolute(relative(temporary, source))) fail("Skill source path escapes the sparse checkout");
    const bundle = joinPath(temporary, ".bundle");
    for (const entry of runtimeEntries) await copyEntry(joinPath(source, entry), joinPath(bundle, entry));
    await verifyBundle(bundle, declared.sha256);
    try {
      await rename(bundle, destination);
    } catch {
      await verifyBundle(destination, declared.sha256);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { ...declared, path: destination, skillPath: joinPath(destination, "SKILL.md") };
}

export async function stageSkillBundle(bundle: SkillBundle, destination: string): Promise<string> {
  await verifyBundle(bundle.path, bundle.sha256);
  for (const entry of runtimeEntries) await copyEntry(joinPath(bundle.path, entry), joinPath(destination, entry));
  await verifyBundle(destination, bundle.sha256);
  return joinPath(destination, "SKILL.md");
}
