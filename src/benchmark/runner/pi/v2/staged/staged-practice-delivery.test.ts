import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import {
  assertSeparateRoots,
  assertRunnerOwnedArtifacts,
  checkpointMarker,
  checkpointResumeMessage,
  hashStagedPracticeDeliveryPlan,
  parseStagedPracticeDeliveryPlan,
  hasCheckpointMarker,
  prepareStagedPracticeDelivery,
  runStagedPracticeDeliveryAttempt,
  stagedPracticeConditions,
  type StagedPracticeDeliveryPlan,
  type StagedPracticePiAdapter,
  type StagedPracticePiInvocation,
  type StagedPracticePiResult,
} from "./staged-practice-delivery";
import { productionStagedPracticePiAdapter } from "./staged-practice-delivery-pi-adapter";
import checkpointStopExtension from "./checkpoint-stop-extension";
import { executeStagedPracticeDeliveryFromFile } from "./staged-practice-delivery-cli";
import { sha256File, workspaceRoot } from "../../../../fs";
import type { CommandResult } from "../preflight";

const candidatePath = join(workspaceRoot, "incubator/practice-injection/async-report-lifecycle-v1");
const treatmentRoot = join(workspaceRoot, "treatments/agentic-coding-replan-on-material-drift/v1");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temp(prefix: string): Promise<string> {
  const path = join(workspaceRoot, ".run-workspaces", `${prefix}-${crypto.randomUUID()}`);
  roots.push(path);
  await mkdir(path, { recursive: true });
  return path;
}

async function planFor(condition: StagedPracticeDeliveryPlan["delivery"]["condition_id"]): Promise<StagedPracticeDeliveryPlan> {
  const plan: StagedPracticeDeliveryPlan = {
    schema_version: "staged-practice-delivery/v1",
    id: `async-report-${condition}`,
    candidate: {
      path: "incubator/practice-injection/async-report-lifecycle-v1",
      source_commit: "74962ee0c98f7775b0eb626f7b49b878035d8778",
      snapshot_id: "ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2",
    },
    treatment: { root: "treatments/agentic-coding-replan-on-material-drift/v1", id: "agentic-coding-replan-on-material-drift", version: "v1" },
    delivery: { condition_id: condition, delivery_node: condition === "baseline" || !stagedPracticeConditions.includes(condition as typeof stagedPracticeConditions[number]) ? "task_start" : condition as typeof stagedPracticeConditions[number] },
    prompts: {
      task_path: "public/task.md",
      followup_path: "public/stage-2/task.md",
      task_sha256: await sha256File(join(candidatePath, "public/task.md")),
      followup_sha256: await sha256File(join(candidatePath, "public/stage-2/task.md")),
      checkpoint_marker: checkpointMarker,
      checkpoint_resume_message: checkpointResumeMessage,
    },
    execution: {
      model: "mock/model",
      model_version: "mock-v1",
      system_prompt_hash: "1".repeat(64),
      tool_policy_hash: "2".repeat(64),
      environment: { id: "mock", version: "v1" },
      budget: { max_turns: 10, max_duration_ms: 10_000 },
    },
    plan_hash: "0".repeat(64),
  };
  return { ...plan, plan_hash: await hashStagedPracticeDeliveryPlan(plan) };
}

type RecordedCall = StagedPracticePiInvocation;

function fakeAdapter(options: { checkpoint_observed?: boolean; resume_session_id?: string } = {}): { adapter: StagedPracticePiAdapter; calls: RecordedCall[]; startHadFollowup: boolean | undefined } {
  const calls: RecordedCall[] = [];
  let startHadFollowup: boolean | undefined;
  const result = (input: StagedPracticePiInvocation): StagedPracticePiResult => ({
    session_id: input.session_id ? (options.resume_session_id ?? input.session_id) : "session-1",
    transcript_path: "private/session-1.jsonl",
    stdout: input.phase === "constraint_followup" && !input.practice ? `${checkpointMarker}\n` : "",
    stderr: "",
    ...(input.phase === "constraint_followup" ? { checkpoint_observed: options.checkpoint_observed ?? true, checkpoint_stop_observed: options.checkpoint_observed ?? true } : {}),
  });
  const adapter: StagedPracticePiAdapter = {
    start: async (input) => {
      startHadFollowup = await Bun.file(join(input.workspace, "stage-2/task.md")).exists();
      calls.push(input);
      return result(input);
    },
    resume: async (input) => {
      calls.push(input);
      return result(input);
    },
    resumeUntilCheckpoint: async (input) => {
      calls.push(input);
      return { ...result(input), checkpoint_observed: options.checkpoint_observed ?? true, checkpoint_stop_observed: options.checkpoint_observed ?? true };
    },
  };
  return { adapter, calls, get startHadFollowup() { return startHadFollowup; } };
}

