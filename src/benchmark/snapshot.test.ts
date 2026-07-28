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
  await Bun.write(oraclePath, "private oracle Practice text\n");
  await Bun.write(irrelevantPath, "private irrelevant Practice text\n");
  const oracleHash = await sha256(oraclePath);
  const irrelevantHash = await sha256(irrelevantPath);
  await Bun.write(join(practices, "metadata.yaml"), [
    "delivery_template: practice-card/v1", "length_metric: utf8-rendered-characters", "cards:",
    "  - id: test.oracle", "    version: v1", "    path: oracle.md", "    rendered_characters: 100",
    "  - id: test.irrelevant", "    version: v1", "    path: irrelevant.md", "    rendered_characters: 95",
    "comparison:", "  maximum_relative_difference: 0.10", "  actual_relative_difference: 0.05", "  independently_reviewed: true", ""
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
    expect((await runSnapshot(workspace, "--write", "--incubator", "candidates", "injection-candidate")).exitCode).toBe(0);
    const manifest = JSON.parse(await Bun.file(join(candidate, "private", "snapshot.json")).text()) as { resolved: Record<string, string> };
    expect(manifest.resolved.profile_input_hash).toMatch(/^[a-f0-9]{64}$/);
    const resolvedText = JSON.stringify(manifest.resolved);
    expect(resolvedText).not.toContain("private oracle Practice text");
    expect(resolvedText).not.toContain("private/practices");

    await Bun.write(join(candidate, "private", "practices", "metadata.yaml"), (await Bun.file(join(candidate, "private", "practices", "metadata.yaml")).text()).replace("maximum_relative_difference: 0.10", "maximum_relative_difference: 0.06"));
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
