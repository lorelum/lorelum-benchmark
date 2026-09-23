import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { terminateProcessTree } from "../process-tree";
import { parseSessionHeader, findTranscript } from "./staged-pilot-pi-adapter";
import type { CommandResult, CommandRunner } from "../preflight";
import { run as defaultCommandRunner } from "../preflight";
import { assertSeparateRoots, hasCheckpointMarker, hasGracefulCheckpointStop, checkpointMarker, type StagedPracticePiAdapter, type StagedPracticePiInvocation, type StagedPracticePiResult } from "./staged-practice-delivery";
import { sha256Text } from "../../../../fs";
import type { PreparedPracticePayload } from "../../../../treatments/pack-practice/v1/types";

export type StagedPracticePiConfig = Readonly<{
  command: string;
  model: string;
  tools: string;
  stage_budget_ms: number;
  log_directory: string;
  checkpoint_extension_path?: string;
  base_system_prompt_path?: string;
  turn_budget?: Readonly<{ state_path: string; max_turns: number; extension_path?: string }>;
  deadline_at?: number;
  child_environment?: Record<string, string>;
}>;

export class StagedPracticePiError extends Error {}

export type StagedPracticeStreamRunner = (command: string[], cwd: string, timeoutMs: number, marker: string, childEnvironment?: Record<string, string>) => Promise<CommandResult & { marker_observed: boolean; graceful_stop_observed: boolean }>;

type StreamResult = CommandResult & { marker_observed: boolean; graceful_stop_observed: boolean };

async function runUntilMarker(command: string[], cwd: string, timeoutMs: number, marker: string, childEnvironment: Record<string, string> = {}): Promise<StreamResult> {
  const started = performance.now();
  const child = Bun.spawn(command, { cwd, env: { ...Bun.env, ...childEnvironment }, stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let stdout = "";
  let markerObserved = false;
  const read = (async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      stdout += decoder.decode(chunk.value, { stream: true });
      if (!markerObserved && hasCheckpointMarker(stdout, marker)) markerObserved = true;
    }
    stdout += decoder.decode();
  })();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void terminateProcessTree(child.pid).finally(() => child.kill());
  }, timeoutMs);
  const stderrPromise = new Response(child.stderr).text();
  await read;
  const code = await child.exited;
  clearTimeout(timeout);
  return { code, stdout, stderr: await stderrPromise, timedOut, durationMs: Math.round(performance.now() - started), marker_observed: markerObserved, graceful_stop_observed: markerObserved && hasGracefulCheckpointStop(stdout) };
}

function buildCommand(config: StagedPracticePiConfig, invocation: StagedPracticePiInvocation, runtimeCardPath?: string, checkpointExtensionPath?: string): string[] {
  const command = [config.command, "--print", "--mode", "json", "--no-context-files", "--no-extensions", "--no-skills", "--no-prompt-templates", "--tools", config.tools, "--model", config.model, "--session-dir", invocation.session_dir];
  if (invocation.session_id) command.push("--session", invocation.session_id);
  if (config.turn_budget) command.push("--extension", config.turn_budget.extension_path ?? join(import.meta.dir, "timing-pilot-runtime-extension.ts"));
  if (checkpointExtensionPath) command.push("--extension", checkpointExtensionPath);
  if (config.base_system_prompt_path) command.push("--append-system-prompt", config.base_system_prompt_path);
  if (runtimeCardPath) command.push("--append-system-prompt", runtimeCardPath);
  if (invocation.prompt_path) command.push(`@${invocation.prompt_path}`);
  if (invocation.checkpoint_resume_message) command.push(invocation.checkpoint_resume_message);
  return command;
}

