import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import type { CommandResult } from "../preflight";
import { demonstrateTimeoutTermination, parseSessionHeader, PiStageError, productionStagedPiAdapter, productionStagedSemanticAdapter, type StagedPilotPiConfig } from "./staged-pilot-pi-adapter";
import { classifyAttemptError, inspectStagedPilotCandidate, stagedPilotPlan, stagedPilotScheduleSeed } from "./staged-pilot-driver";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function temp(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "staged-pilot-")); roots.push(path); return path; }

const sessionLine = (id: string) => `{"type":"session","version":3,"id":"${id}","timestamp":"2026-09-01T00:00:00.000Z","cwd":"/tmp"}\n`;

function config(logDirectory: string): StagedPilotPiConfig {
  return { command: "pi", model: "deepseek/deepseek-v4-flash", tools: "read,bash", stage_budget_ms: { 1: 1_000, 2: 1_000 }, stage_instruction: { 1: "do stage 1", 2: "do stage 2" }, log_directory: logDirectory };
}
function fakeRunner(output: () => string, override: Partial<CommandResult> = {}) {
  const calls: string[][] = [];
  const runner = async (command: string[]): Promise<CommandResult> => {
    calls.push(command);
    return { code: 0, stdout: output(), stderr: "", timedOut: false, durationMs: 1, ...override } as CommandResult;
  };
  return { calls, runner: runner as unknown as (command: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult> };
}

test("session header parsing tolerates diagnostic lines and fails without a header", () => {
  expect(parseSessionHeader(`pi loading\n${sessionLine("abc")}`)).toBe("abc");
  expect(() => parseSessionHeader("no header at all")).toThrow("session header");
});

test("adapter starts and resumes the exact session id", async () => {
  const root = await temp();
  const artifacts = join(root, "artifacts");
  const sessionDir = join(artifacts, "sessions");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, "session-abc.jsonl"), sessionLine("abc"));
  const { calls, runner } = fakeRunner(() => sessionLine("abc"));
  const adapter = productionStagedPiAdapter(config(artifacts), runner);
  const invocation = { workspace: root, app: join(root, "app"), prompt_path: "task.md", session_dir: sessionDir };
  const started = await adapter.start({ ...invocation, stage: 1 });
  expect(started.session_id).toBe("abc");
  expect(calls[0]).toContain("--session-dir");
  expect(calls[0]).not.toContain("--session");
  const resumed = await adapter.resume({ ...invocation, stage: 2, session_id: "abc" });
  expect(resumed.session_id).toBe("abc");
  expect(calls[1].includes("--session")).toBe(true);
  expect(calls[1][calls[1].indexOf("--session") + 1]).toBe("abc");
});

test("adapter fails closed on resume id mismatch, non-zero exit, and timeout", async () => {
  const root = await temp();
  const artifacts = join(root, "artifacts");
  const sessionDir = join(artifacts, "sessions");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, "session-other.jsonl"), sessionLine("other"));
  const invocation = { workspace: root, app: join(root, "app"), prompt_path: "task.md", session_dir: sessionDir };
  const mismatch = productionStagedPiAdapter(config(artifacts), fakeRunner(() => sessionLine("other")).runner);
  await expect(mismatch.resume({ ...invocation, stage: 2, session_id: "abc" })).rejects.toThrow("resumed session other instead of abc");
  const crash = productionStagedPiAdapter(config(artifacts), fakeRunner(() => sessionLine("abc"), { code: 1 }).runner);
  await expect(crash.start({ ...invocation, stage: 1 })).rejects.toThrow("exited with code 1");
  const hung = productionStagedPiAdapter(config(artifacts), fakeRunner(() => sessionLine("abc"), { timedOut: true }).runner);
  await expect(hung.start({ ...invocation, stage: 1 })).rejects.toThrow("exceeded its 1000ms execution budget");
  await expect(Bun.file(join(artifacts, "stage-1.stderr.log")).text()).resolves.toContain("stage execution budget exceeded");
});

