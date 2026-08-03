import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { allocateFreePort, startWebServer, type ServerSpawn } from "./webserver-supervisor";

test("allocateFreePort returns a distinct free port each call", async () => {
  const [first, second] = await Promise.all([allocateFreePort(), allocateFreePort()]);
  expect(typeof first).toBe("number");
  expect(second).not.toBe(first);
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(first, "127.0.0.1", () => probe.close(() => resolve()));
  });
});


test("startWebServer launches the server and reports ready after probing", async () => {
  const spawned: Array<{ command: string[]; cwd: string; env: Record<string, string> }> = [];
  const spawn: ServerSpawn = (command, cwd, env) => {
    spawned.push({ command, cwd, env });
    return { pid: 42, exited: new Promise(() => {}), stop: async () => true };
  };
  const started = await startWebServer({ cwd: "/app", port: 4000, spawn, probe: async () => true, readinessTimeoutMs: 5_000 });
  expect(started.ok).toBe(true);
  if (started.ok) {
    expect(started.handle.port).toBe(4000);
    expect(started.handle.pid).toBe(42);
    expect(await started.handle.stop()).toBe(true);
  }
  expect(spawned).toHaveLength(1);
  expect(spawned[0].command).toEqual([process.execPath, "run", "dev", "--", "--host", "127.0.0.1", "--port", "4000"]);
  expect(spawned[0].env.PLAYWRIGHT_BASE_URL).toBe("http://127.0.0.1:4000");
});

test("startWebServer fails closed when the server never becomes ready", async () => {
  let stopped = false;
  const spawn: ServerSpawn = (_command, _cwd, _env) => ({
    pid: 1,
    exited: new Promise(() => {}),
    stop: async () => { stopped = true; return true; }
  });
  const started = await startWebServer({ cwd: "/app", port: 4001, spawn, probe: async () => false, readinessTimeoutMs: 50 });
  expect(started.ok).toBe(false);
  if (!started.ok) expect(started.category).toBe("evaluator-server-timeout");
  expect(stopped).toBe(true);
});

test("startWebServer classifies an early child exit as launch failure", async () => {
  const spawn: ServerSpawn = (_command, _cwd, _env) => ({
    pid: 1,
    exited: Promise.resolve(1),
    stop: async () => true
  });
  const started = await startWebServer({ cwd: "/app", port: 4002, spawn, probe: async () => false, readinessTimeoutMs: 200 });
  expect(started.ok).toBe(false);
  if (!started.ok) expect(started.category).toBe("evaluator-server-launch-failed");
});

test("startWebServer fails closed when spawning throws", async () => {
  const started = await startWebServer({
    cwd: "/app",
    port: 4003,
    spawn: () => { throw new Error("boom"); },
    probe: async () => true,
    readinessTimeoutMs: 100
  });
  expect(started.ok).toBe(false);
  if (!started.ok) expect(started.category).toBe("evaluator-server-launch-failed");
});

test("handle.stop returns false when the port is not released", async () => {
  const spawn: ServerSpawn = (_command, _cwd, _env) => ({
    pid: 1,
    exited: new Promise(() => {}),
    stop: async () => true
  });
  // Occupy the port so waitForPortRelease cannot rebind it.
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => { blocker.once("error", reject); blocker.listen(4004, "127.0.0.1", () => resolve()); });
  try {
    const started = await startWebServer({ cwd: "/app", port: 4004, spawn, probe: async () => true, readinessTimeoutMs: 100, cleanupTimeoutMs: 100 });
    expect(started.ok).toBe(true);
    if (started.ok) expect(await started.handle.stop()).toBe(false);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});