async function runtimeCard(artifacts: string, phase: string, payload: PreparedPracticePayload | undefined): Promise<string | undefined> {
  if (!payload) return undefined;
  if (await sha256Text(payload.text) !== payload.card_sha256) throw new StagedPracticePiError("Practice payload card hash mismatch");
  const directory = join(artifacts, "private-runtime");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${phase}-${crypto.randomUUID()}.md`);
  await writeFile(path, payload.text);
  return path;
}

export function productionStagedPracticePiAdapter(config: StagedPracticePiConfig, commandRunner: CommandRunner = defaultCommandRunner, streamRunner: StagedPracticeStreamRunner = runUntilMarker): StagedPracticePiAdapter {
  const invoke = async (invocation: StagedPracticePiInvocation, streamUntil?: string): Promise<StagedPracticePiResult> => {
    await assertSeparateRoots(invocation.workspace, config.log_directory);
    const runtimePath = await runtimeCard(config.log_directory, invocation.phase, invocation.practice);
    const checkpointExtensionPath = streamUntil ? (config.checkpoint_extension_path ?? join(import.meta.dir, "checkpoint-stop-extension.ts")) : undefined;
    const command = buildCommand(config, invocation, runtimePath, checkpointExtensionPath);
    const remainingMs = config.deadline_at === undefined ? config.stage_budget_ms : Math.min(config.stage_budget_ms, Math.max(0, config.deadline_at - Date.now()));
    if (remainingMs <= 0) throw new StagedPracticePiError("timing pilot exceeded its per-attempt duration budget");
    const childEnvironment: Record<string, string> = { ...(config.child_environment ?? {}) };
    if (config.turn_budget) {
      if (!Number.isInteger(config.turn_budget.max_turns) || config.turn_budget.max_turns < 1) throw new StagedPracticePiError("timing pilot turn budget is invalid");
      childEnvironment.LORELUM_TIMING_PILOT_TURN_STATE = config.turn_budget.state_path;
      childEnvironment.LORELUM_TIMING_PILOT_MAX_TURNS = String(config.turn_budget.max_turns);
      if (streamUntil) childEnvironment.LORELUM_TIMING_PILOT_STOP_AT_CHECKPOINT = "1";
    }
    try {
      const result = streamUntil
        ? await streamRunner(command, invocation.workspace, remainingMs, streamUntil, childEnvironment)
        : await commandRunner(command, invocation.workspace, remainingMs, childEnvironment);
      let budgetState: { ready?: unknown; exhausted?: unknown } | undefined;
      if (config.turn_budget) budgetState = await Bun.file(config.turn_budget.state_path).json().catch(() => undefined) as { ready?: unknown; exhausted?: unknown } | undefined;
      await mkdir(config.log_directory, { recursive: true });
      await writeFile(join(config.log_directory, `${invocation.phase}.stdout.jsonl`), result.stdout);
      await writeFile(join(config.log_directory, `${invocation.phase}.stderr.log`), `${result.stderr}${result.timedOut ? "\nexecution budget exceeded\n" : ""}\n`);
      if (config.turn_budget && budgetState?.ready !== true) throw new StagedPracticePiError("timing pilot turn-budget extension did not initialize");
      if (config.turn_budget && budgetState?.exhausted === true) throw new StagedPracticePiError("timing pilot exceeded its 128-turn attempt budget");
      if (result.timedOut) throw new StagedPracticePiError(`${invocation.phase} exceeded its ${config.stage_budget_ms}ms execution budget`);
      const sessionId = parseSessionHeader(result.stdout);
      if (invocation.session_id && sessionId !== invocation.session_id) throw new StagedPracticePiError(`${invocation.phase} resumed session ${sessionId} instead of ${invocation.session_id}`);
      const markerObserved = streamUntil ? (result as StreamResult).marker_observed : undefined;
      const gracefulStopObserved = streamUntil ? (result as StreamResult).graceful_stop_observed : undefined;
      if (streamUntil && markerObserved && !gracefulStopObserved) throw new StagedPracticePiError(`${invocation.phase} observed the checkpoint marker without a persisted graceful stop`);
      if (result.code !== 0 && !markerObserved) throw new StagedPracticePiError(`${invocation.phase} exited with code ${result.code}`);
      return { session_id: sessionId, transcript_path: await findTranscript(invocation.session_dir, sessionId), stdout: result.stdout, stderr: result.stderr, ...(streamUntil ? { checkpoint_observed: markerObserved, checkpoint_stop_observed: gracefulStopObserved } : {}) };
    } finally {
      if (runtimePath) await rm(runtimePath, { force: true }).catch(() => undefined);
    }
  };
  return {
    start: (invocation) => invoke(invocation),
    resume: (invocation) => invoke(invocation),
    resumeUntilCheckpoint: (invocation) => invoke(invocation, checkpointMarker),
  };
}
