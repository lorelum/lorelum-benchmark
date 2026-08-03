// Controlled WebServer supervisor for diagnostic evaluator attempts. Allocates
// a free port, launches the Vite dev server, waits for readiness, and
// guarantees process-tree cleanup on exit, failure, and timeout. Candidate
// public files are never modified; the server URL is passed to the evaluator
// through PLAYWRIGHT_BASE_URL.

import { createServer } from "node:net";
import { terminateProcessTree } from "./process-tree";

export type WebServerFailureCategory =
  | "evaluator-server-port-unavailable"
  | "evaluator-server-launch-failed"
  | "evaluator-server-timeout"
  | "evaluator-cleanup-unverified";

export type WebServerHandle = {
  pid: number;
  port: number;
  stop: () => Promise<boolean>;
};

export type ServerSpawn = (command: string[], cwd: string, env: Record<string, string>) => { pid: number; stop: () => Promise<void> };

export async function allocateFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("evaluator-server-port-unavailable");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function defaultProbe(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function defaultSpawn(command: string[], cwd: string, env: Record<string, string>): { pid: number; stop: () => Promise<boolean> } {
  const child = Bun.spawn(command, { cwd, env: { ...Bun.env, ...env }, stdout: "ignore", stderr: "ignore" });
  return {
    pid: child.pid,
    stop: async () => {
      await terminateProcessTree(child.pid);
      try { child.kill(); } catch { }
      return true;
    }
  };
}

export type WebServerStarter = (cwd: string, port: number) => Promise<{ ok: true; handle: WebServerHandle } | { ok: false; category: WebServerFailureCategory }>;

export const realWebServerStarter: WebServerStarter = (cwd, port) => startWebServer({ cwd, port });
export async function startWebServer(input: {
  cwd: string;
  port: number;
  spawn?: ServerSpawn;
  probe?: (url: string) => Promise<boolean>;
  readinessTimeoutMs?: number;
}): Promise<{ ok: true; handle: WebServerHandle } | { ok: false; category: WebServerFailureCategory }> {
  const spawn = input.spawn ?? defaultSpawn;
  const probe = input.probe ?? defaultProbe;
  const readinessTimeoutMs = input.readinessTimeoutMs ?? 30_000;
  const command = [process.execPath, "run", "dev", "--", "--host", "127.0.0.1", "--port", String(input.port)];
  const url = `http://127.0.0.1:${input.port}`;
  let spawned: { pid: number; stop: () => Promise<boolean> } | undefined;
  try {
    spawned = spawn(command, input.cwd, { PLAYWRIGHT_BASE_URL: url });
  } catch {
    return { ok: false, category: "evaluator-server-launch-failed" };
  }
  const deadline = Date.now() + readinessTimeoutMs;
  let ready = false;
  while (Date.now() < deadline) {
    if (await probe(url)) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    await spawned.stop();
    return { ok: false, category: "evaluator-server-timeout" };
  }
  return { ok: true, handle: { pid: spawned.pid, port: input.port, stop: spawned.stop } };
}