async function run(condition: StagedPracticeDeliveryPlan["delivery"]["condition_id"], adapter: StagedPracticePiAdapter) {
  const root = await temp(`attempt-${condition}`);
  const artifacts = join(root, "artifacts");
  const workspace = join(root, "workspace");
  return runStagedPracticeDeliveryAttempt({ root: workspaceRoot, plan: await planFor(condition), attempt_id: `attempt-${condition}`, artifacts, workspace, pi: adapter });
}


test("plan parser enforces the strict manifest shape and scalar types", async () => {
  const plan = await planFor("task_start");
  await expect(parseStagedPracticeDeliveryPlan({ ...plan, unexpected: true })).rejects.toThrow("unsupported field");
  await expect(parseStagedPracticeDeliveryPlan({ ...plan, id: "not valid" })).rejects.toThrow("id is invalid");
  await expect(parseStagedPracticeDeliveryPlan({
    ...plan,
    execution: { ...plan.execution, budget: { ...plan.execution.budget, max_turns: "10" } },
  })).rejects.toThrow("positive integer limits");
});

test("candidate snapshot leaves are verified before workspace setup", async () => {
  const root = await temp("snapshot-drift");
  const copiedCandidate = join(root, "incubator/practice-injection/async-report-lifecycle-v1");
  const copiedTreatment = join(root, "treatments/agentic-coding-replan-on-material-drift/v1");
  await cp(candidatePath, copiedCandidate, { recursive: true });
  await cp(treatmentRoot, copiedTreatment, { recursive: true });
  const driftedFile = join(copiedCandidate, "public/starter/app/src/types.ts");
  await writeFile(driftedFile, `${await Bun.file(driftedFile).text()}\n// frozen snapshot drift\n`);
  await expect(prepareStagedPracticeDelivery(await planFor("task_start"), root)).rejects.toThrow("snapshot leaf");
});

test("invalid plans produce a structured invalid-plan report without invoking Pi", async () => {
  const fake = fakeAdapter();
  const plan = await planFor("task_start");
  const root = await temp("invalid-plan-root");
  const attemptRoot = join(root, ".run-workspaces", "invalid-plan");
  await mkdir(join(root, ".run-workspaces"), { recursive: true });
  const invalid = { ...plan, delivery: { ...plan.delivery, delivery_node: "unknown-node" } } as unknown as StagedPracticeDeliveryPlan;
  const report = await runStagedPracticeDeliveryAttempt({
    root,
    plan: invalid,
    attempt_id: "invalid-plan",
    artifacts: join(attemptRoot, "artifacts"),
    workspace: join(attemptRoot, "workspace"),
    pi: fake.adapter,
  });
  expect(report.status).toBe("invalid-plan");
  expect(report.delivery_status).toBe("invalid-plan");
  expect(report.public_trace.delivery_node).toBe("invalid-plan");
  expect(report.audit_event?.status).toBe("invalid-plan");
  expect(fake.calls).toHaveLength(0);
});

test("CLI records malformed plan files as invalid-plan without starting Pi", async () => {
  const root = await temp("invalid-plan-cli");
  const planPath = join(root, "invalid-plan.json");
  await writeFile(planPath, JSON.stringify({ schema_version: "wrong/v1" }));
  const report = await executeStagedPracticeDeliveryFromFile({
    plan_path: planPath,
    attempt_id: "invalid-plan-cli",
    artifacts: join(root, "artifacts"),
    workspace: join(root, "workspace"),
    dry_run: true,
  });
  expect(report.status).toBe("invalid-plan");
  expect(report.audit_event?.status).toBe("invalid-plan");
  expect(await Bun.file(report.summary_path).exists()).toBe(true);
});

