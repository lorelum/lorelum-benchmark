import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { generateUnifiedDiff } from "./unified-diff";

const candidateRoot = join(import.meta.dir, "../..");
const repositoryRoot = resolve(candidateRoot, "../../..");
const script = join(import.meta.dir, "run-local.ts");

async function execute(args: string[], env = Bun.env): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, "run", script, ...args], { cwd: repositoryRoot, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

test("dry-run plans only the three declared conditions and a public workspace", async () => {
  const result = await execute(["--dry-run", "--repeat", "1"]);
  expect(result.code).toBe(0);
  const plan = JSON.parse(result.stdout) as { planned_runs: Array<{ condition: string }>; workspace_template: string[] };
  expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "lorelum-retrieval", "irrelevant-practice"]);
  expect(plan.workspace_template).toEqual(["task.md", "app/**"]);
  expect(plan.workspace_template.join("\n")).not.toContain("private");
});

test("rejects local output outside ignored scratch", async () => {
  const result = await execute(["--dry-run", "--output", "../outside-scratch"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Local output must stay inside ignored scratch/");
});

test("copies only the starter app source into each agent workspace", async () => {
  const output = "scratch/skill-trigger-local/test-workspace-boundary";
  const { wrapper, cleanup } = await createFakePi(true);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: Array<{ initial_workspace_files: string[]; condition: string }> };
    expect(summary.entries).toHaveLength(3);
    for (const entry of summary.entries) {
      expect(entry.initial_workspace_files).toContain("app/package.json");
      expect(entry.initial_workspace_files.some((file) => file.includes("node_modules/") || file.includes("dist/"))).toBeFalse();
      expect(entry.initial_workspace_files.some((file) => file.includes("private/") || file.includes("practices/"))).toBeFalse();
    }
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("runner never fabricates retrieval events when the agent did not call the extension", async () => {
  const output = "scratch/skill-trigger-local/test-trace-events";
  const { wrapper, cleanup } = await createFakePi(true);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: Array<{ condition: string; trace: { channel: string; complete?: boolean; events: Array<{ event: string }> } }> };
    const byCondition = new Map(summary.entries.map((e) => [e.condition, e]));
    expect(byCondition.get("baseline")!.trace.channel).toBe("none");
    expect(byCondition.get("baseline")!.trace.events).toHaveLength(0);
    const lorelum = byCondition.get("lorelum-retrieval")!;
    expect(lorelum.trace.channel).toBe("mock-retrieval-tool-call");
    expect(lorelum.trace.events).toHaveLength(0);
    expect(lorelum.trace.complete).toBeFalse();
    const irrelevant = byCondition.get("irrelevant-practice")!;
    expect(irrelevant.trace.events).toHaveLength(0);
    // trace must not contain Practice card text
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("异步副作用在组件卸载后不再影响状态");
    expect(serialized).not.toContain("private/practices");
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight fails when the model endpoint is unreachable and does not create a summary", async () => {
  const output = "scratch/skill-trigger-local/test-preflight-fail";
  const { wrapper, cleanup } = await createFakePi(false);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("model unreachable");
    expect(await Bun.file(join(repositoryRoot, output, "summary.json")).exists()).toBeFalse();
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight succeeds and enters the run loop, producing a summary", async () => {
  const output = "scratch/skill-trigger-local/test-preflight-success";
  const { wrapper, cleanup } = await createFakePi(true);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: unknown[] };
    expect(summary.entries).toHaveLength(3);
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight failure message does not leak the API key", async () => {
  const output = "scratch/skill-trigger-local/test-preflight-leak";
  const { wrapper, cleanup } = await createFakePi(false, "error: invalid api key sk-1234567890abcdef");
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("model unreachable");
    expect(result.stderr).not.toContain("sk-1234567890abcdef");
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("dry-run does not trigger the model preflight", async () => {
  const { wrapper, cleanup } = await createFakePi(false);
  try {
    const result = await execute(["--dry-run", "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const plan = JSON.parse(result.stdout) as { planned_runs: Array<{ condition: string }> };
    expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "lorelum-retrieval", "irrelevant-practice"]);
  } finally {
    await cleanup();
  }
});

test("generates a unified diff with forward-slash paths", async () => {
  const leftRoot = await mkdtemp(join(tmpdir(), "lorelum-diff-left-"));
  const rightRoot = await mkdtemp(join(tmpdir(), "lorelum-diff-right-"));
  try {
    await writeFile(join(leftRoot, "same.txt"), "line one\nline two\n");
    await writeFile(join(rightRoot, "same.txt"), "line one\nline two\n");
    await writeFile(join(leftRoot, "changed.txt"), "alpha\nbeta\ngamma\n");
    await writeFile(join(rightRoot, "changed.txt"), "alpha\nBETA\ngamma\n");
    const diff = await generateUnifiedDiff(leftRoot, rightRoot);
    expect(diff).not.toContain("same.txt");
    expect(diff).toContain("--- a/changed.txt");
    expect(diff).toContain("+BETA");
    expect(diff).not.toContain("\\");
  } finally {
    await rm(leftRoot, { recursive: true, force: true });
    await rm(rightRoot, { recursive: true, force: true });
  }
});

async function createFakePi(succeedPrint: boolean, failureMessage = "error: connection refused"): Promise<{ wrapper: string; cleanup: () => Promise<void> }> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "lorelum-fake-pi-"));
  const fakeTs = join(fixtureRoot, "fake-pi.ts");
  const versionBranch = 'if (a.includes("--version")) { console.log("0.80.10"); process.exit(0); }';
  const printBranch = succeedPrint
    ? 'if (a.includes("--print")) { console.log("ok"); process.exit(0); }'
    : `if (a.includes("--print")) { process.stderr.write(${JSON.stringify(`${failureMessage}\n`)}); process.exit(1); }`;
  await writeFile(fakeTs, 'const a = process.argv.slice(2); ' + versionBranch + ' ' + printBranch + ' console.error("unknown args"); process.exit(1);');
  const isWin = process.platform === "win32";
  const wrapperPath = isWin ? join(fixtureRoot, "fake-pi.cmd") : join(fixtureRoot, "fake-pi");
  const wrapper = isWin
    ? "@echo off\r\n\"" + process.execPath + "\" \"" + fakeTs + "\" %*\r\n"
    : "#!/bin/sh\nexec \"" + process.execPath + "\" \"" + fakeTs + "\" \"$@\"\n";
  await writeFile(wrapperPath, wrapper);
  if (!isWin) { const { chmod } = await import("node:fs/promises"); await chmod(wrapperPath, 0o755); }
  return { wrapper: wrapperPath, cleanup: async () => { await rm(fixtureRoot, { recursive: true, force: true }); } };
}
