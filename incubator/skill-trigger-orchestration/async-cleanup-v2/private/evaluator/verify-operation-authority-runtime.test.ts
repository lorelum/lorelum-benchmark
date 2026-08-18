import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const candidateRoot = resolve(import.meta.dirname, "..", "..");
const sourceApp = join(candidateRoot, "public", "starter", "app");
const probe = join(candidateRoot, "private", "evaluator", "verify-operation-authority-runtime.ts");
const fixtureRoot = join(candidateRoot, "private", "calibration", "sets", "operation-authority", "v1", "overlays");
const modes = ["scope-resolve", "scope-reject", "reload-resolve", "reload-reject", "background-resolve", "background-reject"];

async function execute(appRoot: string, mode: string): Promise<number> {
  const child = Bun.spawn([process.execPath, "run", probe, appRoot, "--mode", mode], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  return await child.exited;
}

test("runtime gate rejects latest-request ownership when background coordination settles after a foreground operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-operation-authority-runtime-"));
  const appRoot = join(root, "app");
  try {
    await cp(sourceApp, appRoot, { recursive: true });
    const install = Bun.spawn([process.execPath, "install"], { cwd: appRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    for (const mode of modes) expect(await execute(appRoot, mode)).toBe(1);
    for (const id of ["reference", "equivalent"]) {
      await writeFile(join(appRoot, "src", "Dashboard.tsx"), await readFile(join(fixtureRoot, id, "src", "Dashboard.tsx"), "utf8"));
      await writeFile(join(appRoot, "src", "services", "projects.ts"), await readFile(join(fixtureRoot, id, "src", "services", "projects.ts"), "utf8"));
      for (const mode of modes) expect(await execute(appRoot, mode)).toBe(0);
    }
    await writeFile(join(appRoot, "src", "Dashboard.tsx"), await readFile(join(fixtureRoot, "anti-pattern", "src", "Dashboard.tsx"), "utf8"));
    await writeFile(join(appRoot, "src", "services", "projects.ts"), await readFile(join(fixtureRoot, "anti-pattern", "src", "services", "projects.ts"), "utf8"));
    expect(await execute(appRoot, "background-resolve")).toBe(1);
    expect(await execute(appRoot, "background-reject")).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);
