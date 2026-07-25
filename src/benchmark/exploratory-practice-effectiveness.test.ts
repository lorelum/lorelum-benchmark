import { expect, test } from "bun:test";

test("exploratory practice plan preflight verifies private references without running a model", async () => {
  const child = Bun.spawn([process.execPath, "run", "src/benchmark/exploratory-practice-effectiveness.ts", "preflight", "--plan", "v3", "--mode", "local-proxied"], { cwd: Bun.cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exitCode, stderr).toBe(0);
  expect(stdout).toContain("Exploratory plan preflight passed");
});

test("v3 Practice is a private Markdown document with pinned identity", async () => {
  const source = await Bun.file("src/benchmark/exploratory-practice-effectiveness.ts").text();
  expect(source).toContain('expected.content_path?.endsWith(".md")');
  expect(source).toContain("Markdown Practice front matter is missing");
});

test("local proxied mode overrides the Pi image entrypoint for the proxy", async () => {
  const source = await Bun.file("src/benchmark/exploratory-practice-effectiveness.ts").text();
  expect(source).toContain('"--entrypoint", "node", image, "/proxy/egress.mjs"');
});
