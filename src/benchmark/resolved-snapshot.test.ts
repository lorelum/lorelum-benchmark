import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashCalibrationFixtureSource } from "./kernel/core/v1/calibration-fixtures";

const repoRoot = process.cwd();
const snapshot = join(repoRoot, "src", "benchmark", "snapshot.ts");

async function runSnapshot(workspace: string, ...args: string[]): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn([process.execPath, "run", snapshot, ...args], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

async function sha256(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const practices = join(candidate, "private", "practices");
  await mkdir(practices, { recursive: true });
  const oraclePractice = join(practices, "oracle.md");
  const irrelevantPractice = join(practices, "irrelevant.md");
  await writeFile(oraclePractice, "Private oracle practice\n");
  await writeFile(irrelevantPractice, "Private neutral practice\n");
  const [oracleHash, irrelevantHash] = await Promise.all([sha256(oraclePractice), sha256(irrelevantPractice)]);
  const oracleLength = [...await Bun.file(oraclePractice).text()].length;
  const irrelevantLength = [...await Bun.file(irrelevantPractice).text()].length;
  const relativeDifference = Math.abs(oracleLength - irrelevantLength) / oracleLength;
  await writeFile(join(practices, "metadata.yaml"), [
    "delivery_template: practice-card/v1", "length_metric: practice-card/v1:utf8-rendered-characters", "cards:",
    `  - id: test.oracle\n    version: v1\n    path: oracle.md\n    rendered_characters: ${oracleLength}`,
    `  - id: test.irrelevant\n    version: v1\n    path: irrelevant.md\n    rendered_characters: ${irrelevantLength}`,
    "comparison:", `  maximum_relative_difference: ${relativeDifference + 0.01}`, `  actual_relative_difference: ${relativeDifference}`, "  independently_reviewed: true", "",
  ].join("\n"));
  await writeFile(join(candidate, "private", "conditions.yaml"), [
    "conditions:", "  - id: baseline\n    status: declared\n    practice: none",
    `  - id: oracle-practice\n    status: declared\n    practice:\n      path: private/practices/oracle.md\n      injection_channel: condition-scoped-private-runtime\n      sha256: ${oracleHash}`,
    `  - id: irrelevant-practice\n    status: declared\n    practice:\n      path: private/practices/irrelevant.md\n      injection_channel: condition-scoped-private-runtime\n      sha256: ${irrelevantHash}`,
    "  - id: lorelum-retrieval\n    status: unavailable\n    practice: unavailable",
    "decision_rule:\n  metric: joint-pass-count\n  oracle_relation: strictly-greater-than-each-control\n  controls: [baseline, irrelevant-practice]\n  otherwise: diagnostic-only", "",
  ].join("\n"));
  await writeFile(join(candidate, "private", "oracle.yaml"), "id: kernel-test-candidate-v1\n");
  return candidate;
}

async function createKernelTask(workspace: string): Promise<string> {
  const task = join(workspace, "suites", "kernel-suite", "tasks", "kernel-task", "v1");
  await mkdir(join(task, "public", "starter", "src"), { recursive: true });
  await mkdir(join(task, "private"), { recursive: true });
  await writeFile(join(task, "public", "task.md"), "# Kernel task\n");
  await writeFile(join(task, "public", "starter", "package.json"), "{}");
  await writeFile(join(task, "public", "starter", "src", "index.ts"), "export const task = true;\n");
  await writeFile(join(task, "public", "task.yaml"), [
    "id: kernel-task-v1",
    "kernel:",
    "  core: v1",
    "  profile: treatment-comparison/v1",
    "  materializer_kind: react-vite",
  ].join("\n") + "\n");
  return task;
}

async function createOverlayCandidate(workspace: string): Promise<string> {
  const candidate = await createKernelCandidate(workspace);
  const base = join(workspace, "incubator", "calibration-bases", "injection-calibration", "v1", "react-vite", "sample", "v1", "source");
  const overlay = join(candidate, "private", "calibration", "sets", "quality-probe", "v1", "fixture");
  await mkdir(join(base, "src"), { recursive: true });
  await mkdir(join(overlay, "src"), { recursive: true });
  await writeFile(join(base, "src", "fixture.ts"), "export const fixture = 'base';\n");
  await writeFile(join(base, "..", "base.yaml"), "profile: injection-calibration/v1\nmaterializer_kind: react-vite\nsource: source\n");
  await writeFile(join(overlay, "src", "fixture.ts"), "export const fixture = 'overlay';\n");
  const [baseHash, overlayHash] = await Promise.all([hashCalibrationFixtureSource(base), hashCalibrationFixtureSource(overlay)]);
  await writeFile(join(candidate, "private", "candidate.yaml"), `${await Bun.file(join(candidate, "private", "candidate.yaml")).text()}calibration_sets:\n  manifest: private/calibration/sets.yaml\n`);
  await writeFile(join(candidate, "private", "calibration", "sets.yaml"), [
    "version: 1", "sets:", "  - id: quality-probe", "    version: v1", "    trees:",
    `      base: { base: { ref: incubator/calibration-bases/injection-calibration/v1/react-vite/sample/v1/source, sha256: ${baseHash} } }`,
    `      fixture: { extends: base, overlay: { path: private/calibration/sets/quality-probe/v1/fixture, sha256: ${overlayHash} } }`,
    "    fixtures:", "      fixture: fixture", "",
  ].join("\n"));
  return candidate;
}

async function runKernel(workspace: string, subcommand: string, candidate: string, output: string): Promise<{ exitCode: number; output: string }> {
  const kernel = join(repoRoot, "src", "benchmark", "kernel", "kernel.ts");
  const child = Bun.spawn([process.execPath, "run", kernel, subcommand, candidate, "--output", output], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

test("kernel-backed candidate snapshot includes resolved fields", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-resolved-"));
  try {
    const candidate = await createKernelCandidate(workspace);
    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(writeResult.exitCode, writeResult.output).toBe(0);

    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(manifest.resolved).toBeDefined();
    expect(manifest.resolved.core_version).toBe("v1");
    expect(manifest.resolved.profile).toBe("injection-calibration/v1");
    expect(manifest.resolved.materializer_kind).toBe("react-vite");
    expect(manifest.resolved.input_hash).toBeString();
    expect(manifest.resolved.core_hash).toBeString();

    expect(manifest.files["public/starter/node_modules/pkg/index.js"]).toBeUndefined();
    expect(manifest.files["public/starter/package.json"]).toBeString();

    const materialized = await mkdtemp(join(tmpdir(), "lorelum-materialized-"));
    try {
      const kernel = join(repoRoot, "src", "benchmark", "kernel", "kernel.ts");
      const materializeResult = await Bun.spawn([process.execPath, "run", kernel, "materialize", candidate, "--output", materialized], { stdout: "pipe", stderr: "pipe" }).exited;
      expect(materializeResult).toBe(0);
      expect(await Bun.file(join(materialized, "public", "task.md")).text()).toBe("# Kernel test\n");
      expect(await Bun.file(join(materialized, "public", "starter", "src", "index.ts")).exists()).toBe(true);
    } finally {
      await rm(materialized, { force: true, recursive: true });
    }

    const verifyResult = await runSnapshot(workspace, "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(verifyResult.exitCode).toBe(0);
    expect(verifyResult.output).toContain("Snapshots are intact.");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("overlay candidate binds snapshot, materialize, isolate, and hash to one calibration identity", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-overlay-resolved-"));
  const output = await mkdtemp(join(tmpdir(), "lorelum-overlay-materialized-"));
  try {
    const candidate = await createOverlayCandidate(workspace);
    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(writeResult.exitCode, writeResult.output).toBe(0);
    const snapshotManifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text()) as { resolved: { calibration_sets_hash: string } };
    expect(snapshotManifest.resolved.calibration_sets_hash).toMatch(/^[a-f0-9]{64}$/);

    const materialized = await runKernel(workspace, "materialize", candidate, output);
    const isolated = await runKernel(workspace, "isolate", candidate, output);
    const hashed = await runKernel(workspace, "hash", candidate, output);
    expect(materialized.exitCode, materialized.output).toBe(0);
    expect(isolated.exitCode, isolated.output).toBe(0);
    expect(hashed.exitCode, hashed.output).toBe(0);
    const materializeDocument = JSON.parse(materialized.output) as { calibrationSetsHash: string };
    const isolateDocument = JSON.parse(isolated.output) as { calibrationSetsHash: string; passed: boolean };
    const hashDocument = JSON.parse(hashed.output) as { calibrationSetsHash: string };
    expect(isolateDocument.passed).toBe(true);
    expect(materializeDocument.calibrationSetsHash).toBe(snapshotManifest.resolved.calibration_sets_hash);
    expect(isolateDocument.calibrationSetsHash).toBe(snapshotManifest.resolved.calibration_sets_hash);
    expect(hashDocument.calibrationSetsHash).toBe(snapshotManifest.resolved.calibration_sets_hash);

    await writeFile(join(workspace, "incubator", "calibration-bases", "injection-calibration", "v1", "react-vite", "sample", "v1", "source", "src", "fixture.ts"), "export const fixture = 'changed';\n");
    const verification = await runSnapshot(workspace, "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(verification.exitCode).toBe(1);
    expect(verification.output).toContain("base digest does not match");
  } finally {
    await rm(workspace, { force: true, recursive: true });
    await rm(output, { force: true, recursive: true });
  }
});

test("kernel-backed suite task receives a resolved snapshot", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-resolved-task-"));
  try {
    const task = await createKernelTask(workspace);
    const writeResult = await runSnapshot(workspace, "--write", "kernel-suite", "kernel-task/v1");
    expect(writeResult.exitCode).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(task, "private", "snapshot.json")).text());
    expect(manifest.resolved.profile).toBe("treatment-comparison/v1");
    expect(manifest.resolved.materialized_output_hash).toBeString();
    const verifyResult = await runSnapshot(workspace, "kernel-suite", "kernel-task/v1");
    expect(verifyResult.exitCode).toBe(0);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("malformed or unknown kernel declarations fail snapshot generation", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-invalid-kernel-"));
  try {
    const candidate = await createKernelCandidate(workspace);
    const declaration = join(candidate, "private", "candidate.yaml");
    await writeFile(declaration, "kernel:\n  core: v2\n  profile: unknown/v1\n  materializer_kind: unknown\n");
    const coreResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(coreResult.exitCode).toBe(1);
    expect(coreResult.output).toContain("Unsupported kernel core");

    await writeFile(declaration, "kernel:\n  core: v1\n  profile: unknown/v1\n  materializer_kind: react-vite\n");
    const profileResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(profileResult.exitCode).toBe(1);
    expect(profileResult.output).toContain("Unsupported kernel profile");

    await writeFile(declaration, "kernel: invalid\n");
    const malformedResult = await runSnapshot(workspace, "--write", "--incubator", "practice-injection", "kernel-test-candidate-v1");
    expect(malformedResult.exitCode).toBe(1);
    expect(malformedResult.output).toContain("Invalid kernel declaration");
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
