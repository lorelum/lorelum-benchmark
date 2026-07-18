import { expect, test } from "bun:test";

const root = process.cwd();

test("generates stable single-repeat smoke requests with experiment provenance", async () => {
  const child = Bun.spawn([
    process.execPath,
    "run",
    "src/benchmark/runner/pi/request-generator.ts",
    "experiments/react-skill-comparison/g0-g1-smoke-v1.yaml",
    "--smoke",
    "--dry-run"
  ], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exitCode, stderr).toBe(0);
  const requests = JSON.parse(stdout) as Array<Record<string, unknown>>;
  expect(requests).toHaveLength(4);
  expect(new Set(requests.map((request) => request.run_id)).size).toBe(4);
  for (const request of requests) {
    expect(request.experiment_id).toBe("react-skill-comparison-g0-g1-smoke-v1");
    expect(request.run_kind).toBe("smoke");
    expect(request.condition_id).toMatch(/^(baseline|vercel-skill)$/);
    expect(request.repeat).toBe(1);
    expect(request.experiment_plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(request.run_id)).toMatch(/^react-skill-comparison-g0-g1-smoke-v1-.+-001$/);
    expect((request.agent as Record<string, unknown>).model_version).toBe("pending-provider-snapshot");
  }
});
