import type { TestApp } from "../harness";
import { responseJson } from "../harness";
import type { CheckDefinition } from "./types";
import { expect, expectStatus, expectWorkerExit, expectWorkerRecord, record } from "./types";

const IDS = {
  overlap: "overlap-state",
  rollback: "rollback-state",
  unsafeCorrupt: "unsafe-corrupt",
  unsafeUnsupported: "unsafe-unsupported",
  unsafeMissing: "unsafe-missing",
  unsafeMismatch: "unsafe-mismatch",
  concurrent: "concurrent-workers",
} as const;

function report(value: unknown): Record<string, unknown> {
  return record(value);
}

async function createV2(app: TestApp, serverUrl: string, id: string): Promise<void> {
  const response = await app.request("POST", `/api/v2/reports`, { id }, serverUrl);
  expectStatus(response, 201, "report-create-failed");
  const body = report(responseJson(response));
  expect(body.status === "queued", "report-not-queued");
}

async function addUnknownFields(app: TestApp, id: string): Promise<void> {
  const persisted = JSON.parse(await app.readStateBytes(id)) as Record<string, unknown>;
  persisted.migration_marker = { source: "v2", retained: true };
  persisted.extension_sequence = 7;
  await app.writeStateBytes(id, `${JSON.stringify(persisted, null, 2)}\n`);
}

async function expectUnknownFields(app: TestApp, id: string): Promise<void> {
  const persisted = JSON.parse(await app.readStateBytes(id)) as Record<string, unknown>;
  expect(persisted.writer_version === "v2", "known-extension-field-dropped");
  expect(record(persisted.migration_marker).source === "v2", "unknown-object-field-dropped");
  expect(persisted.extension_sequence === 7, "unknown-scalar-field-dropped");
}

const overlapPreservesSafeState: CheckDefinition = {
  id: "v1-v2-overlap-preserves-safe-state",
  async run(app) {
    const first = await app.startServer();
    try {
      await createV2(app, first.baseUrl, IDS.overlap);
    } finally {
      await first.stop();
    }
    await addUnknownFields(app, IDS.overlap);
    const v1Step = await app.runWorker(["--report", IDS.overlap, "--step", "--api-version", "1"]);
    expectWorkerExit(v1Step);
    expect(expectWorkerRecord(v1Step).completed_segments === 1, "v1-worker-did-not-advance");
    await expectUnknownFields(app, IDS.overlap);

    const second = await app.startServer();
    try {
      for (const version of [1, 2] as const) {
        const response = await app.request("GET", `/api/v${version}/reports/${IDS.overlap}`, undefined, second.baseUrl);
        expectStatus(response, 200, "overlap-read-failed");
        const body = report(responseJson(response));
        expect(body.status === "processing" && body.completed_segments === 1, "overlap-core-state-mismatch");
      }
      const v2Step = await app.runWorker(["--report", IDS.overlap, "--step", "--api-version", "2"]);
      expectWorkerExit(v2Step);
      await expectUnknownFields(app, IDS.overlap);
      const v1Final = await app.runWorker(["--report", IDS.overlap, "--step", "--api-version", "1"]);
      expectWorkerExit(v1Final);
      await expectUnknownFields(app, IDS.overlap);
    } finally {
      await second.stop();
    }
  },
};

const rollbackPreservesExtensionFields: CheckDefinition = {
  id: "rollback-preserves-extension-fields",
  async run(app) {
    const first = await app.startServer();
    try {
      await createV2(app, first.baseUrl, IDS.rollback);
    } finally {
      await first.stop();
    }
    await addUnknownFields(app, IDS.rollback);
    const before = await app.readStateBytes(IDS.rollback);
    const server = await app.startServer();
    try {
      const pause = await app.request("POST", `/api/v1/reports/${IDS.rollback}/pause`, undefined, server.baseUrl);
      if (pause.status >= 400 && pause.status < 500) {
        const error = record(record(responseJson(pause)).error);
        expect(typeof error.code === "string" && error.code.length > 0, "rollback-rejection-without-code");
        expect(await app.readStateBytes(IDS.rollback) === before, "rollback-rejection-modified-state");
        return;
      }
      expectStatus(pause, 200, "rollback-v1-operation-failed");
      await expectUnknownFields(app, IDS.rollback);
      const step = await app.runWorker(["--report", IDS.rollback, "--step", "--api-version", "1"]);
      expectWorkerExit(step);
      await expectUnknownFields(app, IDS.rollback);
    } finally {
      await server.stop();
    }
  },
};

async function expectUnsafeState(
  app: TestApp,
  id: string,
  contents: string,
  expectedCode: string,
): Promise<void> {
  await app.writeStateBytes(id, contents);
  const before = await app.readStateBytes(id);
  const server = await app.startServer();
  try {
    const response = await app.request("GET", `/api/v1/reports/${id}`, undefined, server.baseUrl);
    expectStatus(response, 409, "unsafe-state-not-rejected");
    const error = record(record(responseJson(response)).error);
    expect(error.code === expectedCode, "unsafe-state-error-code-mismatch");
    expect(await app.readStateBytes(id) === before, "unsafe-state-was-overwritten");
  } finally {
    await server.stop();
  }
}

const unsafeStatePreservedAndRejected: CheckDefinition = {
  id: "unsafe-state-preserved-and-rejected",
  async run(app) {
    await expectUnsafeState(app, IDS.unsafeCorrupt, "not-json\n", "STATE_CORRUPT");
    await expectUnsafeState(
      app,
      IDS.unsafeUnsupported,
      `${JSON.stringify({ schema_version: 99, id: IDS.unsafeUnsupported, status: "queued" })}\n`,
      "STATE_VERSION_UNSUPPORTED",
    );
    await expectUnsafeState(
      app,
      IDS.unsafeMissing,
      `${JSON.stringify({
        schema_version: 1,
        id: IDS.unsafeMissing,
        status: "queued",
        completed_segments: 0,
        last_checkpoint: null,
        pause_requested: false,
        error: null,
      })}\n`,
      "STATE_INVALID",
    );
    await expectUnsafeState(
      app,
      IDS.unsafeMismatch,
      `${JSON.stringify({
        schema_version: 1,
        id: "different-id",
        status: "queued",
        completed_segments: 0,
        total_segments: 3,
        last_checkpoint: null,
        pause_requested: false,
        error: null,
      })}\n`,
      "STATE_ID_MISMATCH",
    );
  },
};

const concurrentWorkersSerializeProgress: CheckDefinition = {
  id: "concurrent-workers-serialize-progress",
  async run(app) {
    const server = await app.startServer();
    try {
      const created = await app.request("POST", `/api/v1/reports`, { id: IDS.concurrent }, server.baseUrl);
      expectStatus(created, 201, "report-create-failed");
    } finally {
      await server.stop();
    }
    const results = await Promise.all(
      Array.from({ length: 8 }, () => app.runWorker(["--report", IDS.concurrent, "--step", "--api-version", "1"])),
    );
    for (const result of results) expectWorkerExit(result);
    const final = JSON.parse(await app.readStateBytes(IDS.concurrent)) as Record<string, unknown>;
    expect(final.status === "completed", "concurrent-workers-did-not-complete");
    expect(final.completed_segments === 3, "concurrent-workers-lost-progress");
  },
};

export const compatibilityChecks: CheckDefinition[] = [
  overlapPreservesSafeState,
  rollbackPreservesExtensionFields,
  unsafeStatePreservedAndRejected,
  concurrentWorkersSerializeProgress,
];
