import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
  await mkdir(join(candidate, ".materialized", "public"), { recursive: true });
  await Bun.write(join(candidate, ".materialized", "public", "task.md"), "# Generated\n");
  await mkdir(join(candidate, "public", "starter", ".vite"), { recursive: true });
  await Bun.write(join(candidate, "public", "starter", ".vite", "cache"), "cache\n");
  await mkdir(join(candidate, "logs"), { recursive: true });
  await Bun.write(join(candidate, "logs", "run.log"), "generated\n");
  await mkdir(join(candidate, ".practice-runtime"), { recursive: true });
  await Bun.write(join(candidate, ".practice-runtime", "trace.json"), "generated\n");
  await Bun.write(join(candidate, "private", "oracle.yaml"), "id: example-candidate-v1\n");
  await Bun.write(join(candidate, "private", "evaluator", ".env.example"), "TEST_PORT=3001\n");
  await mkdir(join(candidate, "private", "evidence-index"), { recursive: true });
  await Bun.write(join(candidate, "private", "evidence-index", "attempt-001.yaml"), "artifact: s3://example/attempt-001\n");
  return workspace;
}

async function sha256(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Bun.file(path).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createInjectionCandidateWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "lorelum-injection-snapshot-"));
  const candidate = join(workspace, "incubator", "candidates", "injection-candidate");
  const practices = join(candidate, "private", "practices");
  await mkdir(join(candidate, "public", "starter", "src"), { recursive: true });
  await mkdir(practices, { recursive: true });
  await Bun.write(join(candidate, "public", "task.md"), "# Injection candidate\n");
  await Bun.write(join(candidate, "public", "starter", "package.json"), "{\"scripts\":{\"test\":\"true\"}}\n");
  await Bun.write(join(candidate, "public", "starter", "src", "index.ts"), "export const value = 1;\n");
  await Bun.write(join(candidate, "private", "candidate.yaml"), [
    "id: injection-candidate", "kernel:", "  core: v1", "  profile: injection-calibration/v1", "  materializer_kind: react-vite", ""
  ].join("\n"));
  const oraclePath = join(practices, "oracle.md");
  const irrelevantPath = join(practices, "irrelevant.md");
  const oracleText = "private oracle Practice text\n";
  const irrelevantText = "private irrelevant Practice text\n";
  await Bun.write(oraclePath, oracleText);
  await Bun.write(irrelevantPath, irrelevantText);
  const oracleHash = await sha256(oraclePath);
  const irrelevantHash = await sha256(irrelevantPath);
  const oracleCharacters = [...oracleText].length;
  const irrelevantCharacters = [...irrelevantText].length;
  const relativeDifference = Math.abs(oracleCharacters - irrelevantCharacters) / oracleCharacters;
  const maximumRelativeDifference = relativeDifference + 0.01;
  await Bun.write(join(practices, "metadata.yaml"), [
    "delivery_template: practice-card/v1", "length_metric: practice-card/v1:utf8-rendered-characters", "cards:",
    "  - id: test.oracle", "    version: v1", "    path: oracle.md", `    rendered_characters: ${oracleCharacters}`,
    "  - id: test.irrelevant", "    version: v1", "    path: irrelevant.md", `    rendered_characters: ${irrelevantCharacters}`,
    "comparison:", `  maximum_relative_difference: ${maximumRelativeDifference}`, `  actual_relative_difference: ${relativeDifference}`, "  independently_reviewed: true", ""
  ].join("\n"));
  await Bun.write(join(candidate, "private", "conditions.yaml"), [
    "conditions:", "  - id: baseline", "    status: declared", "    practice: none",
    "  - id: oracle-practice", "    status: declared", "    practice:", "      path: private/practices/oracle.md", "      injection_channel: condition-scoped-private-runtime", `      sha256: \"${oracleHash}\"`,
    "  - id: irrelevant-practice", "    status: declared", "    practice:", "      path: private/practices/irrelevant.md", "      injection_channel: condition-scoped-private-runtime", `      sha256: \"${irrelevantHash}\"`,
    "  - id: lorelum-retrieval", "    status: unavailable", "    practice: unavailable",
    "decision_rule:", "  metric: joint-pass-count", "  oracle_relation: strictly-greater-than-each-control", "  controls: [baseline, irrelevant-practice]", "  otherwise: diagnostic-only", ""
  ].join("\n"));
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
    expect(manifest.files[".materialized/public/task.md"]).toBeUndefined();
    expect(manifest.files["public/starter/.vite/cache"]).toBeUndefined();
    expect(manifest.files["logs/run.log"]).toBeUndefined();
    expect(manifest.files[".practice-runtime/trace.json"]).toBeUndefined();
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

