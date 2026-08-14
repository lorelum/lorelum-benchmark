import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { generateUnifiedDiff } from "./unified-diff";

const candidateRoot = join(import.meta.dir, "../..");
const repositoryRoot = resolve(candidateRoot, "../../..");
const script = join(import.meta.dir, "run-local.ts");

async function execute(args: string[], env = Bun.env): Promise<{ code: number; stdout: string; stderr: string }> {
  // 测试隔离：禁用真实 LLM judge，避免仓库 .env 的 LORELUM_JUDGE_REAL=1 使 quality pilot 走真实模型调用。
  const isolatedEnv = { ...env, LORELUM_JUDGE_REAL: "0" };
  const child = Bun.spawn([process.execPath, "run", script, ...args], { cwd: repositoryRoot, env: isolatedEnv, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
}

test("dry-run plans the discovery gate before an optional quality pilot", async () => {
  const result = await execute(["--dry-run", "--repeat", "1"]);
  expect(result.code).toBe(0);
  const plan = JSON.parse(result.stdout) as { discovery_gate: { planned_runs: Array<{ condition: string }> }; quality_pilot: string; workspace_template: string[] };
  expect(plan.discovery_gate.planned_runs.map((entry) => entry.condition)).toEqual(["lorelum-retrieval"]);
  expect(plan.quality_pilot).toBe("not-requested");
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
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { discovery_gate: { attempts: Array<{ initial_workspace_files: string[]; condition: string }> } };
    expect(summary.discovery_gate.attempts).toHaveLength(1);
    for (const entry of summary.discovery_gate.attempts) {
      expect(entry.initial_workspace_files).toContain("app/package.json");
      expect(entry.initial_workspace_files.some((file) => file.includes("node_modules/") || file.includes("dist/"))).toBeFalse();
      expect(entry.initial_workspace_files.some((file) => file.includes("private/") || file.includes("practices/"))).toBeFalse();
    }
    const settings = await Bun.file(join(repositoryRoot, output, "discovery-gate", "lorelum-retrieval", "attempt-1", "pi-agent", "settings.json")).json() as { shellPath: string };
    expect(settings.shellPath).toBe("D:/ad/Git/bin/bash.exe");
    expect(await Bun.file(join(repositoryRoot, output, "discovery-gate", "lorelum-retrieval", "attempt-1", "workspace", ".pi", "settings.json")).exists()).toBeFalse();
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
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { discovery_gate: { attempts: Array<{ condition: string; trace: { channel: string; complete?: boolean; events: Array<{ event: string }> } }> } };
    const lorelum = summary.discovery_gate.attempts[0];
    expect(lorelum.condition).toBe("lorelum-retrieval");
    expect(lorelum.trace.channel).toBe("mock-retrieval-tool-call");
    expect(lorelum.trace.events).toHaveLength(0);
    expect(lorelum.trace.complete).toBeFalse();
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
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { discovery_gate: { status: string; attempts: unknown[] }; quality_pilot: string };
    expect(summary.discovery_gate.status).toBe("fail");
    expect(summary.discovery_gate.attempts).toHaveLength(1);
    expect(summary.quality_pilot).toBe("blocked");
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("marks extension errors invalid and excludes them from a signal", async () => {
  const output = "scratch/skill-trigger-local/test-extension-invalid";
  const { wrapper, cleanup } = await createFakePi(true, "error: connection refused", true);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { outcome: string; discovery_gate: { attempts: Array<{ validity: { valid: boolean; reasons: string[] } }> } };
    expect(summary.outcome).toBe("diagnostic-only");
    expect(summary.discovery_gate.attempts.every((entry) => entry.validity.valid === false)).toBeTrue();
    expect(summary.discovery_gate.attempts.every((entry) => entry.validity.reasons.includes("extension error in Pi stderr"))).toBeTrue();
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
    const plan = JSON.parse(result.stdout) as { discovery_gate: { planned_runs: Array<{ condition: string }> } };
    expect(plan.discovery_gate.planned_runs.map((entry) => entry.condition)).toEqual(["lorelum-retrieval"]);
  } finally {
    await cleanup();
  }
});

test("forced tool qualification is isolated from discovery and quality results", async () => {
  const output = "scratch/skill-trigger-local/test-tool-qualification";
  const { wrapper, cleanup } = await createFakePi(true, "error: connection refused", false, true);
  try {
    const result = await execute(["--output", output, "--qualification"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper, LORELUM_REQUIRE_EXTENSION: "1" });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as {
      qualification: { status: string; trace: { complete: boolean }; query_anchored: boolean; agent_workspace_files: string[] };
      discovery_gate: string;
      quality_pilot: string;
      outcome: string;
    };
    expect(summary.qualification.status).toBe("pass");
    expect(summary.qualification.trace.complete).toBeTrue();
    expect(summary.qualification.query_anchored).toBeTrue();
    expect(summary.qualification.agent_workspace_files.some((file) => file.includes("private/") || file.includes("practices/"))).toBeFalse();
    expect(summary.discovery_gate).toBe("not-run");
    expect(summary.quality_pilot).toBe("not-run");
    expect(summary.outcome).toBe("not-an-experiment");
    expect(await Bun.file(join(repositoryRoot, output, "tool-qualification", "attempt-1", "evaluator.stdout.log")).exists()).toBeFalse();
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
  }
});

test("quality pilot starts only after every discovery-gate attempt has a complete trace", async () => {
  const output = "scratch/skill-trigger-local/test-discovery-gate-pass";
  const { wrapper, cleanup } = await createFakePi(true, "error: connection refused", false, true);
  try {
    const result = await execute(["--output", output, "--repeat", "1", "--skip-install", "--quality-pilot"], { ...Bun.env, LORELUM_PI_COMMAND: wrapper });
    expect(result.code).toBe(0);
    const summary = await Bun.file(join(repositoryRoot, output, "summary.json")).json() as { discovery_gate: { status: string }; entries: Array<{ condition: string }> };
    expect(summary.discovery_gate.status).toBe("pass");
    expect(summary.entries.map((entry) => entry.condition)).toEqual(["baseline", "lorelum-retrieval", "irrelevant-practice"]);
  } finally {
    await cleanup();
    await rm(join(repositoryRoot, output), { recursive: true, force: true });
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

async function createFakePi(succeedPrint: boolean, failureMessage = "error: connection refused", emitExtensionError = false, emitDiscoveryTrace = false): Promise<{ wrapper: string; cleanup: () => Promise<void> }> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "lorelum-fake-pi-"));
  const fakeTs = join(fixtureRoot, "fake-pi.ts");
  const versionBranch = 'if (a.includes("--version")) { console.log("0.80.10"); process.exit(0); }';
  const printBranch = succeedPrint
    ? `if (a.includes("--print")) { const agentCall = a.includes("@task.md") || a.some((value) => value.includes("Use the read tool to read task.md")); if (process.env.LORELUM_REQUIRE_EXTENSION === "1" && agentCall && !a.includes("--extension")) { process.stderr.write("missing extension\\n"); process.exit(2); } if (${emitExtensionError ? "true" : "false"} && agentCall) process.stderr.write("Extension error (test): observation failed\\n"); if (${emitDiscoveryTrace ? "true" : "false"} && agentCall && process.env.LORELUM_MOCK_AUDIT_PATH) appendFileSync(process.env.LORELUM_MOCK_AUDIT_PATH, ["public_input_read", "skill_discovered", "skill_loaded", "practice_query_issued", "practice_query_resolved"].map((event) => JSON.stringify({ event, query_id: "query-1", public_refs: [{ path: "task.md", sha256: "task-hash" }] })).join("\\n") + "\\n"); console.log("ok"); process.exit(0); }`
    : `if (a.includes("--print")) { process.stderr.write(${JSON.stringify(`${failureMessage}\n`)}); process.exit(1); }`;
  await writeFile(fakeTs, 'import { appendFileSync } from "node:fs"; const a = process.argv.slice(2); ' + versionBranch + ' ' + printBranch + ' console.error("unknown args"); process.exit(1);');
  const isWin = process.platform === "win32";
  const wrapperPath = isWin ? join(fixtureRoot, "fake-pi.cmd") : join(fixtureRoot, "fake-pi");
  const wrapper = isWin
    ? "@echo off\r\n\"" + process.execPath + "\" \"" + fakeTs + "\" %*\r\n"
    : "#!/bin/sh\nexec \"" + process.execPath + "\" \"" + fakeTs + "\" \"$@\"\n";
  await writeFile(wrapperPath, wrapper);
  if (!isWin) { const { chmod } = await import("node:fs/promises"); await chmod(wrapperPath, 0o755); }
  return { wrapper: wrapperPath, cleanup: async () => { await rm(fixtureRoot, { recursive: true, force: true }); } };
}
