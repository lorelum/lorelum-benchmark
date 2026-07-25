import { rm } from "node:fs/promises";

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:3100/reports/adoption")).ok) return; } catch { }
    await Bun.sleep(100);
  }
  throw new Error("Next production server did not become ready");
}

async function stopServer(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
  } else {
    try { process.kill(pid, "SIGTERM"); } catch { }
  }
}

const server = Bun.spawn(["node", "./node_modules/next/dist/bin/next", "start", "-p", "3100"], {
  cwd: import.meta.dir + "/..",
  env: { ...Bun.env, NEXT_TELEMETRY_DISABLED: "1" },
  stdout: "pipe",
  stderr: "pipe"
});

let exitCode = 1;
try {
  await waitForServer();
  const tests = Bun.spawn([process.execPath, "x", "playwright", "test"], {
    cwd: import.meta.dir + "/..",
    env: { ...Bun.env, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });
  exitCode = await tests.exited;
} finally {
  await stopServer(server.pid);
  await rm(import.meta.dir + "/../test-results", { recursive: true, force: true });
}
process.exit(exitCode);