test("candidate identity is anchored to the frozen #196 source and snapshot", async () => {
  const plan = await planFor("task_start");
  const sourceDrift = { ...plan, candidate: { ...plan.candidate, source_commit: "0".repeat(40) } } as StagedPracticeDeliveryPlan;
  const sourcePlan = { ...sourceDrift, plan_hash: await hashStagedPracticeDeliveryPlan(sourceDrift) };
  await expect(prepareStagedPracticeDelivery(sourcePlan)).rejects.toThrow("frozen #196 commit");
  const snapshotDrift = { ...plan, candidate: { ...plan.candidate, snapshot_id: "0".repeat(64) } } as StagedPracticeDeliveryPlan;
  const snapshotPlan = { ...snapshotDrift, plan_hash: await hashStagedPracticeDeliveryPlan(snapshotDrift) };
  await expect(prepareStagedPracticeDelivery(snapshotPlan)).rejects.toThrow("frozen #196 snapshot");
});

test("workspace setup never deletes a caller-provided non-empty workspace", async () => {
  const root = await temp("non-empty-workspace");
  const workspace = join(root, "workspace");
  const artifacts = join(root, "artifacts");
  await mkdir(workspace, { recursive: true });
  const sentinel = join(workspace, "sentinel.txt");
  await writeFile(sentinel, "caller-owned");
  const report = await runStagedPracticeDeliveryAttempt({
    root: workspaceRoot,
    plan: await planFor("task_start"),
    attempt_id: "non-empty-workspace",
    artifacts,
    workspace,
    pi: fakeAdapter().adapter,
  });
  expect(report.status).toBe("failed");
  expect(await Bun.file(sentinel).text()).toBe("caller-owned");
});

test("staged delivery can resolve frozen repository inputs while isolating artifacts under a scratch execution root", async () => {
  const executionRoot = join(workspaceRoot, "scratch", `timing-pilot-execution-root-${crypto.randomUUID()}`);
  roots.push(executionRoot);
  const workspace = join(executionRoot, ".run-workspaces", "workspace");
  const artifacts = join(executionRoot, ".run-workspaces", "artifacts");
  const report = await runStagedPracticeDeliveryAttempt({
    root: workspaceRoot,
    execution_root: executionRoot,
    plan: await planFor("task_start"),
    attempt_id: "scratch-execution-root",
    artifacts,
    workspace,
    dry_run: true,
  });
  expect(report.status).toBe("dry-run");
  expect(report.summary_path.startsWith(executionRoot)).toBe(true);
  expect(report.public_trace_path.startsWith(executionRoot)).toBe(true);
  expect(report.comparable).toBe(false);
});

test("artifact ownership rejects frozen input paths before any write", async () => {
  const root = await temp("artifact-ownership");
  const workspace = join(root, "workspace");
  const before = await sha256File(join(candidatePath, "private/candidate.yaml"));
  await expect(assertRunnerOwnedArtifacts(workspaceRoot, candidatePath)).rejects.toThrow("runner-owned");
  expect(await sha256File(join(candidatePath, "private/candidate.yaml"))).toBe(before);
  await expect(runStagedPracticeDeliveryAttempt({
    root: workspaceRoot,
    plan: await planFor("task_start"),
    attempt_id: "artifact-ownership",
    artifacts: candidatePath,
    workspace,
    pi: fakeAdapter().adapter,
  })).rejects.toThrow("runner-owned");
});

test("physical workspace and artifact boundaries reject symlink aliases", async () => {
  const root = await temp("symlink-boundary");
  const workspace = join(root, "workspace");
  const artifacts = join(root, "artifacts");
  await mkdir(workspace, { recursive: true });
  let linked = true;
  try {
    await symlink(workspace, artifacts, "junction");
  } catch {
    linked = false;
  }
  if (linked) await expect(assertSeparateRoots(workspace, artifacts)).rejects.toThrow();
});

test("checkpoint marker matching is line-exact and ignores user prompt events", () => {
  expect(hasCheckpointMarker(`prefix ${checkpointMarker} suffix`)).toBe(false);
  expect(hasCheckpointMarker(`\n${checkpointMarker}\n`)).toBe(false);
  expect(hasCheckpointMarker(JSON.stringify({
    type: "message_end",
    message: { role: "user", content: [{ type: "text", text: `plan\n${checkpointMarker}\n` }] },
  }))).toBe(false);
  expect(hasCheckpointMarker(JSON.stringify({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "text", text: `implementation\n${checkpointMarker}\n` }] },
  }))).toBe(true);
});

