import { expect, test } from "bun:test";

const root = process.cwd();

test("generates stable two-repeat pilot requests with experiment provenance", async () => {
  const child = Bun.spawn([
    process.execPath,
    "run",
    "src/benchmark/runner/pi/request-generator.ts",
    "experiments/react-skill-comparison/g0-g1-fixture-pilot-v1.yaml",
    "--dry-run"
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exitCode, stderr).toBe(0);
  const requests = JSON.parse(stdout) as Array<Record<string, unknown>>;
  expect(requests).toHaveLength(12);
  expect(new Set(requests.map((request) => request.run_id)).size).toBe(12);
  for (const request of requests) {
    expect(request.experiment_id).toBe("react-skill-comparison-g0-g1-fixture-pilot-v1");
    expect(request.run_kind).toBe("pilot");
    expect(request.condition_id).toMatch(/^(baseline|vercel-skill)$/);
    expect([1, 2]).toContain(request.repeat);
    expect(request.experiment_plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(request.run_id)).toMatch(/^react-skill-comparison-g0-g1-fixture-pilot-v1-.+-(001|002)$/);
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
