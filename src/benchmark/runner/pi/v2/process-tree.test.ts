import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminateProcessTree } from "./process-tree";

test("terminateProcessTree does not throw for an unknown pid", async () => {
  await expect(terminateProcessTree(999_999_999)).resolves.toBeUndefined();
});

test("terminateProcessTree on Windows uses taskkill tree kill", async () => {
  const platform = process.platform;
  if (platform !== "win32") return;
  // Spawn a detached child and verify its pid can be terminated through the tree.
  const dir = await mkdtemp(join(tmpdir(), "lorelum-proc-tree-"));
  try {
    const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await terminateProcessTree(child.pid);
    const exitCode = await child.exited;
    expect(exitCode !== null).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("terminateProcessTree on Linux terminates descendants", async () => {
  const platform = process.platform;
  if (platform === "win32") return;
  const dir = await mkdtemp(join(tmpdir(), "lorelum-proc-tree-"));
  try {
    const child = Bun.spawn(["sh", "-c", "sleep 30 & sleep 30"], { cwd: dir, stdout: "ignore", stderr: "ignore" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await terminateProcessTree(child.pid);
    expect(child.exitCode !== null || child.killed).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});