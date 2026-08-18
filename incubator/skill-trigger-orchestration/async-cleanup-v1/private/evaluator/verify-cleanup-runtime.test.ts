import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const candidateRoot = resolve(import.meta.dir, "..", "..");
const sourceApp = join(candidateRoot, "public", "starter", "app");
const probe = join(candidateRoot, "private", "evaluator", "verify-cleanup-runtime.ts");

async function execute(appRoot: string): Promise<number> {
  const child = Bun.spawn([process.execPath, "run", probe, appRoot], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  return await child.exited;
}

test("runtime gate rejects post-unmount setters and accepts an invalidation guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-cleanup-runtime-"));
  const appRoot = join(root, "app");
  try {
    await cp(sourceApp, appRoot, { recursive: true });
    const install = Bun.spawn([process.execPath, "install"], { cwd: appRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    expect(await execute(appRoot)).toBe(1);

    const dashboard = join(appRoot, "src", "Dashboard.tsx");
    const source = await readFile(dashboard, "utf8");
    const guarded = source
      .replace("useEffect(() => {\n    fetchProjects()", "useEffect(() => {\n    let active = true;\n    fetchProjects()")
      .replace("if (response.status === 200) {", "if (!active) return;\n      if (response.status === 200) {")
      .replace("    });\n  }, []);", "    });\n    return () => { active = false; };\n  }, []);");
    await writeFile(dashboard, guarded);
    expect(await execute(appRoot)).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