test("binds validated Practice inputs to the resolved snapshot without exposing text or paths", async () => {
  const workspace = await createInjectionCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "injection-candidate");
  try {
    const writeResult = await runSnapshot(workspace, "--write", "--incubator", "candidates", "injection-candidate");
    expect(writeResult.exitCode, writeResult.output).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text()) as { files: Record<string, string>; resolved: Record<string, string> };
    expect(manifest.resolved.profile_input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.files["private/practices/oracle.md"]).toBeUndefined();
    expect(manifest.files["private/practices/irrelevant.md"]).toBeUndefined();
    expect(manifest.files["private/practices/metadata.yaml"]).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain("private/practices");
    const resolvedText = JSON.stringify(manifest.resolved);
    expect(resolvedText).not.toContain("private oracle Practice text");
    expect(resolvedText).not.toContain("private/practices");

    const metadataPath = join(candidate, "private", "practices", "metadata.yaml");
    await Bun.write(metadataPath, (await Bun.file(metadataPath).text()).replace(/maximum_relative_difference: ([0-9.]+)/, (_, value) => `maximum_relative_difference: ${Number(value) + 0.01}`));
    const result = await runSnapshot(workspace, "--incubator", "candidates", "injection-candidate");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Resolved snapshot mismatch");
    expect(result.output).toContain("profile_input_hash");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("keeps the legacy #75 candidate on its non-kernel snapshot path", async () => {
  const result = await runSnapshot(root, "--incubator", "practice-injection", "login-page-layered-api-v1");
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("Snapshots are intact.");
});
test("v2 writes a canonical tree root without a files manifest and verifies across clean checkouts", async () => {
  const workspace1 = await createCandidateWorkspace();
  const workspace2 = await createCandidateWorkspace();
  const candidate1 = join(workspace1, "incubator", "candidates", "example-candidate");
  const candidate2 = join(workspace2, "incubator", "candidates", "example-candidate");
  try {
    const write1 = await runSnapshot(workspace1, "--write", "--v2", "--incubator", "candidates", "example-candidate");
    expect(write1.exitCode, write1.output).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(candidate1, "private", "snapshot.json")).text());
    expect(manifest.version).toBe(2);
    expect(manifest.algorithm).toBe("sha256-merkle");
    expect(manifest.snapshot_id).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.files).toBeUndefined();
    expect(manifest.resolved).toBeUndefined();

    const write2 = await runSnapshot(workspace2, "--write", "--v2", "--incubator", "candidates", "example-candidate");
    expect(write2.exitCode, write2.output).toBe(0);
    const manifest2 = JSON.parse(await Bun.file(join(candidate2, "private", "snapshot.json")).text());
    expect(manifest2.snapshot_id).toBe(manifest.snapshot_id);

    const verify = await runSnapshot(workspace1, "--incubator", "candidates", "example-candidate");
    expect(verify.exitCode, verify.output).toBe(0);
    expect(verify.output).toContain("Snapshots are intact.");
  } finally {
    await rm(workspace1, { force: true, recursive: true });
    await rm(workspace2, { force: true, recursive: true });
  }
});

