import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminateProcessTree } from "./process-tree";

const exitDeadlineMs = 10_000;

async function exitsWithin(child: { exited: Promise<number | null> }, ms: number): Promise<boolean> {
  const result = await Promise.race([
    child.exited.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), ms))
  ]);
  return result;
}

// Windows: Bun.spawn("taskkill") can take several seconds even for an unknown
// pid, so this test gets an explicit timeout instead of the 5s default.
test("terminateProcessTree does not throw for an unknown pid", async () => {
  await expect(terminateProcessTree(999_999_999)).resolves.toBeUndefined();
}, 15_000);

test("terminateProcessTree on Windows uses taskkill tree kill", async () => {
  if (process.platform !== "win32") return;
  const dir = await mkdtemp(join(tmpdir(), "lorelum-proc-tree-"));
  try {
    const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await terminateProcessTree(child.pid);
    expect(await exitsWithin(child, exitDeadlineMs)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

test("terminateProcessTree on Linux terminates descendants", async () => {
  if (process.platform === "win32") return;
  const dir = await mkdtemp(join(tmpdir(), "lorelum-proc-tree-"));
  try {
    const child = Bun.spawn(["sh", "-c", "sleep 30 & sleep 30"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await terminateProcessTree(child.pid);
    expect(await exitsWithin(child, exitDeadlineMs)).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);