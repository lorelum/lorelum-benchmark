import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const snapshot = join(repoRoot, "src", "benchmark", "snapshot.ts");

async function runSnapshot(workspace: string, ...args: string[]): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", snapshot, ...args], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

async function createKernelCandidate(workspace: string): Promise<string> {
  const candidate = join(workspace, "incubator", "practice-injection", "kernel-test-candidate-v1");
  await mkdir(join(candidate, "public", "starter", "src"), { recursive: true });
  await mkdir(join(candidate, "private"), { recursive: true });
  await mkdir(join(candidate, "public", "starter", "node_modules", "pkg"), { recursive: true });
  await writeFile(join(candidate, "public", "task.md"), "# Kernel test\n");
  await writeFile(join(candidate, "public", "starter", "package.json"), "{}");
  await writeFile(join(candidate, "public", "starter", "src", "index.ts"), "export const x = 1;\n");
  await writeFile(join(candidate, "public", "starter", "node_modules", "pkg", "index.js"), "");
  await writeFile(join(candidate, "private", "candidate.yaml"), [
    "id: kernel-test-candidate-v1",
    "lifecycle_stage: candidate",
    "kernel:",
    "  core: v1",
    "  profile: injection-calibration/v1",
    "  materializer_kind: react-vite",
    "calibration_roles:",
    "  - id: smoke-pass",
    "    command: [bun, -e, process.exit(0)]",
    "    expect: { kind: pass }",
  ].join("\n") + "\n");
  await writeFile(join(candidate, "private", "oracle.yaml"), "id: kernel-test-candidate-v1\n");
  return candidate;
}

test("kernel-backed candidate snapshot includes resolved fields", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-resolved-"));
  try {
    const candidate = await createKernelCandidate(workspace);
    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(writeResult.exitCode).toBe(0);

    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(manifest.resolved).toBeDefined();
    expect(manifest.resolved.core_version).toBe("v1");
    expect(manifest.resolved.profile).toBe("injection-calibration/v1");
    expect(manifest.resolved.materializer_kind).toBe("react-vite");
    expect(manifest.resolved.input_hash).toBeString();
    expect(manifest.resolved.core_hash).toBeString();

    expect(manifest.files["public/starter/node_modules/pkg/index.js"]).toBeUndefined();
    expect(manifest.files["public/starter/package.json"]).toBeString();

    const verifyResult = await runSnapshot(workspace, "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(verifyResult.exitCode).toBe(0);
    expect(verifyResult.output).toContain("Snapshots are intact.");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("source change causes resolved snapshot failure", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-resolved-fail-"));
  try {
    const candidate = await createKernelCandidate(workspace);
    await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");

    await writeFile(join(candidate, "public", "starter", "src", "index.ts"), "export const x = 2;\n");

    const verifyResult = await runSnapshot(workspace, "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(verifyResult.exitCode).toBe(1);
    expect(verifyResult.output).toContain("Snapshot verification failed");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("non-kernel candidate has no resolved field (existing behavior preserved)", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-nonkernel-"));
  try {
    const candidate = join(workspace, "incubator", "practice-injection", "legacy-candidate-v1");
    await mkdir(join(candidate, "public", "starter"), { recursive: true });
    await mkdir(join(candidate, "private"), { recursive: true });
    await writeFile(join(candidate, "public", "task.md"), "# Legacy\n");
    await writeFile(join(candidate, "public", "starter", ".env.example"), "PORT=3000\n");
    await writeFile(join(candidate, "private", "candidate.yaml"), "id: legacy-candidate-v1\nlifecycle_stage: candidate\n");
    await writeFile(join(candidate, "private", "oracle.yaml"), "id: legacy-candidate-v1\n");

    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "legacy-candidate-v1");
    expect(writeResult.exitCode).toBe(0);

    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(manifest.resolved).toBeUndefined();

    const verifyResult = await runSnapshot(workspace, "--incubator", "practice-injection", "legacy-candidate-v1");
    expect(verifyResult.exitCode).toBe(0);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
