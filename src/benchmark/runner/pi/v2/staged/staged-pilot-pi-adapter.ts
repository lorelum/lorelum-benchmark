import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run, type CommandResult } from "../preflight";
import type { SemanticLabel } from "../../../../evaluator/two-stage-structure/v1/types";
import type { StagedPiAdapter, StagedPiInvocation, StagedPiResult, StagedSemanticAdapter } from "./staged-profile-diagnostic-runner";

export type StagedPilotPiConfig = {
  command: string;
  model: string;
  tools: string;
  stage_budget_ms: Record<1 | 2, number>;
  stage_instruction: Record<1 | 2, string>;
  log_directory: string;
};

export function parseSessionHeader(stdout: string): string {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const value = JSON.parse(line) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).type === "session" && typeof (value as Record<string, unknown>).id === "string") {
        return (value as Record<string, unknown>).id as string;
      }
    } catch {
      // Non-JSON diagnostic lines before the session header are expected.
    }
  }
  throw new Error("Pi JSON stream did not open with a session header");
}

async function findTranscript(sessionDir: string, sessionId: string): Promise<string> {
  const candidates: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) candidates.push(path);
    }
  };
  await walk(sessionDir).catch(() => undefined);
  const exact = candidates.find((path) => path.includes(sessionId));
  if (!exact) throw new Error(`Pi session transcript not found for ${sessionId}`);
  return exact;
}

/** Production Pi adapter: runs the local Pi CLI with a persistent session per attempt. */
export function productionStagedPiAdapter(config: StagedPilotPiConfig, commandRunner: (command: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult> = run): StagedPiAdapter {
  const invoke = async (invocation: StagedPiInvocation, sessionId?: string): Promise<StagedPiResult> => {
    const base = [
      "--print", "--mode", "json", "--no-context-files", "--no-extensions", "--no-skills", "--no-prompt-templates",
      "--tools", config.tools, "--model", config.model, "--session-dir", invocation.session_dir,
    ];
    if (sessionId) base.push("--session", sessionId);
    base.push("@task.md", config.stage_instruction[invocation.stage]);
    const result: CommandResult = await commandRunner([config.command, ...base], invocation.workspace, config.stage_budget_ms[invocation.stage]);
    await writeFile(join(config.log_directory, `stage-${invocation.stage}.stdout.jsonl`), result.stdout);
    await writeFile(join(config.log_directory, `stage-${invocation.stage}.stderr.log`), `${result.stderr}${result.timedOut ? "\nstage execution budget exceeded\n" : ""}\n`);
    if (result.timedOut) throw new Error(`Pi stage ${invocation.stage} exceeded its ${config.stage_budget_ms[invocation.stage]}ms execution budget`);
    if (result.code !== 0) throw new Error(`Pi stage ${invocation.stage} exited with code ${result.code}`);
    const header = parseSessionHeader(result.stdout);
    if (sessionId && header !== sessionId) throw new Error(`Pi stage 2 resumed session ${header} instead of ${sessionId}`);
    return { session_id: header, transcript_path: await findTranscript(invocation.session_dir, header) };
  };
  return {
    start: async (invocation) => invoke(invocation),
    resume: async (invocation) => {
      if (!invocation.session_id) throw new Error("Pi stage 2 resume requires the stage 1 session id");
      return invoke(invocation, invocation.session_id);
    },
  };
}

export type StagedPilotSemanticConfig = {
  candidate_path: string;
  evaluator_path: string;
  timeout_ms: number;
};

/** Semantic adapter invoking the candidate-declared offline oracle; its runtime is excluded from stage model budgets. */
export function productionStagedSemanticAdapter(config: StagedPilotSemanticConfig, commandRunner: (command: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult> = run): StagedSemanticAdapter {
  return {
    evaluate: async (stage, app): Promise<SemanticLabel> => {
      const result = await commandRunner(
        ["bun", "run", config.evaluator_path, String(stage), app],
        config.candidate_path,
        config.timeout_ms,
      );
      if (result.code === 0) {
        for (const line of result.stdout.split(/\r?\n/).reverse()) {
          try {
            const value = JSON.parse(line) as unknown;
            if (value && typeof value === "object" && (value as Record<string, unknown>).semantic === "pass") return "pass";
          } catch { /* trailing non-JSON output */ }
        }
      }
      return "fail";
    },
  };
}

/** Demonstrates that a hung child process is terminated and reaped within its budget. */
export async function demonstrateTimeoutTermination(commandRunner: (command: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult> = run): Promise<boolean> {
  const result = await commandRunner(["bun", "-e", "await new Promise(() => {})"], process.cwd(), 2_000);
  if (!result.timedOut) throw new Error("timeout drill did not report a timeout");
  if (result.code === 0) throw new Error("timeout drill process unexpectedly succeeded");
  return true;
}
