import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const planId = `pi-request-generator-test-${crypto.randomUUID()}`;
const planPath = join(root, "experiments", "react-skill-comparison", `${planId}.yaml`);
const sourceCommit = (await new Response(Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout).text()).trim();

afterEach(async () => {
  await rm(planPath, { force: true });
});

async function writePlan(): Promise<void> {
  await Bun.write(planPath, [
    `id: ${planId}`,
    "version: v1",
    "lifecycle_stage: active",
    "run_kind: pilot",
    `source_commit: ${sourceCommit}`,
    "suite: { id: react-skill-comparison, version: 0.4.0 }",
    "conditions:",
    "  - { id: baseline, label: G0, treatment: baseline/v1 }",
    "  - { id: vercel-skill, label: G1, treatment: vercel-skill/v2 }",
    "smoke_tasks: [member-hub-loader-v2]",
    "full_tasks: [member-hub-loader-v2]",
    "environment: { id: formal-pi-deepseek-v4-pro, version: v1 }",
    "agent: { id: pi, version: 0.80.10, command: pi }",
    "model: { id: deepseek/deepseek-v4-pro, version: pending-provider-snapshot }",
    "repetitions: 2",
    "seed: 1",
    "budget: { max_turns: 20, max_duration_ms: 600000 }",
    "system_prompt_path: prompts/formal-pi/v1/system.md",
    "system_prompt_hash: a09d2451a34f2fb452bf4a35df308ded561aabbfe1b2ef3c0f143fe067bbd20a",
    "tool_policy_hash: 095f0cb4693f8753ecad07d0b86a0cb3e83c153f109b5b6e6a102eb819cb6dd2",
    ""
  ].join("\n"));
}

test("generates stable two-repeat pilot requests with experiment provenance", async () => {
  await writePlan();
  const child = Bun.spawn([
    process.execPath,
    "run",
    "src/benchmark/runner/pi/request-generator.ts",
    planPath,
    "--dry-run"
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exitCode, stderr).toBe(0);
  const requests = JSON.parse(stdout) as Array<Record<string, unknown>>;
  expect(requests).toHaveLength(4);
  expect(new Set(requests.map((request) => request.run_id)).size).toBe(4);
  for (const request of requests) {
    expect(request.experiment_id).toBe(planId);
    expect(request.run_kind).toBe("pilot");
    expect(request.condition_id).toMatch(/^(baseline|vercel-skill)$/);
    expect([1, 2]).toContain(request.repeat);
    expect(request.experiment_plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(request.run_id)).toMatch(new RegExp(`^${planId}-.+-(001|002)$`));
    expect((request.agent as Record<string, unknown>).model_version).toBe("pending-provider-snapshot");
  }
});

test("refuses to generate requests for a retired experiment plan", async () => {
  const child = Bun.spawn([
    process.execPath,
    "run",
    "src/benchmark/runner/pi/request-generator.ts",
    "experiments/react-skill-comparison/g0-g1-smoke-v1.yaml",
    "--smoke",
    "--dry-run"
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect(exitCode).toBe(1);
  expect(stderr).toContain("Experiment plan is retired");
});