test("checkpoint extension aborts on assistant text deltas", async () => {
  let handler: ((event: unknown, context: { signal?: AbortSignal; abort(): void }) => void) | undefined;
  checkpointStopExtension({
    on: (_event: "message_update", nextHandler: typeof handler) => { handler = nextHandler; },
  } as never);
  let aborted = false;
  handler?.({
    type: "message_update",
    message: { role: "assistant", content: [] },
    assistantMessageEvent: { type: "text_delta", delta: `implementation\n${checkpointMarker}\n` },
  }, { abort: () => { aborted = true; } });
  expect(aborted).toBe(true);
});

test("checkpoint delivery requires the adapter to confirm graceful persistence", async () => {
  const fake = fakeAdapter();
  const root = await temp("checkpoint-no-graceful-persistence");
  const adapter: StagedPracticePiAdapter = {
    ...fake.adapter,
    resumeUntilCheckpoint: async (input) => ({
      ...(await fake.adapter.resumeUntilCheckpoint(input)),
      checkpoint_observed: true,
      checkpoint_stop_observed: false,
    }),
  };
  const report = await runStagedPracticeDeliveryAttempt({
    root: workspaceRoot,
    plan: await planFor("first_implementation_checkpoint"),
    attempt_id: "checkpoint-no-graceful-persistence",
    artifacts: join(root, "artifacts"),
    workspace: join(root, "workspace"),
    pi: adapter,
  });
  expect(report.status).toBe("indeterminate");
  expect(report.delivery_status).toBe("indeterminate");
  expect(report.termination_reason).toContain("graceful stop");
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
});

test("task_start delivers exactly once before the first Agent response", async () => {
  const fake = fakeAdapter();
  const report = await run("task_start", fake.adapter);
  expect(report.status).toBe("completed");
  expect(report.comparable).toBe(true);
  expect(fake.startHadFollowup).toBe(false);
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
  expect(fake.calls.filter((call) => call.practice).length).toBe(1);
  expect(fake.calls[0]?.practice?.practice_id).toBe("agentic-coding.implementation.replan-on-material-drift");
  expect(fake.calls[1]?.practice).toBeUndefined();
  expect(report.audit_event?.status).toBe("delivered");
});

test("constraint_followup resumes the same session and delivers at the follow-up", async () => {
  const fake = fakeAdapter();
  const report = await run("constraint_followup", fake.adapter);
  expect(report.status).toBe("completed");
  expect(fake.startHadFollowup).toBe(false);
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
  expect(fake.calls[0]?.practice).toBeUndefined();
  expect(fake.calls[1]?.practice?.card_sha256).toBe("4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97");
  expect(fake.calls.every((call) => call.session_id === undefined || call.session_id === "session-1")).toBe(true);
});

test("checkpoint delivery waits for the marker and resumes with one card", async () => {
  const fake = fakeAdapter();
  const report = await run("first_implementation_checkpoint", fake.adapter);
  expect(report.status).toBe("completed");
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup", "checkpoint_resume"]);
  expect(fake.calls[1]?.practice).toBeUndefined();
  expect(fake.calls[2]?.practice?.card_sha256).toBe("4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97");
  expect(fake.calls.filter((call) => call.practice).length).toBe(1);
  expect(report.audit_event?.acknowledged).toBe(true);
});

test("baseline is explicitly isolated and receives no Practice payload", async () => {
  const fake = fakeAdapter();
  const report = await run("baseline", fake.adapter);
  expect(report.status).toBe("completed");
  expect(report.audit_event?.status).toBe("not-declared");
  expect(fake.calls.every((call) => call.practice === undefined)).toBe(true);
  expect(report.public_trace.status).toBe("not-declared");
});


test("undeclared conditions are isolated without expanding the timing matrix", async () => {
  const fake = fakeAdapter();
  const report = await run("unrelated-control", fake.adapter);
  expect(report.status).toBe("completed");
  expect(report.delivery_status).toBe("not-declared");
  expect(fake.calls.every((call) => call.practice === undefined)).toBe(true);
});

test("missing checkpoint marker is indeterminate and prevents later delivery", async () => {
  const fake = fakeAdapter({ checkpoint_observed: false });
  const report = await run("first_implementation_checkpoint", fake.adapter);
  expect(report.status).toBe("indeterminate");
  expect(report.comparable).toBe(false);
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
  expect(fake.calls.every((call) => call.practice === undefined)).toBe(true);
  expect(report.termination_reason).toContain("checkpoint marker");
});

