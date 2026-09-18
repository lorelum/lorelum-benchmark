import type { TestApp } from "../harness";
import { responseJson } from "../harness";
import type { CheckDefinition } from "./types";
import { expect, expectStatus, expectWorkerExit, expectWorkerRecord, record } from "./types";

export const REPORT_IDS = {
  lifecycle: "lifecycle-main",
  failure: "failure-retry",
  progress: "progress-persistence",
  pause: "pause-checkpoint",
  resume: "resume-progress",
} as const;

function report(value: unknown): Record<string, unknown> {
  return record(value);
}

function expectReport(
  value: unknown,
  expected: { status: string; completed_segments: number; last_checkpoint?: number | null; error_code?: string },
): void {
  const body = report(value);
  expect(body.status === expected.status, "report-status-mismatch");
  expect(body.completed_segments === expected.completed_segments, "report-progress-mismatch");
  if (expected.last_checkpoint !== undefined) expect(body.last_checkpoint === expected.last_checkpoint, "report-checkpoint-mismatch");
  if (expected.error_code !== undefined) {
    const error = record(body.error);
    expect(error.code === expected.error_code, "report-error-code-mismatch");
  }
}

async function create(app: TestApp, baseUrl: string, id: string, apiVersion: 1 | 2 = 1): Promise<unknown> {
  const response = await app.request("POST", `/api/v${apiVersion}/reports`, { id }, baseUrl);
  expectStatus(response, 201, "report-create-failed");
  return responseJson(response);
}

const lifecycleQueuedProcessingCompleted: CheckDefinition = {
  id: "lifecycle-queued-processing-completed",
  async run(app) {
    const server = await app.startServer();
    try {
      const created = await create(app, server.baseUrl, REPORT_IDS.lifecycle);
      expectReport(created, { status: "queued", completed_segments: 0, last_checkpoint: null });
      const first = await app.runWorker(["--report", REPORT_IDS.lifecycle, "--step", "--api-version", "1"]);
      expectWorkerExit(first);
      expectReport(expectWorkerRecord(first), { status: "processing", completed_segments: 1, last_checkpoint: 1 });
      const second = await app.runWorker(["--report", REPORT_IDS.lifecycle, "--step", "--api-version", "1"]);
      expectWorkerExit(second);
      expectReport(expectWorkerRecord(second), { status: "processing", completed_segments: 2, last_checkpoint: 2 });
      const third = await app.runWorker(["--report", REPORT_IDS.lifecycle, "--step", "--api-version", "1"]);
      expectWorkerExit(third);
      expectReport(expectWorkerRecord(third), { status: "completed", completed_segments: 3, last_checkpoint: 3 });
      const response = await app.request("GET", `/api/v1/reports/${REPORT_IDS.lifecycle}`, undefined, server.baseUrl);
      expectStatus(response, 200, "report-read-failed");
      expectReport(responseJson(response), { status: "completed", completed_segments: 3, last_checkpoint: 3 });
    } finally {
      await server.stop();
    }
  },
};

const lifecycleFailureAndRetry: CheckDefinition = {
  id: "lifecycle-failure-and-retry",
  async run(app) {
    const server = await app.startServer();
    try {
      await create(app, server.baseUrl, REPORT_IDS.failure);
      const first = await app.runWorker(["--report", REPORT_IDS.failure, "--step", "--api-version", "1"]);
      expectWorkerExit(first);
      expectReport(expectWorkerRecord(first), { status: "processing", completed_segments: 1, last_checkpoint: 1 });
      const failed = await app.runWorker(["--report", REPORT_IDS.failure, "--step", "--fail-at-segment", "2", "--api-version", "1"]);
      expectWorkerExit(failed);
      expectReport(expectWorkerRecord(failed), {
        status: "failed",
        completed_segments: 1,
        last_checkpoint: 1,
        error_code: "WORKER_SEGMENT_FAILED",
      });
      const retried = await app.runWorker(["--report", REPORT_IDS.failure, "--retry", "--api-version", "1"]);
      expectWorkerExit(retried);
      expectReport(expectWorkerRecord(retried), { status: "processing", completed_segments: 2, last_checkpoint: 2 });
      const completed = await app.runWorker(["--report", REPORT_IDS.failure, "--step", "--api-version", "1"]);
      expectWorkerExit(completed);
      expectReport(expectWorkerRecord(completed), { status: "completed", completed_segments: 3, last_checkpoint: 3 });
    } finally {
      await server.stop();
    }
  },
};

