import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import {
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
    ...(input.phase === "constraint_followup" ? { checkpoint_observed: options.checkpoint_observed ?? true } : {}),
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
      return { ...result(input), checkpoint_observed: options.checkpoint_observed ?? true };
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

test("checkpoint marker matching is line-exact, including JSON event text", () => {
  expect(hasCheckpointMarker(`prefix ${checkpointMarker} suffix`)).toBe(false);
  expect(hasCheckpointMarker(`\n${checkpointMarker}\n`)).toBe(true);
  expect(hasCheckpointMarker(JSON.stringify({ type: "message", text: `plan\n${checkpointMarker}\n` }))).toBe(true);
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
  const adapter = productionStagedPracticePiAdapter({ command: "pi", model: "mock/model", tools: "read", stage_budget_ms: 1_000, log_directory: logs }, commandRunner);
  const prepared = (await prepareStagedPracticeDelivery(await planFor("task_start"))).prepared;
  await adapter.start({ phase: "task_start", workspace, session_dir: sessionDir, prompt_path: "task.md", practice: prepared.payload });
  expect(commands[0]).toContain("--append-system-prompt");
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
  expect(report.status).toBe("failed");
  expect(report.session_binding).toBe("not-started");
  expect(fake.calls).toHaveLength(0);
  expect(report.delivery_status).toBe("failed");
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
    return { code: 143, stdout: `{"type":"session","id":"${sessionId}"}\n${marker}\n`, stderr: "", timedOut: false, durationMs: 1, marker_observed: true };
  };
  const adapter = productionStagedPracticePiAdapter({ command: "pi", model: "mock/model", tools: "read", stage_budget_ms: 1_000, log_directory: logs }, commandRunner, streamRunner);
  const result = await adapter.resumeUntilCheckpoint({ phase: "constraint_followup", workspace, session_dir: sessionDir, session_id: "session-1", prompt_path: "stage-2/task.md" });
  expect(result.session_id).toBe("session-1");
  expect(result.checkpoint_observed).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.join(" ")).not.toContain(checkpointMarker);
});