test("session mismatch fails closed without a later successful delivery", async () => {
  const fake = fakeAdapter({ resume_session_id: "other-session" });
  const report = await run("first_implementation_checkpoint", fake.adapter);
  expect(report.status).toBe("failed");
  expect(report.session_binding).toBe("resume-failed");
  expect(fake.calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
  expect(report.audit_event?.acknowledged).toBe(false);
});

test("public trace excludes Practice identity and private paths", async () => {
  const fake = fakeAdapter();
  const report = await run("constraint_followup", fake.adapter);
  const serialized = JSON.stringify(report.public_trace);
  expect(serialized).not.toContain("agentic-coding.implementation.replan-on-material-drift");
  expect(serialized).not.toContain("4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97");
  expect(serialized).not.toContain("private/");
  expect(serialized).not.toContain("session-1");
});

test("production adapter uses a private append-system-prompt file without putting card bytes in argv", async () => {
  const root = await temp("adapter");
  const workspace = join(root, "workspace");
  const sessionDir = join(root, "sessions");
  const logs = join(root, "logs");
  const basePrompt = join(root, "system-prompt.md");
  await Bun.write(basePrompt, "neutral system prompt\n");
  await mkdir(workspace, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  const commands: string[][] = [];
  const commandRunner = async (command: string[]): Promise<CommandResult> => {
    commands.push(command);
    const sessionIndex = command.indexOf("--session");
    const sessionId = sessionIndex === -1 ? "session-1" : command[sessionIndex + 1];
    await Bun.write(join(sessionDir, `session-${sessionId}.jsonl`), `{"type":"session","id":"${sessionId}"}\n`);
    return { code: 0, stdout: `{"type":"session","id":"${sessionId}"}\n`, stderr: "", timedOut: false, durationMs: 1 };
  };
  const adapter = productionStagedPracticePiAdapter({ command: "pi", model: "mock/model", tools: "read", stage_budget_ms: 1_000, log_directory: logs, base_system_prompt_path: basePrompt }, commandRunner);
  const prepared = (await prepareStagedPracticeDelivery(await planFor("task_start"))).prepared;
  await adapter.start({ phase: "task_start", workspace, session_dir: sessionDir, prompt_path: "task.md", practice: prepared.payload });
  expect(commands[0]).toContain("--append-system-prompt");
  expect(commands[0]).toContain(basePrompt);
  expect(commands[0]?.filter((arg) => arg === "--append-system-prompt")).toHaveLength(2);
  expect(commands[0]?.join(" ")).not.toContain(prepared.payload.text);
  expect(commands[0]?.join(" ")).not.toContain(prepared.payload.card_sha256);
});
test("frozen prompt drift is rejected before the session starts", async () => {
  const fake = fakeAdapter();
  const plan = await planFor("task_start");
  const drifted = { ...plan, prompts: { ...plan.prompts, task_sha256: "f".repeat(64) }, plan_hash: "0".repeat(64) } as StagedPracticeDeliveryPlan;
  const driftedWithHash = { ...drifted, plan_hash: await hashStagedPracticeDeliveryPlan(drifted) };
  const root = await temp("prompt-drift");
  const report = await runStagedPracticeDeliveryAttempt({ root: workspaceRoot, plan: driftedWithHash, attempt_id: "prompt-drift", artifacts: join(root, "artifacts"), workspace: join(root, "workspace"), pi: fake.adapter });
  expect(report.status).toBe("invalid-plan");
  expect(report.session_binding).toBe("not-started");
  expect(fake.calls).toHaveLength(0);
  expect(report.delivery_status).toBe("invalid-plan");
});

test("delivery failure after start is preserved and does not resume", async () => {
  const base = fakeAdapter();
  const calls = base.calls;
  const adapter: StagedPracticePiAdapter = {
    start: base.adapter.start,
    resume: async (input) => {
      calls.push(input);
      throw new Error("delivery runtime unavailable");
    },
    resumeUntilCheckpoint: base.adapter.resumeUntilCheckpoint,
  };
  const report = await run("constraint_followup", adapter);
  expect(report.status).toBe("failed");
  expect(report.comparable).toBe(false);
  expect(calls.map((call) => call.phase)).toEqual(["task_start", "constraint_followup"]);
  expect(calls[1]?.practice).toBeDefined();
  expect(report.audit_event?.status).toBe("failed");
  expect(report.audit_event?.acknowledged).toBe(false);
  expect(report.termination_reason).toContain("delivery runtime unavailable");
});

test("production checkpoint adapter rejects a marker without a graceful persisted stop", async () => {
  const root = await temp("stream-no-graceful-stop");
  const workspace = join(root, "workspace");
  const sessionDir = join(root, "sessions");
  const logs = join(root, "logs");
  await mkdir(workspace, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  const commandRunner = async (command: string[]): Promise<CommandResult> => {
    const sessionIndex = command.indexOf("--session");
    const sessionId = sessionIndex === -1 ? "session-1" : command[sessionIndex + 1];
    await Bun.write(join(sessionDir, `session-${sessionId}.jsonl`), `{"type":"session","id":"${sessionId}"}\n`);
    return { code: 0, stdout: `{"type":"session","id":"${sessionId}"}\n`, stderr: "", timedOut: false, durationMs: 1 };
  };
  const streamRunner = async (command: string[], _cwd: string, _timeoutMs: number, marker: string) => {
    const sessionIndex = command.indexOf("--session");
    const sessionId = sessionIndex === -1 ? "session-1" : command[sessionIndex + 1];
    await Bun.write(join(sessionDir, `session-${sessionId}.jsonl`), `{"type":"session","id":"${sessionId}"}\n`);
    return { code: 0, stdout: `{"type":"session","id":"${sessionId}"}\n${marker}\n`, stderr: "", timedOut: false, durationMs: 1, marker_observed: true, graceful_stop_observed: false };
  };
  const adapter = productionStagedPracticePiAdapter({ command: "pi", model: "mock/model", tools: "read", stage_budget_ms: 1_000, log_directory: logs }, commandRunner, streamRunner);
  await expect(adapter.resumeUntilCheckpoint({ phase: "constraint_followup", workspace, session_dir: sessionDir, session_id: "session-1", prompt_path: "stage-2/task.md" })).rejects.toThrow("graceful stop");
});

test("production checkpoint adapter accepts a marker-bounded stream and keeps the private card out of argv", async () => {
  const root = await temp("stream-adapter");
  const workspace = join(root, "workspace");
  const sessionDir = join(root, "sessions");
  const logs = join(root, "logs");
  await mkdir(workspace, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  const calls: string[][] = [];
  const commandRunner = async (command: string[]): Promise<CommandResult> => {
    calls.push(command);
    const sessionIndex = command.indexOf("--session");
    const sessionId = sessionIndex === -1 ? "session-1" : command[sessionIndex + 1];
    await Bun.write(join(sessionDir, `session-${sessionId}.jsonl`), `{"type":"session","id":"${sessionId}"}\n`);
    return { code: 0, stdout: `{"type":"session","id":"${sessionId}"}\n`, stderr: "", timedOut: false, durationMs: 1 };
  };
  const streamRunner = async (command: string[], _cwd: string, _timeoutMs: number, marker: string) => {
    calls.push(command);
    const sessionIndex = command.indexOf("--session");
    const sessionId = sessionIndex === -1 ? "session-1" : command[sessionIndex + 1];
    await Bun.write(join(sessionDir, `session-${sessionId}.jsonl`), `{"type":"session","id":"${sessionId}"}\n`);
    return {
      code: 0,
      stdout: `{"type":"session","id":"${sessionId}"}\n{"type":"message_end","message":{"role":"assistant","stopReason":"aborted","content":[{"type":"text","text":"implementation\n${marker}\n"}]}}\n`,
      stderr: "",
      timedOut: false,
      durationMs: 1,
      marker_observed: true,
      graceful_stop_observed: true,
    };
  };
  const adapter = productionStagedPracticePiAdapter({ command: "pi", model: "mock/model", tools: "read", stage_budget_ms: 1_000, log_directory: logs }, commandRunner, streamRunner);
  const result = await adapter.resumeUntilCheckpoint({ phase: "constraint_followup", workspace, session_dir: sessionDir, session_id: "session-1", prompt_path: "stage-2/task.md" });
  expect(result.session_id).toBe("session-1");
  expect(result.checkpoint_observed).toBe(true);
  expect(result.checkpoint_stop_observed).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("--extension");
  expect(calls[0]?.join(" ")).toContain("checkpoint-stop-extension.ts");
  expect(calls[0]?.join(" ")).not.toContain(checkpointMarker);
});
