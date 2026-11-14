import { chmod, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Make the isolated candidate readable to the verifier's unprivileged UID. */
export async function makeCandidateReadable(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error("Candidate cannot contain symbolic links");
  if (info.isDirectory()) {
    await chmod(path, 0o755);
    for (const name of await readdir(path)) await makeCandidateReadable(join(path, name));
  } else if (info.isFile() && info.nlink === 1) {
    await chmod(path, info.mode & 0o111 ? 0o755 : 0o644);
  } else throw new Error("Candidate cannot contain hard links or special files");
}
