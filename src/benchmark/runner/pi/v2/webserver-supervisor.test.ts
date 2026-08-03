import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { allocateFreePort, startWebServer, type ServerSpawn } from "./webserver-supervisor";

test("allocateFreePort returns a distinct free port each call", async () => {
  const [first, second] = await Promise.all([allocateFreePort(), allocateFreePort()]);
  expect(typeof first).toBe("number");
  expect(second).not.toBe(first);
  // The returned port must be bindable.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(first, "127.0.0.1", () => probe.close(() => resolve()));
  });
});

test("startWebServer launches the server and reports ready after probing", async () => {
  const spawned: Array<{ command: string[]; cwd: string; env: Record<string, string> }> = [];
  const fakeSpawn: ServerSpawn = (command, cwd, env) => {
    spawned.push({ command, cwd, env });
    return { pid: 42, stop: async () => true };
  };
  const started = await startWebServer({ cwd: "/app", port: 4000, spawn: fakeSpawn, probe: async () => true, readinessTimeoutMs: 5_000 });
  expect(started.ok).toBe(true);
  if (started.ok) {
    expect(started.handle.port).toBe(4000);
    expect(started.handle.pid).toBe(42);
  }
  expect(spawned).toHaveLength(1);
  expect(spawned[0].command).toEqual([process.execPath, "run", "dev", "--", "--host", "127.0.0.1", "--port", "4000"]);
  expect(spawned[0].env.PLAYWRIGHT_BASE_URL).toBe("http://127.0.0.1:4000");
});

test("startWebServer fails closed with a stable category when the server never becomes ready", async () => {
  const fakeSpawn: ServerSpawn = (_command, _cwd, _env) => ({ pid: 1, stop: async () => true });
  let stopped = false;
  const started = await startWebServer({
    cwd: "/app",
    port: 4001,
    spawn: (command, cwd, env) => { const s = fakeSpawn(command, cwd, env); s.stop = async () => { stopped = true; return true; }; return s; },
    probe: async () => false,
    readinessTimeoutMs: 50
  });
  expect(started.ok).toBe(false);
  if (!started.ok) expect(started.category).toBe("evaluator-server-timeout");
  expect(stopped).toBe(true);
});

test("startWebServer fails closed when spawning throws", async () => {
  const started = await startWebServer({
    cwd: "/app",
    port: 4002,
    spawn: () => { throw new Error("boom"); },
    probe: async () => true,
    readinessTimeoutMs: 100
  });
  expect(started.ok).toBe(false);
  if (!started.ok) expect(started.category).toBe("evaluator-server-launch-failed");
});