import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { workspaceRoot } from "../../../fs";

const runId = `fake-pi-${Date.now()}`;
const tempDirectory = join("/tmp", `lorelum-${runId}`);
const fakePi = join(tempDirectory, "fake-pi.sh");
const requestPath = join(tempDirectory, "request.json");
const artifactDirectory = join(workspaceRoot, "artifacts", "runs", runId);
const recordPath = join(workspaceRoot, "results", "records", "react-skill-comparison", "async-dashboard", `${runId}.json`);

beforeAll(async () => {
  await mkdir(tempDirectory, { recursive: true });
  await Bun.write(fakePi, "#!/bin/sh\nprintf 'fake pi ran\\n'\nprintf '// fake coordinator change\\n' >> \"$CANDIDATE_PATH\"\nexit 7\n");
  await chmod(fakePi, 0o755);
  await Bun.write(requestPath, `${JSON.stringify({
    schema_version: "pi-run/v1",
    run_id: runId,
    candidate_path: "starter/src/dashboard.ts",
    suite: { id: "react-skill-comparison", version: "0.1.0" },
    task: { id: "async-dashboard-v1", revision: "v1", snapshot_id: JSON.parse(await Bun.file(join(workspaceRoot, "suites/react-skill-comparison/tasks/async-dashboard/v1/private/snapshot.json")).text()).snapshot_id },
    treatment: { id: "baseline", version: "v1" },
    environment: { id: "local-bun-deepseek-v4-pro", version: "v1" },
    scorer: { id: "async-dashboard", version: "v1" },
    agent: { id: "pi", version: "0.73.1", model: "deepseek/deepseek-v4-pro", system_prompt_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    execution: { command: fakePi, args: [], cwd: ".", seed: 1, budget: { max_turns: 2, max_duration_ms: 30000 }, tool_policy_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    inputs: {},
    artifacts: [
      { kind: "raw-output", uri: `artifacts/runs/${runId}/fake.stdout` },
      { kind: "patch", uri: `artifacts/runs/${runId}/fake.patch` },
      { kind: "evaluator-output", uri: `artifacts/runs/${runId}/fake.eval` },
      { kind: "environment", uri: `artifacts/runs/${runId}/fake.request` },
      { kind: "trace", uri: `artifacts/runs/${runId}/fake.prompt` },
    ],
  }, null, 2)}\n`);
});

afterAll(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
  await rm(artifactDirectory, { recursive: true, force: true });
  await rm(recordPath, { force: true });
});

describe("Pi coordinator", () => {
  test("dry-run validates without creating a run", async () => {
    const process = Bun.spawn(["bun", "run", "src/benchmark/runner/pi/v1/coordinator.ts", requestPath, "--dry-run"], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" });
    const output = await new Response(process.stdout).text();
    expect(await process.exited).toBe(0);
    expect(output).toContain(`"run_id": "${runId}"`);
    expect(await Bun.file(join(artifactDirectory, "run-manifest.json")).exists()).toBe(false);
  });

  test("captures Pi, evaluator, diff, manifest, and record", async () => {
    const process = Bun.spawn(["bun", "run", "src/benchmark/runner/pi/v1/coordinator.ts", requestPath], { cwd: workspaceRoot, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    expect(stdout).toContain('"status": "failed"');
    const manifest = JSON.parse(await Bun.file(join(artifactDirectory, "run-manifest.json")).text()) as { schema_version: string; artifacts: Array<{ sha256: string }>; exit_code: number };
    expect(manifest.schema_version).toBe("run-manifest/v1");
    expect(manifest.exit_code).toBe(7);
    expect(manifest.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(true);
    expect(manifest.artifacts.some((artifact) => artifact.uri.endsWith("fake.stdout"))).toBe(true);
    expect(await Bun.file(join(artifactDirectory, "workspace", "task.md")).exists()).toBe(true);
    expect(await Bun.file(join(artifactDirectory, "workspace", "private")).exists()).toBe(false);
    expect(await Bun.file(recordPath).exists()).toBe(true);
  });
});
