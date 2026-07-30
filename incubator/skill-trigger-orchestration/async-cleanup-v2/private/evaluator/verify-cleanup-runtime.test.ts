import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";

const candidateRoot = resolve(import.meta.dir, "..", "..");
const sourceApp = join(candidateRoot, "public", "starter", "app");
const probe = join(candidateRoot, "private", "evaluator", "verify-cleanup-runtime.ts");

async function execute(appRoot: string, mode: "resolve" | "reject"): Promise<number> {
  const child = Bun.spawn([process.execPath, "run", probe, appRoot, "--mode", mode], { cwd: candidateRoot, stdout: "pipe", stderr: "pipe" });
  return await child.exited;
}

test("runtime gate rejects post-unmount setters in both terminal paths and accepts an invalidation guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "lorelum-cleanup-runtime-"));
  const appRoot = join(root, "app");
  try {
    await cp(sourceApp, appRoot, { recursive: true });
    const install = Bun.spawn([process.execPath, "install"], { cwd: appRoot, stdout: "pipe", stderr: "pipe" });
    expect(await install.exited).toBe(0);
    expect(await execute(appRoot, "resolve")).toBe(1);
    expect(await execute(appRoot, "reject")).toBe(1);

    const dashboard = join(appRoot, "src", "Dashboard.tsx");
    const source = await readFile(dashboard, "utf8");
    const guarded = source.replace(/  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[\]\);/, `  useEffect(() => {
    let active = true;
    fetchProjects()
      .then((response) => {
        if (!active) return;
        if (response.status === 200) {
          setState({ kind: "ready", projects: response.body.projects });
        } else {
          setState({ kind: "error", message: "项目列表暂时不可用" });
        }
      })
      .catch(() => {
        if (!active) return;
        setState({ kind: "error", message: "项目列表暂时不可用" });
      });
    return () => { active = false; };
  }, []);`);
    await writeFile(dashboard, guarded);
    expect(await execute(appRoot, "resolve")).toBe(0);
    expect(await execute(appRoot, "reject")).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
