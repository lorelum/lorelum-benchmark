// Shared process-tree termination used by the Pi runner, coordinator, and the
// profile diagnostic evaluator WebServer supervisor. Behavior mirrors the
// verified logic in execute.ts / coordinator.ts; new call sites must use this
// helper so cleanup stays consistent across runners.

async function descendantPids(pid: number): Promise<number[]> {
  const children = Bun.spawn(["pgrep", "-P", String(pid)], { stdout: "pipe", stderr: "ignore" });
  if ((await children.exited) !== 0) return [];
  const output = await new Response(children.stdout).text();
  const direct = output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
  const nested = await Promise.all(direct.map((child) => descendantPids(child)));
  return [...direct, ...nested.flat()];
}

export async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await killer.exited;
    return;
  }
  for (const childPid of (await descendantPids(pid)).reverse()) {
    try { process.kill(childPid, "SIGTERM"); } catch { }
  }
  try { process.kill(pid, "SIGTERM"); } catch { }
}