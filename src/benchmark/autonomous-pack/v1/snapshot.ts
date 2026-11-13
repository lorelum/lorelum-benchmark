import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { sha256File } from "../../fs";

async function rejectLinks(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    const info = await lstat(child);
    if (info.isSymbolicLink()) throw new Error(`Pack snapshot cannot include symbolic links: ${child}`);
    if (info.isDirectory()) await rejectLinks(child);
    else if (!info.isFile()) throw new Error(`Pack snapshot cannot include special files: ${child}`);
  }
}

/** Portable content identity for the complete tree, including dotfiles and
 * empty directories. File modes are intentionally excluded across host OSes. */
export async function sha256SnapshotDirectory(root: string): Promise<string> {
  const base = resolve(root);
  if (!(await lstat(base)).isDirectory()) throw new Error("Snapshot source must be a directory");
  const hash = createHash("sha256").update("autonomous-pack-tree/v1\n");
  const visit = async (segments: string[]): Promise<void> => {
    const dir = join(base, ...segments);
    for (const name of (await readdir(dir)).sort()) {
      const childSegments = [...segments, name], path = join(base, ...childSegments);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error("Snapshot cannot include symbolic links");
      if (info.isDirectory()) {
        hash.update(JSON.stringify(["directory", childSegments]) + "\n");
        await visit(childSegments);
      } else if (info.isFile()) {
        hash.update(JSON.stringify(["file", childSegments, await sha256File(path)]) + "\n");
      } else throw new Error("Snapshot cannot include special files");
    }
  };
  await visit([]);
  return hash.digest("hex");
}

/** Copy an immutable source into a new destination and identify its exact bytes. */
export async function snapshotPack(source: string, destination: string): Promise<string> {
  const from = resolve(source);
  const to = resolve(destination);
  const nested = relative(from, to);
  if (!nested || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested))) throw new Error("Pack snapshot destination must be outside its source");
  if (!(await lstat(from)).isDirectory()) throw new Error("Pack source must be a directory");
  await rejectLinks(from);
  await mkdir(dirname(to), { recursive: true });
  // Exclusive creation keeps existing artifacts and user files intact.
  await mkdir(to);
  try {
    for (const entry of await readdir(from)) {
      await cp(join(from, entry), join(to, entry), { recursive: true, errorOnExist: true, force: false });
    }
    await rejectLinks(to);
    const digest = await sha256SnapshotDirectory(to);
    if (digest !== await sha256SnapshotDirectory(from)) throw new Error("Pack source changed during snapshot");
    return digest;
  } catch (error) {
    await rm(to, { recursive: true, force: true });
    throw error;
  }
}
