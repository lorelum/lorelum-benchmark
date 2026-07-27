import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { generateUnifiedDiff } from "./unified-diff";

const candidateRoot = join(import.meta.dir, "../..");
const repositoryRoot = join(candidateRoot, "../../..");
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
  expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  expect(plan.workspace_template).toEqual(["task.md", "app/**"]);
  expect(plan.workspace_template.join("\n")).not.toContain("private");
});

test("rejects local output outside ignored scratch", async () => {
  const result = await execute(["--dry-run", "--output", "../outside-scratch"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Local output must stay inside ignored scratch/");
});

test("copies only the starter app source into each agent workspace", async () => {
  const output = "scratch/login-practice-local/test-workspace-boundary";
  const { wrapper, cleanup } = await createFakePi(true);
  try {
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: Array<{ initial_workspace_files: string[] }> };
    expect(summary.entries).toHaveLength(3);
    for (const entry of summary.entries) {
      expect(entry.initial_workspace_files).toContain("app/package.json");
      expect(entry.initial_workspace_files.some((file) => file.startsWith("app/app/"))).toBeFalse();
      expect(entry.initial_workspace_files.some((file) => file.includes("node_modules/") || file.includes("dist/"))).toBeFalse();
    }
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("generates a unified diff covering identical, modified, added, and deleted files with forward-slash paths", async () => {
  const leftRoot = await mkdtemp(join(tmpdir(), "lorelum-diff-left-"));
  const rightRoot = await mkdtemp(join(tmpdir(), "lorelum-diff-right-"));
  try {
    // identical file -> empty diff contribution
    await writeFile(join(leftRoot, "same.txt"), "line one\nline two\n");
    await writeFile(join(rightRoot, "same.txt"), "line one\nline two\n");
    // modified file -> --- / +++ with - and + lines
    await writeFile(join(leftRoot, "changed.txt"), "alpha\nbeta\ngamma\n");
    await writeFile(join(rightRoot, "changed.txt"), "alpha\nBETA\ngamma\n");
    // added file -> only plus lines
    await writeFile(join(rightRoot, "added.txt"), "new file\n");
    // deleted file -> only minus lines
    await writeFile(join(leftRoot, "removed.txt"), "gone\n");
    // nested directory with a path that would contain backslashes on Windows
    await mkdir(join(rightRoot, "src", "features"), { recursive: true });
    await mkdir(join(leftRoot, "src", "features"), { recursive: true });
    await writeFile(join(leftRoot, "src", "features", "old.ts"), "export const x = 1;\n");
    await writeFile(join(rightRoot, "src", "features", "new.ts"), "export const y = 2;\n");

    const diff = await generateUnifiedDiff(leftRoot, rightRoot);

    // identical file produces no diff output
    expect(diff).not.toContain("same.txt");

    // modified file
    expect(diff).toContain("--- a/changed.txt");
    expect(diff).toContain("+++ b/changed.txt");
    expect(diff).toContain("-beta\n");
    expect(diff).toContain("+BETA\n");

    // added file
    expect(diff).toContain("--- a/added.txt");
    expect(diff).toContain("+++ b/added.txt");
    expect(diff).toContain("+new file\n");

    // deleted file
    expect(diff).toContain("--- a/removed.txt");
    expect(diff).toContain("+++ b/removed.txt");
    expect(diff).toContain("-gone\n");

    // nested paths use forward slashes, never backslashes
    expect(diff).toContain("src/features/new.ts");
    expect(diff).toContain("src/features/old.ts");
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

test("preflight fails when the model endpoint is unreachable and does not create a summary", async () => {
  const output = "scratch/login-practice-local/test-preflight-fail";
  const { wrapper, cleanup } = await createFakePi(false);
  try {
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("model unreachable");
    expect(await Bun.file(join(repositoryRoot, output, "summary.json")).exists()).toBeFalse();
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight succeeds and enters the run loop, producing a summary", async () => {
  const output = "scratch/login-practice-local/test-preflight-success";
  const { wrapper, cleanup } = await createFakePi(true);
  try {
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { entries: unknown[] };
    expect(summary.entries).toHaveLength(3);
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight failure message does not leak the API key", async () => {
  const output = "scratch/login-practice-local/test-preflight-leak";
  const { wrapper, cleanup } = await createFakePi(false, "error: invalid api key sk-1234567890abcdef");
  try {
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("model unreachable");
    expect(result.stderr).not.toContain("sk-1234567890abcdef");
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("preflight fallback redacts a bearer token from provider stderr", async () => {
  const output = "scratch/login-practice-local/test-preflight-bearer";
  const token = "tok_live1";
  const { wrapper, cleanup } = await createFakePi(false, `provider rejected request: Authorization: Bearer ${token}`);
  try {
    const result = await execute(["--output", output, "--repeat", "1"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("model unreachable: provider rejected request");
    expect(result.stderr).not.toContain(token);
    expect(await Bun.file(join(repositoryRoot, output, "summary.json")).exists()).toBeFalse();
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
    expect(plan.planned_runs.map((entry) => entry.condition)).toEqual(["baseline", "oracle-practice", "irrelevant-practice"]);
  } finally {
    await cleanup();
  }
});
