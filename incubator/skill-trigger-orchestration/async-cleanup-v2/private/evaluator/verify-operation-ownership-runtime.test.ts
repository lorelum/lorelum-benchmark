import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const sourceApp = join(candidateRoot, "public", "starter", "app");
const probe = join(candidateRoot, "private", "evaluator", "verify-operation-ownership-runtime.ts");
const referenceDashboard = join(candidateRoot, "private", "calibration", "sets", "operation-ownership", "v1", "overlays", "reference", "src", "Dashboard.tsx");
const modes = ["scope-resolve", "scope-reject", "reload-resolve", "reload-reject"];

async function execute(appRoot: string, mode: string): Promise<number> {
  const child = Bun.spawn([process.execPath, "run", probe, appRoot, "--mode", mode], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  return await child.exited;
}

test("runtime gate covers range changes and repeated same-range loads in both terminal paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-operation-ownership-runtime-"));
  const appRoot = join(root, "app");
  try {
    await cp(sourceApp, appRoot, { recursive: true });
    const install = Bun.spawn([process.execPath, "install"], { cwd: appRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    for (const mode of modes) expect(await execute(appRoot, mode)).toBe(1);
    for (const dashboard of [
      referenceDashboard,
      join(candidateRoot, "private", "calibration", "sets", "operation-ownership", "v1", "overlays", "equivalent", "src", "Dashboard.tsx"),
    ]) {
      await writeFile(join(appRoot, "src", "Dashboard.tsx"), await readFile(dashboard, "utf8"));
      for (const mode of modes) expect(await execute(appRoot, mode)).toBe(0);
    }
    await writeFile(join(appRoot, "src", "Dashboard.tsx"), await readFile(join(candidateRoot, "private", "calibration", "sets", "operation-ownership", "v1", "overlays", "anti-pattern", "src", "Dashboard.tsx"), "utf8"));
    expect(await execute(appRoot, "scope-reject")).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