test("v2 fails when content changes, files are added, deleted, or renamed", async () => {
  const workspace = await createCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  try {
    await runSnapshot(workspace, "--write", "--v2", "--incubator", "candidates", "example-candidate");

    await writeFile(join(candidate, "public", "starter", ".env.example"), "PORT=4000\n");
    const contentChanged = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(contentChanged.exitCode).toBe(1);
    expect(contentChanged.output).toContain("snapshot_id");
    expect(contentChanged.output).toContain("tree-leaf");

    await writeFile(join(candidate, "public", "starter", ".env.example"), "PORT=3000\n");
    await writeFile(join(candidate, "public", "starter", "new-file.ts"), "export const x = 1;\n");
    const added = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(added.exitCode).toBe(1);
    expect(added.output).toContain("snapshot_id");
    expect(added.output).toContain("new-file.ts");

    await rm(join(candidate, "public", "starter", "new-file.ts"), { force: true });
    const addedResolved = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(addedResolved.exitCode).toBe(0);

    await rm(join(candidate, "private", "oracle.yaml"), { force: true });
    const deleted = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(deleted.exitCode).toBe(1);
    expect(deleted.output).toContain("snapshot_id");

    await writeFile(join(candidate, "private", "oracle.yaml"), "id: example-candidate-v1\n");
    await writeFile(join(candidate, "private", "renamed-oracle.yaml"), "id: example-candidate-v1\n");
    const renamed = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(renamed.exitCode).toBe(1);
    expect(renamed.output).toContain("snapshot_id");
    expect(renamed.output).toContain("renamed-oracle.yaml");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("v2 rejects symbolic links and excludes generated output", async () => {
  const workspace = await createCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  try {
    const verify = await runSnapshot(workspace, "--write", "--v2", "--incubator", "candidates", "example-candidate");
    expect(verify.exitCode, verify.output).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(JSON.stringify(manifest)).not.toContain("node_modules");
    expect(JSON.stringify(manifest)).not.toContain("dist/index.html");
    expect(JSON.stringify(manifest)).not.toContain(".materialized");
    expect(JSON.stringify(manifest)).not.toContain(".vite");
    expect(JSON.stringify(manifest)).not.toContain("logs/run.log");
    expect(JSON.stringify(manifest)).not.toContain(".practice-runtime");

    const linkPath = join(candidate, "public", "starter", "linked.ts");
    try {
      await symlink(join(candidate, "public", "starter", ".env.example"), linkPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    const linkResult = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(linkResult.exitCode).toBe(1);
    expect(linkResult.output).toContain("symbolic link is not allowed");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("v2 coexists with v1 and does not touch v1 snapshots", async () => {
  const workspace = await createCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  try {
    const v1Write = await runSnapshot(workspace, "--write", "--incubator", "candidates", "example-candidate");
    expect(v1Write.exitCode, v1Write.output).toBe(0);
    const v1Manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(v1Manifest.version).toBe(1);
    expect(v1Manifest.files).toBeObject();

    const v1Verify = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(v1Verify.exitCode, v1Verify.output).toBe(0);
    expect(v1Verify.output).toContain("Snapshots are intact.");

    const v2Write = await runSnapshot(workspace, "--write", "--v2", "--incubator", "candidates", "example-candidate");
    expect(v2Write.exitCode, v2Write.output).toBe(0);
    const v2Manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(v2Manifest.version).toBe(2);
    expect(v2Manifest.files).toBeUndefined();

    const v2Verify = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(v2Verify.exitCode, v2Verify.output).toBe(0);
    expect(v2Verify.output).toContain("Snapshots are intact.");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("v2 rejects malformed snapshot schema", async () => {
  const workspace = await createCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "example-candidate");
  try {
    await mkdir(join(candidate, "private"), { recursive: true });
    await writeFile(join(candidate, "private", "snapshot.json"), JSON.stringify({ version: 2, algorithm: "unknown", snapshot_id: "abc" }));
    const result = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unsupported snapshot format");

    await writeFile(join(candidate, "private", "snapshot.json"), JSON.stringify({ version: 3, algorithm: "sha256", snapshot_id: "abc" }));
    const result2 = await runSnapshot(workspace, "--incubator", "candidates", "example-candidate");
    expect(result2.exitCode).toBe(1);
    expect(result2.output).toContain("Unsupported snapshot format");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});

test("v2 excludes Practice text and private/practices paths for injection-calibration profile", async () => {
  const workspace = await createInjectionCandidateWorkspace();
  const candidate = join(workspace, "incubator", "candidates", "injection-candidate");
  try {
    const writeResult = await runSnapshot(workspace, "--write", "--v2", "--incubator", "candidates", "injection-candidate");
    expect(writeResult.exitCode, writeResult.output).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text());
    expect(manifest.version).toBe(2);
    expect(manifest.resolved.profile_input_hash).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("private oracle Practice text");
    expect(serialized).not.toContain("private irrelevant Practice text");
    expect(serialized).not.toContain("private/practices");

    const verify = await runSnapshot(workspace, "--incubator", "candidates", "injection-candidate");
    expect(verify.exitCode, verify.output).toBe(0);

    const metadataPath = join(candidate, "private", "practices", "metadata.yaml");
    const metadataText = await Bun.file(metadataPath).text();
    await writeFile(metadataPath, metadataText.replace(/maximum_relative_difference: ([0-9.]+)/, (_, value) => `maximum_relative_difference: ${Number(value) + 0.01}`));
    const failResult = await runSnapshot(workspace, "--incubator", "candidates", "injection-candidate");
    expect(failResult.exitCode).toBe(1);
    expect(failResult.output).toContain("Resolved snapshot mismatch");
    expect(failResult.output).toContain("profile_input_hash");
    expect(failResult.output).not.toContain("private oracle Practice text");
    expect(failResult.output).not.toContain("private/practices");
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});