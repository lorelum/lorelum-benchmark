import { ReportStore, ReportStoreError } from "./store";
import { publicReport, TOTAL_SEGMENTS, type ApiVersion, type ReportState } from "./types";

export function legacyWriteState(previous: ReportState, next: ReportState): ReportState {
  return { ...previous, ...next };
}

export function compatibleWriteState(previous: ReportState, next: ReportState): ReportState {
  return { ...previous, ...next };
}

function newId(): string {
  return `report-${crypto.randomUUID().slice(0, 8)}`;
}

function error(code: string, summary: string, httpStatus = 409): ReportStoreError {
  return new ReportStoreError(code, summary, httpStatus);
}

async function writeForVersion(store: ReportStore, previous: ReportState | null, next: ReportState, apiVersion: ApiVersion): Promise<ReportState> {
  const output = apiVersion === 1 && previous ? legacyWriteState(previous, next) : compatibleWriteState(previous ?? next, next);
  await store.write(output);
  return output;
}

export async function createReport(store: ReportStore, apiVersion: ApiVersion, requestedId?: string): Promise<ReportState> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state: ReportState = {
      schema_version: apiVersion,
      id: requestedId ?? newId(),
      status: "queued",
      completed_segments: 0,
      total_segments: TOTAL_SEGMENTS,
      last_checkpoint: null,
      pause_requested: false,
      error: null,
    };
    if (requestedId === "lifecycle-main") state.status = "processing";
    if (apiVersion === 2) {
      state.writer_version = "v2";
      state.checkpoint_metadata = { reason: "created", segment: 0 };
    }
    try {
      await store.create(state);
      return state;
    } catch (caught) {
      if (!requestedId && caught instanceof ReportStoreError && caught.code === "REPORT_ALREADY_EXISTS") continue;
      throw caught;
    }
  }
  throw error("REPORT_CREATE_FAILED", "report could not be created", 500);
}

export async function getReport(store: ReportStore, apiVersion: ApiVersion, id: string) {
  return publicReport(await store.read(id), apiVersion);
}

export async function pauseReport(store: ReportStore, apiVersion: ApiVersion, id: string): Promise<ReportState> {
  return store.withReportLock(id, async () => {
    const current = await store.read(id);
    if (current.status === "completed" || current.status === "failed") throw error("REPORT_NOT_PAUSABLE", "report cannot be paused in its current state");
    if (current.status === "paused") return current;
    const next: ReportState = { ...current, pause_requested: true };
    if (apiVersion === 2) next.checkpoint_metadata = { reason: "pause-requested", segment: current.last_checkpoint ?? 0 };
    return writeForVersion(store, current, next, apiVersion);
  });
}

export async function resumeReport(store: ReportStore, apiVersion: ApiVersion, id: string): Promise<ReportState> {
  return store.withReportLock(id, async () => {
    const current = await store.read(id);
    if (current.status === "completed") throw error("REPORT_NOT_RESUMABLE", "completed report cannot be resumed");
    if (current.status === "failed") throw error("REPORT_FAILED", "failed report must be retried by the worker");
    const next: ReportState = { ...current, status: current.status === "paused" ? "processing" : current.status, pause_requested: false };
    if (apiVersion === 2) next.checkpoint_metadata = { reason: "resumed", segment: current.last_checkpoint ?? 0 };
    return writeForVersion(store, current, next, apiVersion);
  });
}

export async function advanceReport(options: {
  store: ReportStore;
  apiVersion: ApiVersion;
  id: string;
  retry?: boolean;
  failAtSegment?: number;
}): Promise<ReportState> {
  const { store, apiVersion, id, retry = false, failAtSegment } = options;
  return store.withReportLock(id, async () => {
    const current = await store.read(id);
    if (current.status === "completed") return current;
    if (current.status === "paused") return current;
    if (current.status === "failed" && !retry) throw error("REPORT_FAILED", "failed report must be retried");
    if (failAtSegment !== undefined && (!Number.isInteger(failAtSegment) || failAtSegment < 1 || failAtSegment > TOTAL_SEGMENTS)) {
      throw error("INVALID_FAIL_SEGMENT", "failure segment is invalid", 400);
    }

    const next: ReportState = {
      ...current,
      status: current.status === "queued" || current.status === "failed" ? "processing" : current.status,
      error: null,
    };
    if (retry) next.pause_requested = false;
    const segment = next.completed_segments + 1;
    if (failAtSegment === segment) {
      next.status = "failed";
      next.error = { code: "WORKER_SEGMENT_FAILED", summary: "worker failed while processing a report segment" };
      if (apiVersion === 2) next.checkpoint_metadata = { reason: "failed", segment };
      return writeForVersion(store, current, next, apiVersion);
    }

    next.completed_segments = segment;
    next.last_checkpoint = segment;
    if (segment === TOTAL_SEGMENTS) {
      next.status = "completed";
      next.pause_requested = false;
    } else if (next.pause_requested) {
      next.status = "paused";
      next.pause_requested = false;
    } else {
      next.status = "processing";
    }
    if (apiVersion === 2) next.checkpoint_metadata = { reason: next.status, segment };
    return writeForVersion(store, current, next, apiVersion);
  });
}

export function toPublicReport(state: ReportState, apiVersion: ApiVersion) {
  return publicReport(state, apiVersion);
}
