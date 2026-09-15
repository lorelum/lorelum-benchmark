export const TOTAL_SEGMENTS = 3 as const;

export type ApiVersion = 1 | 2;
export type ReportStatus = "queued" | "processing" | "paused" | "completed" | "failed";

export type ReportError = {
  code: string;
  summary: string;
};

export type ReportState = {
  schema_version: 1 | 2;
  id: string;
  status: ReportStatus;
  completed_segments: number;
  total_segments: typeof TOTAL_SEGMENTS;
  last_checkpoint: number | null;
  pause_requested: boolean;
  error: ReportError | null;
  [key: string]: unknown;
};

export type PublicReport = Pick<
  ReportState,
  "id" | "status" | "completed_segments" | "total_segments" | "last_checkpoint"
> & {
  error: ReportError | null;
  schema_version?: 1 | 2;
  writer_version?: string;
  checkpoint_metadata?: { reason: string; segment: number };
};

export const CORE_STATE_KEYS = [
  "schema_version",
  "id",
  "status",
  "completed_segments",
  "total_segments",
  "last_checkpoint",
  "pause_requested",
  "error",
] as const;

const PUBLIC_ERROR_SUMMARIES: Record<string, string> = {
  WORKER_SEGMENT_FAILED: "worker failed while processing a report segment",
};

const PUBLIC_CHECKPOINT_REASONS = new Set([
  "created",
  "pause-requested",
  "resumed",
  "failed",
  "processing",
  "paused",
  "completed",
]);

function publicError(error: ReportError | null): ReportError | null {
  if (error === null) return null;
  const summary = PUBLIC_ERROR_SUMMARIES[error.code];
  if (summary === undefined) return { code: "REPORT_ERROR", summary: "report failed" };
  return { code: error.code, summary };
}

function publicCheckpointMetadata(value: unknown): PublicReport["checkpoint_metadata"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const metadata = value as Record<string, unknown>;
  const segment = metadata.segment;
  if (typeof metadata.reason !== "string" || !PUBLIC_CHECKPOINT_REASONS.has(metadata.reason) || typeof segment !== "number" || !Number.isInteger(segment) || segment < 0 || segment > TOTAL_SEGMENTS) {
    return undefined;
  }
  return { reason: metadata.reason, segment };
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return value === "queued" || value === "processing" || value === "paused" || value === "completed" || value === "failed";
}

export function publicReport(state: ReportState, apiVersion: ApiVersion): PublicReport {
  const core: PublicReport = {
    id: state.id,
    status: state.status,
    completed_segments: state.completed_segments,
    total_segments: state.total_segments,
    last_checkpoint: state.last_checkpoint,
    error: publicError(state.error),
  };
  if (apiVersion === 2) {
    core.schema_version = state.schema_version;
    if (state.writer_version === "v2") {
      core.writer_version = state.writer_version;
    }
    const checkpointMetadata = publicCheckpointMetadata(state.checkpoint_metadata);
    if (checkpointMetadata !== undefined) core.checkpoint_metadata = checkpointMetadata;
  }
  return core;
}
