import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { terminateProcessTree } from "./process-tree";

export type CommandResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number };

export const preflightTimeoutMs = 90_000;
export type CommandRunner = (command: string[], cwd: string, timeoutMs?: number, env?: Record<string, string>) => Promise<CommandResult>;

function fail(message: string): never {
  throw new Error(message);
}

async function usableCommand(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).size > 0 ? path : undefined;
  } catch {
    return undefined;
  }
}

export async function piCommand(repositoryRoot: string): Promise<string> {
  const configured = Bun.env.LORELUM_PI_COMMAND;
  if (configured) return configured;
  const names = process.platform === "win32" ? ["pi.exe", "pi.cmd", "pi"] : ["pi"];
  for (const name of names) {
    const command = await usableCommand(resolve(repositoryRoot, "node_modules/.bin", name));
    if (command) return command;
  }
  return "pi";
}

async function run(command: string[], cwd: string, timeoutMs?: number, env?: Record<string, string>): Promise<CommandResult> {
  const started = performance.now();
  const child = Bun.spawn(command, { cwd, env: env ? { ...Bun.env, ...env } : Bun.env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    void terminateProcessTree(child.pid).finally(() => child.kill());
  }, timeoutMs);
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ]);
  if (timeout) clearTimeout(timeout);
  return { code, stdout, stderr, timedOut, durationMs: Math.round(performance.now() - started) };
}

export function preflightPiArgs(command: string, modelId: string): string[] {
  return [command, "--print", "--no-session", "--no-tools", "--no-context-files", "--no-skills", "--no-extensions", "--model", modelId, "Reply with exactly: ok"];
}

function redactSecrets(text: string): string {
  return text
    .replace(/(?:sk-|api[_-]?key["']?\s*[:=]\s*["']?|bearer\s+)[A-Za-z0-9._~+/\-]{8,}={0,2}/gi, "<redacted>")
    .replace(/\b[A-Za-z0-9_\-]{20,}\b/g, "<redacted>");
}

export function classifyPreflightFailure(result: CommandResult): string {
  const stderr = result.stderr || result.stdout;
  if (result.timedOut) return "model unreachable: preflight timed out after 90s";
  if (/api[_-]?key|unauthorized|401|invalid api key/i.test(stderr)) return "model unreachable: API key missing or invalid";
  if (/connection|refused|unreachable|network|timeout|ENOTFOUND|ECONNREFUSED/i.test(stderr)) return "model unreachable: endpoint not reachable";
  if (/model|not found|invalid/i.test(stderr)) return "model unreachable: model id invalid or unknown";
  return `model unreachable: ${redactSecrets(stderr).trim() || "unknown error"}`;
}

export async function preflightPiAndModel(command: string, modelId: string, commandRunner: CommandRunner = run): Promise<{ version: string }> {
  const probeDirectory = await mkdtemp(join(tmpdir(), "lorelum-pi-preflight-"));
  try {
    const version = await commandRunner([command, "--version"], probeDirectory, preflightTimeoutMs);
    if (version.timedOut) fail(classifyPreflightFailure(version));
    if (version.code !== 0) fail(`Unable to start Pi command ${command}: ${(version.stderr || version.stdout).trim()}`);
    const probe = await commandRunner(preflightPiArgs(command, modelId), probeDirectory, preflightTimeoutMs);
    if (probe.code !== 0 || probe.timedOut) fail(classifyPreflightFailure(probe));
    return { version: version.stdout.trim() };
  } finally {
    await rm(probeDirectory, { recursive: true, force: true });
  }
}

export { run, fail };
