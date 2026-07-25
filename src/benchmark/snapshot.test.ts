import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const snapshot = join(root, "src", "benchmark", "snapshot.ts");

async function createCandidateWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-snapshot-"));
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  await mkdir(join(candidate, "public", "starter"), { recursive: true });
  await mkdir(join(candidate, "private", "evaluator"), { recursive: true });
  await Bun.write(join(candidate, "public", "task.yaml"), "id: example-candidate-v1\n");
  await Bun.write(join(candidate, "public", "task.md"), "# Example\n");
  await Bun.write(join(candidate, "public", "starter", ".env.example"), "PORT=3000\n");
  await mkdir(join(candidate, "public", "starter", "node_modules", "example"), { recursive: true });
  await Bun.write(join(candidate, "public", "starter", "node_modules", "example", "index.js"), "export {};\n");
  await mkdir(join(candidate, "public", "starter", "dist"), { recursive: true });
  await Bun.write(join(candidate, "public", "starter", "dist", "index.html"), "<main />\n");
  await Bun.write(join(candidate, "private", "oracle.yaml"), "id: example-candidate-v1\n");
  await Bun.write(join(candidate, "private", "evaluator", ".env.example"), "TEST_PORT=3001\n");
  await mkdir(join(candidate, "private", "evidence-index"), { recursive: true });
  await Bun.write(join(candidate, "private", "evidence-index", "attempt-001.yaml"), "artifact: s3://example/attempt-001\n");
  return workspace;
}

async function runSnapshot(workspace: string, ...argumentsList: string[]): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", snapshot, ...argumentsList], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

test("writes and verifies a complete incubator candidate snapshot", async () => {
  const workspace = await createCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  try {
    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "candidates", "example-candidate");
    expect(writeResult.exitCode).toBe(0);

    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text()) as { files: Record<string, string> };
    expect(manifest.files["public/starter/.env.example"]).toBeString();
    expect(manifest.files["public/starter/node_modules/example/index.js"]).toBeUndefined();
    expect(manifest.files["public/starter/dist/index.html"]).toBeUndefined();
    expect(manifest.files["private/evaluator/.env.example"]).toBeString();
    expect(manifest.files["private/evidence-index/attempt-001.yaml"]).toBeUndefined();
    expect(manifest.files["private/snapshot.json"]).toBeUndefined();

    const verifyResult = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(verifyResult.exitCode).toBe(0);
    expect(verifyResult.output).toContain("Snapshots are intact.");

    await Bun.write(join(candidate, "private", "evidence-index", "attempt-002.yaml"), "artifact: s3://example/attempt-002\n");
    const postRunVerifyResult = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(postRunVerifyResult.exitCode).toBe(0);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
