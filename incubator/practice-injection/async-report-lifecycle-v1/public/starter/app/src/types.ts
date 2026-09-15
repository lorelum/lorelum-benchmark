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
  "id" | "status" | "completed_segments" | "total_segments" | "last_checkpoint" | "error"
> & {
  schema_version?: 1 | 2;
  writer_version?: string;
  checkpoint_metadata?: { reason: string; segment: number };
  [key: string]: unknown;
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
    error: state.error,
  };
  if (apiVersion === 2) {
    for (const [key, value] of Object.entries(state)) {
      if (!CORE_STATE_KEYS.includes(key as (typeof CORE_STATE_KEYS)[number])) core[key] = value;
    }
    core.schema_version = state.schema_version;
  }
  return core;
}
