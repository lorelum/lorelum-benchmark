import { expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCandidateReadable } from "./candidate";
import { sha256SnapshotDirectory } from "../../v1/snapshot";

test("makes a private candidate readable without changing its content or execute bits", async () => {
  const root = await mkdtemp(join(tmpdir(), "judge-candidate-"));
  try {
    const src = join(root, "src"), file = join(src, "cli.js");
    await mkdir(src, { mode: 0o700 }); await writeFile(file, "console.log('ok');\n", { mode: 0o600 });
    const before = await sha256SnapshotDirectory(root);
    await makeCandidateReadable(root);
    expect(await sha256SnapshotDirectory(root)).toBe(before);
    expect(await readFile(file, "utf8")).toBe("console.log('ok');\n");
    if (process.platform !== "win32") {
      expect((await lstat(src)).mode & 0o777).toBe(0o755);
      expect((await lstat(file)).mode & 0o777).toBe(0o644);
      await chmod(file, 0o700); await makeCandidateReadable(root);
      expect((await lstat(file)).mode & 0o777).toBe(0o755);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

if (process.platform !== "win32") test("rejects links rather than traversing outside the candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "judge-candidate-link-"));
  try {
    await symlink("/etc", join(root, "external"));
    await expect(makeCandidateReadable(root)).rejects.toThrow("symbolic links");
  } finally { await rm(root, { recursive: true, force: true }); }
});