const progressPersistence: CheckDefinition = {
  id: "progress-persistence",
  async run(app) {
    const firstServer = await app.startServer();
    try {
      await create(app, firstServer.baseUrl, REPORT_IDS.progress);
    } finally {
      await firstServer.stop();
    }
    const first = await app.runWorker(["--report", REPORT_IDS.progress, "--step", "--api-version", "1"]);
    expectWorkerExit(first);
    expectReport(expectWorkerRecord(first), { status: "processing", completed_segments: 1, last_checkpoint: 1 });

    const secondServer = await app.startServer();
    try {
      const resumed = await app.request("GET", `/api/v1/reports/${REPORT_IDS.progress}`, undefined, secondServer.baseUrl);
      expectStatus(resumed, 200, "persisted-report-read-failed");
      expectReport(responseJson(resumed), { status: "processing", completed_segments: 1, last_checkpoint: 1 });
      for (const expected of [2, 3]) {
        const step = await app.runWorker(["--report", REPORT_IDS.progress, "--step", "--api-version", "1"]);
        expectWorkerExit(step);
        expectReport(expectWorkerRecord(step), {
          status: expected === 3 ? "completed" : "processing",
          completed_segments: expected,
          last_checkpoint: expected,
        });
      }
    } finally {
      await secondServer.stop();
    }
  },
};

const pauseAtCheckpoint: CheckDefinition = {
  id: "pause-at-checkpoint",
  async run(app) {
    const server = await app.startServer();
    try {
      await create(app, server.baseUrl, REPORT_IDS.pause);
      const first = await app.runWorker(["--report", REPORT_IDS.pause, "--step", "--api-version", "1"]);
      expectWorkerExit(first);
      expectReport(expectWorkerRecord(first), { status: "processing", completed_segments: 1, last_checkpoint: 1 });
      const response = await app.request("POST", `/api/v1/reports/${REPORT_IDS.pause}/pause`, undefined, server.baseUrl);
      expectStatus(response, 200, "pause-request-failed");
      expectReport(responseJson(response), { status: "processing", completed_segments: 1, last_checkpoint: 1 });
      const persisted = record(JSON.parse(await app.readStateBytes(REPORT_IDS.pause)) as unknown);
      expect(persisted.pause_requested === true, "pause-request-not-persisted");
      const paused = await app.runWorker(["--report", REPORT_IDS.pause, "--step", "--api-version", "1"]);
      expectWorkerExit(paused);
      expectReport(expectWorkerRecord(paused), { status: "paused", completed_segments: 2, last_checkpoint: 2 });
      const read = await app.request("GET", `/api/v1/reports/${REPORT_IDS.pause}`, undefined, server.baseUrl);
      expectStatus(read, 200, "paused-report-read-failed");
      expectReport(responseJson(read), { status: "paused", completed_segments: 2, last_checkpoint: 2 });
    } finally {
      await server.stop();
    }
  },
};

const resumePreservesProgress: CheckDefinition = {
  id: "resume-preserves-progress",
  async run(app) {
    await app.writeStateBytes(
      REPORT_IDS.resume,
      `${JSON.stringify({
        schema_version: 1,
        id: REPORT_IDS.resume,
        status: "paused",
        completed_segments: 2,
        total_segments: 3,
        last_checkpoint: 2,
        pause_requested: false,
        error: null,
      }, null, 2)}\n`,
    );
    const server = await app.startServer();
    try {
      const before = await app.request("GET", `/api/v1/reports/${REPORT_IDS.resume}`, undefined, server.baseUrl);
      expectStatus(before, 200, "seeded-report-read-failed");
      expectReport(responseJson(before), { status: "paused", completed_segments: 2, last_checkpoint: 2 });
      const resumed = await app.request("POST", `/api/v1/reports/${REPORT_IDS.resume}/resume`, undefined, server.baseUrl);
      expectStatus(resumed, 200, "resume-request-failed");
      expectReport(responseJson(resumed), { status: "processing", completed_segments: 2, last_checkpoint: 2 });
      const completed = await app.runWorker(["--report", REPORT_IDS.resume, "--step", "--api-version", "1"]);
      expectWorkerExit(completed);
      expectReport(expectWorkerRecord(completed), { status: "completed", completed_segments: 3, last_checkpoint: 3 });
    } finally {
      await server.stop();
    }
  },
};

export const lifecycleChecks: CheckDefinition[] = [
  lifecycleQueuedProcessingCompleted,
  lifecycleFailureAndRetry,
  progressPersistence,
  pauseAtCheckpoint,
  resumePreservesProgress,
];
