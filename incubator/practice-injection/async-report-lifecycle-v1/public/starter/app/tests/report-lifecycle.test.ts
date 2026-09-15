import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { advanceReport } from "../src/report-service";
import { createHandler } from "../src/server";
import { ReportStore } from "../src/store";
import { runWorker } from "../src/worker";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "async-report-lifecycle-"));
  roots.push(root);
  const dataDir = join(root, ".data", "reports");
  const handler = createHandler({ dataDir });
  const request = async (method: string, path: string, body?: unknown) => handler(new Request(`http://fixture${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const json = async <T>(response: Response): Promise<T> => await response.json() as T;
  return { root, dataDir, handler, request, json };
}

describe("public async report starter", () => {
  test("legacy lifecycle reaches completed through three worker steps", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "legacy-complete" }));
    const store = new ReportStore(dataDir);
    await advanceReport({ store, apiVersion: 1, id: created.id });
    await advanceReport({ store, apiVersion: 1, id: created.id });
    const completed = await advanceReport({ store, apiVersion: 1, id: created.id });
    expect(completed.status).toBe("completed");
    expect(completed.completed_segments).toBe(3);
    expect((await json<{ status: string }>(await request("GET", `/api/v1/reports/${created.id}`))).status).toBe("completed");
  });

  test("pause is applied at the next checkpoint and resume keeps progress", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "pause-resume" }));
    const store = new ReportStore(dataDir);
    await advanceReport({ store, apiVersion: 1, id: created.id });
    expect((await json<{ status: string }>(await request("POST", `/api/v1/reports/${created.id}/pause`))).status).toBe("processing");
    const paused = await advanceReport({ store, apiVersion: 1, id: created.id });
    expect(paused.status).toBe("paused");
    expect(paused.completed_segments).toBe(2);
    await request("POST", `/api/v1/reports/${created.id}/resume`);
    const completed = await advanceReport({ store, apiVersion: 1, id: created.id });
    expect(completed.status).toBe("completed");
    expect(completed.completed_segments).toBe(3);
  });

  test("failure and retry keep the last checkpoint", async () => {
    const { request, json, dataDir } = await fixture();
    const created = await json<{ id: string }>(await request("POST", "/api/v1/reports", { id: "failure-retry" }));
    const store = new ReportStore(dataDir);
    await advanceReport({ store, apiVersion: 1, id: created.id });
    const failed = await advanceReport({ store, apiVersion: 1, id: created.id, failAtSegment: 2 });
    expect(failed.status).toBe("failed");
    expect(failed.completed_segments).toBe(1);
    expect(failed.error?.code).toBe("WORKER_SEGMENT_FAILED");
    const retried = await advanceReport({ store, apiVersion: 1, id: created.id, retry: true });
    expect(retried.completed_segments).toBe(2);
    expect(retried.status).toBe("processing");
  });

  test("the worker CLI advances a shared report directory", async () => {
    const { request, json, dataDir } = await fixture();
    await request("POST", "/api/v1/reports", { id: "cli-report" });
    const first = await runWorker(["--report", "cli-report", "--step", "--data-dir", dataDir]);
    expect(first).toMatchObject({ id: "cli-report", status: "processing", completed_segments: 1 });
    await runWorker(["--report", "cli-report", "--step", "--data-dir", dataDir]);
    const final = await runWorker(["--report", "cli-report", "--step", "--data-dir", dataDir]);
    expect(final).toMatchObject({ id: "cli-report", status: "completed", completed_segments: 3 });
    expect((await json<{ status: string }>(await request("GET", "/api/v1/reports/cli-report"))).status).toBe("completed");
  });

  test("v2 exposes additive metadata without changing the core status fields", async () => {
    const { request, json } = await fixture();
    const created = await json<{ id: string; schema_version: number; writer_version: string }>(await request("POST", "/api/v2/reports", { id: "v2-report" }));
    expect(created.schema_version).toBe(2);
    expect(created.writer_version).toBe("v2");
    const state = await json<{ id: string; status: string; total_segments: number }>(await request("GET", "/api/v2/reports/v2-report"));
    expect(state).toMatchObject({ id: "v2-report", status: "queued", total_segments: 3 });
  });

  test("corrupt state returns a safe error without exposing the file", async () => {
    const { request, json, dataDir } = await fixture();
    await Bun.write(join(dataDir, "corrupt.json"), "not-json\n");
    const response = await request("GET", "/api/v1/reports/corrupt");
    expect(response.status).toBe(409);
    const payload = await json<{ error: { code: string; summary: string } }>(response);
    expect(payload).toEqual({ error: { code: "STATE_CORRUPT", summary: "report state is not valid JSON" } });
    expect(JSON.stringify(payload)).not.toContain(dataDir);
  });

  test("unsupported state keeps the original bytes", async () => {
    const { request, dataDir } = await fixture();
    const path = join(dataDir, "future.json");
    const original = JSON.stringify({ schema_version: 99, id: "future", status: "queued" });
    await Bun.write(path, original);
    const response = await request("GET", "/api/v1/reports/future");
    expect(response.status).toBe(409);
    expect(await readFile(path, "utf8")).toBe(original);
  });
});



