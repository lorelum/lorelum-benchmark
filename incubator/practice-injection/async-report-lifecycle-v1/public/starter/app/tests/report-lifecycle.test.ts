import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";

const appRoot = join(import.meta.dir, "..");
setDefaultTimeout(30_000);
const roots: string[] = [];
const servers: Bun.Subprocess[] = [];

type WorkerResult = {
  exitCode: number;
  value?: Record<string, unknown>;
  stdout: string;
  stderr: string;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startServer(dataDir: string): Promise<{ baseUrl: string }> {
  const server = Bun.spawn([process.execPath, "run", "src/server.ts"], {
    cwd: appRoot,
    env: { ...process.env, REPORT_DATA_DIR: dataDir, REPORT_PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  servers.push(server);

  const reader = server.stdout.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + 5_000;
  let output = "";
  while (Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      sleep(Math.max(1, deadline - Date.now())).then(() => ({ done: true as const, value: undefined })),
    ]);
    if (result.done) break;
    output += decoder.decode(result.value, { stream: true });
    for (const line of output.split(/\r?\n/)) {
      try {
        const message = JSON.parse(line) as { port?: unknown };
        if (typeof message.port === "number" && message.port > 0) {
          return { baseUrl: `http://127.0.0.1:${message.port}` };
        }
      } catch {
        // Wait for the complete startup line.
      }
    }
  }
  throw new Error(`server did not start: ${output}`);
}

async function runWorker(dataDir: string, args: string[], extraEnv: Record<string, string> = {}): Promise<WorkerResult> {
  const worker = Bun.spawn([process.execPath, "run", "src/worker.ts", ...args, "--data-dir", dataDir], {
    cwd: appRoot,
    env: { ...process.env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(worker.stdout).text(),
    new Response(worker.stderr).text(),
    worker.exited,
  ]);
  let value: Record<string, unknown> | undefined;
  if (stdout.trim()) value = JSON.parse(stdout) as Record<string, unknown>;
  return { exitCode, value, stdout, stderr };
}

async function stopServer(server: Bun.Subprocess): Promise<void> {
  try {
    server.kill();
  } catch {
    // It may have exited after a failed test.
  }
  await server.exited;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(stopServer));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "async-report-lifecycle-"));
  roots.push(root);
  const dataDir = join(root, ".data", "reports");
  const { baseUrl } = await startServer(dataDir);
  const request = async (method: string, path: string, body?: unknown): Promise<Response> => fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async <T>(response: Response): Promise<T> => await response.json() as T;
  return { root, dataDir, request, json };
}

