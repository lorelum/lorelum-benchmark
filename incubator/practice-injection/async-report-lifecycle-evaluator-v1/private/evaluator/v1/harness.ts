import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { copyDirectory } from "./files";

const STARTUP_TIMEOUT_MS = 10_000;
const PROCESS_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class HarnessError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "HarnessError";
  }
}

export type TestResponse = {
  status: number;
  text: string;
};

export type WorkerResult = {
  exitCode: number;
  value?: unknown;
  stdout: string;
  stderr: string;
};

export type ServerHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

function parseJsonLine(value: string): unknown {
  const lines = value.split(/\r?\n/).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function timeout<T>(promise: Promise<T>, milliseconds: number, reason: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HarnessError(reason, reason)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function stopProcess(process: Bun.Subprocess): Promise<void> {
  try {
    process.kill();
  } catch {
    // The process may already be gone.
  }
  try {
    await timeout(process.exited, 2_000, "process-stop-timeout");
  } catch {
    process.kill(9);
    await process.exited.catch(() => undefined);
  }
}

export class TestApp {
  private constructor(
    public readonly root: string,
    public readonly appRoot: string,
    public readonly dataDir: string,
  ) {}

  static async create(sourceRoot: string): Promise<TestApp> {
    const root = await mkdtemp(join(tmpdir(), "async-report-evaluator-"));
    const appRoot = join(root, "app");
    try {
      await copyDirectory(resolve(sourceRoot), appRoot, (name) => [".data", ".git", "node_modules"].includes(name));
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw new HarnessError("app-copy-failed", error instanceof Error ? error.message : String(error));
    }
    return new TestApp(root, appRoot, join(root, "reports"));
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }

  statePath(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  async readStateBytes(id: string): Promise<string> {
    try {
      return await readFile(this.statePath(id), "utf8");
    } catch (error) {
      throw new HarnessError("state-read-failed", error instanceof Error ? error.message : String(error));
    }
  }

  async writeStateBytes(id: string, value: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.statePath(id), value, "utf8");
  }

  async removeState(id: string): Promise<void> {
    await rm(this.statePath(id), { force: true });
  }

  async request(method: string, path: string, body?: unknown, baseUrl?: string): Promise<TestResponse> {
    const url = `${baseUrl ?? "http://127.0.0.1:1"}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new HarnessError("http-request-failed", error instanceof Error ? error.message : String(error));
    }
    return { status: response.status, text: await response.text() };
  }

  async startServer(): Promise<ServerHandle> {
    let child: Bun.Subprocess;
    try {
      child = Bun.spawn([globalThis.process.execPath, "run", "src/server.ts"], {
        cwd: this.appRoot,
        env: {
          ...globalThis.process.env,
          REPORT_DATA_DIR: this.dataDir,
          REPORT_PORT: "0",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      throw new HarnessError("server-start-failed", error instanceof Error ? error.message : String(error));
    }

    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const next = await Promise.race([
        reader.read().then((value) => ({ kind: "read" as const, value })),
        child.exited.then((code) => ({ kind: "exit" as const, code })),
        new Promise<{ kind: "timeout" }>((resolveTimeout) => setTimeout(() => resolveTimeout({ kind: "timeout" }), remaining)),
      ]);
      if (next.kind === "timeout") break;
      if (next.kind === "exit") {
        const stderr = await new Response(child.stderr).text();
        reader.releaseLock();
        throw new HarnessError("server-exited-before-startup", `server exited with ${next.code}: ${stderr.trim()}`);
      }
      if (next.value.done) break;
      output += decoder.decode(next.value.value, { stream: true });
      for (const line of output.split(/\r?\n/)) {
        try {
          const message = JSON.parse(line) as { port?: unknown };
          if (typeof message.port === "number" && message.port > 0) {
            reader.releaseLock();
            return {
              baseUrl: `http://127.0.0.1:${message.port}`,
              stop: async () => {
                await stopProcess(child);
                await new Response(child.stderr).text().catch(() => "");
              },
            };
          }
        } catch {
          continue;
        }
      }
    }
    reader.releaseLock();
    await stopProcess(child);
    throw new HarnessError("server-startup-timeout", `server did not report a port: ${output.trim()}`);
  }

  async runWorker(args: string[]): Promise<WorkerResult> {
    let child: Bun.Subprocess;
    try {
      child = Bun.spawn([process.execPath, "run", "src/worker.ts", ...args, "--data-dir", this.dataDir], {
        cwd: this.appRoot,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      throw new HarnessError("worker-start-failed", error instanceof Error ? error.message : String(error));
    }
    try {
      const exitCode = await timeout(child.exited, PROCESS_TIMEOUT_MS, "worker-timeout");
      const [stdout, stderr] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const parsed = parseJsonLine(stdout);
      return {
        exitCode,
        ...(parsed === undefined ? {} : { value: parsed }),
        stdout,
        stderr,
      };
    } catch (error) {
      await stopProcess(child);
      throw error;
    }
  }
}

export function responseJson(response: TestResponse): unknown {
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new HarnessError("http-response-invalid-json", "HTTP response was not valid JSON");
  }
}
