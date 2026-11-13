import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type DockerResult = { code: number | null; stdout: string; stderr: string; failed: boolean };
type Docker = (args: string[], env: NodeJS.ProcessEnv, timeoutMs?: number) => Promise<DockerResult>;
type Start = (name: string, env: NodeJS.ProcessEnv) => ChildProcessWithoutNullStreams;

/** Owns both create clients, both attach clients, and the corresponding containers. */
export async function runEvaluationSession<T>(options: {
  names: [string, string];
  createArgs: [string[], string[]];
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  docker: Docker;
  start?: Start;
  communicate: (driver: ChildProcessWithoutNullStreams, candidate: ChildProcessWithoutNullStreams, timeoutMs: number) => Promise<T>;
}): Promise<{ result?: T; failed: boolean; cleanupVerified: boolean }> {
  const { names, createArgs, env, timeoutMs, docker, communicate } = options;
  const start: Start = options.start ?? ((name, childEnv) => spawn("docker", ["start", "--attach", "--interactive", name], { env: childEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }));
  const deadline = Date.now() + timeoutMs;
  // A failed or malformed create response leaves the daemon outcome unknown.
  const created: (string | undefined)[] = [undefined, undefined];
  const clients: { child: ChildProcessWithoutNullStreams; closed: Promise<void>; isClosed: () => boolean }[] = [];
  let result: T | undefined, failed = false, cleanupVerified = true;
  try {
    await Promise.all(createArgs.map(async (args, index) => {
      try {
        const response = await docker(args, env, timeoutMs);
        const id = response.stdout.trim();
        if (!response.failed && response.code === 0 && /^[a-f0-9]{64}$/.test(id)) created[index] = id;
      } catch { /* The daemon's create outcome is unknown. */ }
    }));
    if (!created.every(Boolean) || Date.now() >= deadline) failed = true;
    else {
      for (const id of created) {
        const child = start(id!, env);
        let closed = false;
        const { promise: exit, resolve } = Promise.withResolvers<void>();
        child.once("close", () => { closed = true; resolve(); });
        // Prevent an unhandled spawn error if the second start throws before the broker is installed.
        child.on("error", () => {});
        clients.push({ child, closed: exit, isClosed: () => closed });
      }
      result = await communicate(clients[0].child, clients[1].child, Math.max(1, deadline - Date.now()));
    }
  } catch {
    failed = true;
  } finally {
    for (const client of clients) {
      if (!client.isClosed()) {
        try { client.child.kill(); } catch { failed = true; }
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
      Promise.all(clients.map(client => client.closed)).then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 10_000); }),
    ]);
    clearTimeout(timer);
    if (!closed) { failed = true; cleanupVerified = false; }
    for (let i = 0; i < names.length; i++) {
      try {
        let target = created[i];
        if (!target) {
          cleanupVerified = false;
          const owner = await docker(["inspect", "--format", '{{index .Config.Labels "lorelum.evaluation"}}', names[i]], env, 10_000);
          if (owner.failed || owner.code !== 0 || owner.stdout.trim() !== names[i]) continue;
          target = names[i];
        }
        const cleanup = await docker(["rm", "-f", "-v", target], env, 10_000);
        const absent = !cleanup.failed && cleanup.code !== 0 && /no such container/i.test(cleanup.stderr);
        if (cleanup.failed || (cleanup.code !== 0 && !(absent && created[i]))) cleanupVerified = false;
      } catch { cleanupVerified = false; }
    }
  }
  return { result, failed, cleanupVerified };
}