describe("public async report starter", () => {
  test("legacy lifecycle reaches completed through three worker steps", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "legacy-complete" }));
    const first = await runWorker(dataDir, ["--report", created.id, "--step"]);
    await runWorker(dataDir, ["--report", created.id, "--step"]);
    const final = await runWorker(dataDir, ["--report", created.id, "--step"]);
    expect(first).toMatchObject({ exitCode: 0, value: { status: "processing", completed_segments: 1 } });
    expect(final).toMatchObject({ exitCode: 0, value: { status: "completed", completed_segments: 3 } });
    expect((await json<{ status: string }>(await request("GET", `/api/v1/reports/${created.id}`))).status).toBe("completed");
  });

  test("pause is applied at the next checkpoint and resume keeps progress", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "pause-resume" }));
    await runWorker(dataDir, ["--report", created.id, "--step"]);
    expect((await json<{ status: string }>(await request("POST", `/api/v1/reports/${created.id}/pause`))).status).toBe("processing");
    const paused = await runWorker(dataDir, ["--report", created.id, "--step"]);
    expect(paused).toMatchObject({ exitCode: 0, value: { status: "paused", completed_segments: 2 } });
    await request("POST", `/api/v1/reports/${created.id}/resume`);
    const completed = await runWorker(dataDir, ["--report", created.id, "--step"]);
    expect(completed).toMatchObject({ exitCode: 0, value: { status: "completed", completed_segments: 3 } });
  });

  test("failure and retry keep the last checkpoint", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "failure-retry" }));
    await runWorker(dataDir, ["--report", created.id, "--step"]);
    const failed = await runWorker(dataDir, ["--report", created.id, "--step", "--fail-at-segment", "2"]);
    expect(failed).toMatchObject({ exitCode: 0, value: { status: "failed", completed_segments: 1, error: { code: "WORKER_SEGMENT_FAILED" } } });
    const retried = await runWorker(dataDir, ["--report", created.id, "--retry"]);
    expect(retried).toMatchObject({ exitCode: 0, value: { status: "processing", completed_segments: 2 } });
  });

  test("the HTTP server and worker CLI operate on the same persisted directory", async () => {
    const { request, json, dataDir } = await fixture();
    await request("POST", "/api/v1/reports", { id: "cli-report" });
    const first = await runWorker(dataDir, ["--report", "cli-report", "--step"]);
    expect(first).toMatchObject({ exitCode: 0, value: { id: "cli-report", status: "processing", completed_segments: 1 } });
    expect(await json<{ completed_segments: number }>(await request("GET", "/api/v1/reports/cli-report"))).toMatchObject({ completed_segments: 1 });
  });

  test("v2 exposes only allowlisted metadata and sanitized errors", async () => {
    const { request, json, dataDir } = await fixture();
    await request("POST", "/api/v2/reports", { id: "safe-public" });
    const statePath = join(dataDir, "safe-public.json");
    const persisted = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    persisted.internal_path = `${dataDir}/private.txt`;
    persisted.stack_trace = "Error: secret stack trace";
    persisted.raw_payload = { credentials: "secret-token" };
    persisted.credentials = "secret-token";
    persisted.error = { code: "__proto__", summary: `${dataDir}/secret.db: password=secret` };
    await writeFile(statePath, `${JSON.stringify(persisted)}\n`, "utf8");

    const response = await request("GET", "/api/v2/reports/safe-public");
    expect(response.status).toBe(200);
    const body = await json<Record<string, unknown>>(response);
    expect(body).toMatchObject({ schema_version: 2, writer_version: "v2", error: { code: "REPORT_ERROR", summary: "report failed" } });
    expect(body).not.toHaveProperty("internal_path");
    expect(body).not.toHaveProperty("stack_trace");
    expect(body).not.toHaveProperty("raw_payload");
    expect(body).not.toHaveProperty("credentials");
    expect(JSON.stringify(body)).not.toContain(dataDir);
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });

  test("a persisted filename must match the state id", async () => {
    const { request, json, dataDir } = await fixture();
    await mkdir(dataDir, { recursive: true });
    const statePath = join(dataDir, "requested.json");
    const original = `${JSON.stringify({
      schema_version: 1,
      id: "other",
      status: "queued",
      completed_segments: 0,
      total_segments: 3,
      last_checkpoint: null,
      pause_requested: false,
      error: null,
    })}\n`;
    await writeFile(statePath, original, "utf8");
    const response = await request("GET", "/api/v1/reports/requested");
    expect(response.status).toBe(409);
    expect(await json<Record<string, unknown>>(response)).toEqual({ error: { code: "STATE_ID_MISMATCH", summary: "report state id does not match the requested report" } });
    expect(await readFile(statePath, "utf8")).toBe(original);
  });

  test("duplicate creation returns a conflict without replacing state", async () => {
    const { request, json, dataDir } = await fixture();
    await request("POST", "/api/v1/reports", { id: "duplicate" });
    await runWorker(dataDir, ["--report", "duplicate", "--step"]);
    const statePath = join(dataDir, "duplicate.json");
    const original = await readFile(statePath, "utf8");
    const response = await request("POST", "/api/v1/reports", { id: "duplicate" });
    expect(response.status).toBe(409);
    expect(await json<Record<string, unknown>>(response)).toEqual({ error: { code: "REPORT_ALREADY_EXISTS", summary: "report already exists" } });
    expect(await readFile(statePath, "utf8")).toBe(original);
    expect(await json<{ status: string; completed_segments: number }>(await request("GET", "/api/v1/reports/duplicate"))).toMatchObject({ status: "processing", completed_segments: 1 });
  });

  test("concurrent worker processes serialize persisted progress", async () => {
    const { request, json, dataDir } = await fixture();
    await request("POST", "/api/v1/reports", { id: "concurrent" });
    const results = await Promise.all(Array.from({ length: 8 }, () => runWorker(dataDir, ["--report", "concurrent", "--step"])));
    expect(results.every((result) => result.exitCode === 0)).toBe(true);
    expect(await json<{ status: string; completed_segments: number }>(await request("GET", "/api/v1/reports/concurrent"))).toMatchObject({ status: "completed", completed_segments: 3 });
  });

  test("corrupt state returns a safe error without exposing the file", async () => {
    const { request, json, dataDir } = await fixture();
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "corrupt.json"), "not-json\n", "utf8");
    const response = await request("GET", "/api/v1/reports/corrupt");
    expect(response.status).toBe(409);
    const payload = await json<{ error: { code: string; summary: string } }>(response);
    expect(payload).toEqual({ error: { code: "STATE_CORRUPT", summary: "report state is not valid JSON" } });
    expect(JSON.stringify(payload)).not.toContain(dataDir);
  });

  test("unsupported state keeps the original bytes", async () => {
    const { request, json, dataDir } = await fixture();
    await mkdir(dataDir, { recursive: true });
    const path = join(dataDir, "future.json");
    const original = JSON.stringify({ schema_version: 99, id: "future", status: "queued" });
    await writeFile(path, original, "utf8");
    const response = await request("GET", "/api/v1/reports/future");
    expect(response.status).toBe(409);
    expect(await json<Record<string, unknown>>(response)).toEqual({ error: { code: "STATE_VERSION_UNSUPPORTED", summary: "report state version is not supported" } });
    expect(await readFile(path, "utf8")).toBe(original);
  });
});
