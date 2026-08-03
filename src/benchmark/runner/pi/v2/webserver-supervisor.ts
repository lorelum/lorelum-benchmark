// Controlled WebServer supervisor for diagnostic evaluator attempts. Allocates
// a free port, launches the Vite dev server, waits for readiness, and
// guarantees process-tree cleanup on exit, failure, and timeout. Cleanup is
// verified with a bounded port-release probe so an unconfirmed teardown can be
// reported instead of letting a leftover server block the next attempt.
// Candidate public files are never modified; the server URL is passed to the
// evaluator through PLAYWRIGHT_BASE_URL.

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

export type SpawnedServer = {
  pid: number;
  exited: Promise<number | null>;
  stop: () => Promise<boolean>;
};

export type ServerSpawn = (command: string[], cwd: string, env: Record<string, string>) => SpawnedServer;

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

function defaultSpawn(command: string[], cwd: string, env: Record<string, string>): SpawnedServer {
  const child = Bun.spawn(command, { cwd, env: { ...Bun.env, ...env }, stdout: "ignore", stderr: "ignore" });
  return {
    pid: child.pid,
    exited: child.exited,
    stop: async () => {
      await terminateProcessTree(child.pid);
      try { child.kill(); } catch { }
      return true;
    }
  };
}

export type WebServerStarter = (cwd: string, port: number) => Promise<{ ok: true; handle: WebServerHandle } | { ok: false; category: WebServerFailureCategory }>;

export const realWebServerStarter: WebServerStarter = (cwd, port) => startWebServer({ cwd, port });

async function portReleased(port: number): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForPortRelease(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portReleased(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function startWebServer(input: {
  cwd: string;
  port: number;
  spawn?: ServerSpawn;
  probe?: (url: string) => Promise<boolean>;
  readinessTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}): Promise<{ ok: true; handle: WebServerHandle } | { ok: false; category: WebServerFailureCategory }> {
  const spawn = input.spawn ?? defaultSpawn;
  const probe = input.probe ?? defaultProbe;
  const readinessTimeoutMs = input.readinessTimeoutMs ?? 30_000;
  const cleanupTimeoutMs = input.cleanupTimeoutMs ?? 5_000;
  const command = [process.execPath, "run", "dev", "--", "--host", "127.0.0.1", "--port", String(input.port)];
  const url = `http://127.0.0.1:${input.port}`;
  let spawned: SpawnedServer;
  try {
    spawned = spawn(command, input.cwd, { PLAYWRIGHT_BASE_URL: url });
  } catch {
    return { ok: false, category: "evaluator-server-launch-failed" };
  }
  let exitedCode: number | null | undefined;
  let exitedResolved = false;
  void spawned.exited.then((code) => { exitedCode = code; exitedResolved = true; });
  const deadline = Date.now() + readinessTimeoutMs;
  let ready = false;
  while (Date.now() < deadline) {
    if (exitedResolved) {
      await spawned.stop();
      return { ok: false, category: "evaluator-server-launch-failed" };
    }
    if (await probe(url)) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    await spawned.stop();
    if (exitedResolved) return { ok: false, category: "evaluator-server-launch-failed" };
    return { ok: false, category: "evaluator-server-timeout" };
  }
  return {
    ok: true,
    handle: {
      pid: spawned.pid,
      port: input.port,
      stop: async () => {
        const treeStopped = await spawned.stop();
        const released = await waitForPortRelease(input.port, cleanupTimeoutMs);
        return treeStopped && released;
      }
    }
  };
}