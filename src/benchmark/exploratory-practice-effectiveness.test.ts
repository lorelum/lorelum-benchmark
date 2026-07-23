import { expect, test } from "bun:test";

test("exploratory practice plan preflight verifies private references without running a model", async () => {
  const child = Bun.spawn([process.execPath, "run", "src/benchmark/exploratory-practice-effectiveness.ts", "preflight"], { cwd: Bun.cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exitCode, stderr).toBe(0);
  expect(stdout).toContain("Exploratory plan preflight passed");
});