test("semantic adapter maps oracle success to pass and everything else to fail", async () => {
  const root = await temp();
  const app = join(root, "app");
  await mkdir(app, { recursive: true });
  await writeFile(join(app, "src.ts"), "export const app = 1;\n");
  const pass = productionStagedSemanticAdapter({ candidate_path: root, evaluator_path: "evaluate.ts", timeout_ms: 1_000 }, fakeRunner(() => '{"stage":1,"semantic":"pass"}\n').runner);
  expect(await pass.evaluate(1, join(root, "app"))).toBe("pass");
  const failing = productionStagedSemanticAdapter({ candidate_path: root, evaluator_path: "evaluate.ts", timeout_ms: 1_000 }, fakeRunner(() => "stage 1 public tests failed\n", { code: 1 }).runner);
  expect(await failing.evaluate(1, join(root, "app"))).toBe("fail");
  const silent = productionStagedSemanticAdapter({ candidate_path: root, evaluator_path: "evaluate.ts", timeout_ms: 1_000 }, fakeRunner(() => "").runner);
  expect(await silent.evaluate(2, join(root, "app"))).toBe("fail");
});

test("semantic adapter evaluates a throwaway copy and never mutates the app", async () => {
  const root = await temp();
  const app = join(root, "app");
  await mkdir(app, { recursive: true });
  await writeFile(join(app, "usage.jsonl"), "");
  const before = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: app, onlyFiles: true }))).sort();
  let evaluatedPath = "";
  const runner = (async (command: string[]) => {
    evaluatedPath = command[command.length - 1];
    // Simulate the oracle's `bun test` appending a runtime artifact.
    await writeFile(join(evaluatedPath, "usage.jsonl"), "ledger-entry\n");
    return { code: 0, stdout: '{"stage":1,"semantic":"pass"}\n', stderr: "", timedOut: false, durationMs: 1 };
  }) as unknown as (command: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult>;
  const adapter = productionStagedSemanticAdapter({ candidate_path: root, evaluator_path: "evaluate.ts", timeout_ms: 1_000 }, runner);
  expect(await adapter.evaluate(1, app)).toBe("pass");
  expect(evaluatedPath).not.toStartWith(app);
  expect(await Bun.file(join(app, "usage.jsonl")).text()).toBe("");
  expect((await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: app, onlyFiles: true }))).sort()).toEqual(before);
});

test("timeout drill reports termination only when the runner times out", async () => {
  expect(await demonstrateTimeoutTermination(async () => ({ code: null, stdout: "", stderr: "", timedOut: true, durationMs: 2 }) as CommandResult)).toBe(true);
  await expect(demonstrateTimeoutTermination(async () => ({ code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 1 }) as CommandResult)).rejects.toThrow("did not report a timeout");
});

test("attempt errors are classified as pi-execution or driver-infra", () => {
  expect(classifyAttemptError(new PiStageError("Pi stage 1 exceeded its 900000ms execution budget"))).toBe("pi-execution");
  expect(classifyAttemptError(new PiStageError("Pi stage 2 resumed session b instead of a"))).toBe("pi-execution");
  expect(classifyAttemptError(new Error("ENOENT: no such file or directory, copyfile"))).toBe("driver-infra");
  expect(classifyAttemptError(new TypeError("cannot read properties of undefined"))).toBe("driver-infra");
  expect(classifyAttemptError("string failure")).toBe("driver-infra");
});

test("v4 candidate identity resolves and the one-block plan covers each condition once", async () => {
  const facts = await inspectStagedPilotCandidate();
  expect(facts.model).toBe("deepseek/deepseek-v4-flash");
  expect(facts.stage_budget_ms).toEqual({ 1: 900_000, 2: 900_000 });
  const plan = stagedPilotPlan(facts);
  expect(plan).toHaveLength(3);
  expect(plan.every((attempt) => attempt.block >= 1)).toBe(true);
  const twoBlocks = stagedPilotPlan(facts, 2);
  expect(twoBlocks).toHaveLength(6);
  for (const condition of ["baseline", "oracle-practice", "irrelevant-practice"]) {
    expect(twoBlocks.filter((attempt) => attempt.condition === condition)).toHaveLength(2);
  }
  expect(new Set(plan.map((attempt) => attempt.condition)).size).toBe(3);
  expect(plan.every((attempt) => attempt.source_commit === facts.source_commit && attempt.snapshot_id === facts.snapshot_id)).toBe(true);
  expect(stagedPilotScheduleSeed).toMatch(/^llm-provider-gateway-v4-one-block-model-pilot\/v1$/);
});
