import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isReportStatus, TOTAL_SEGMENTS, type ReportState } from "./types";

export class ReportStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 409,
  ) {
    super(message);
    this.name = "ReportStoreError";
  }
}

function assertReportId(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    throw new ReportStoreError("INVALID_REPORT_ID", "report id is invalid", 400);
  }
}

function parseError(value: unknown): ReportState["error"] {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) throw new ReportStoreError("STATE_INVALID", "report state is invalid");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || typeof candidate.summary !== "string") {
    throw new ReportStoreError("STATE_INVALID", "report state error is invalid");
  }
  return { code: candidate.code, summary: candidate.summary };
}

export function validateReportState(value: unknown): ReportState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReportStoreError("STATE_INVALID", "report state is invalid");
  }
  const state = value as Record<string, unknown>;
  if (state.schema_version !== 1 && state.schema_version !== 2) {
    throw new ReportStoreError("STATE_VERSION_UNSUPPORTED", "report state version is not supported");
  }
  if (typeof state.id !== "string") throw new ReportStoreError("STATE_INVALID", "report state id is invalid");
  assertReportId(state.id);
  if (!isReportStatus(state.status)) throw new ReportStoreError("STATE_INVALID", "report status is invalid");
  if (!Number.isInteger(state.completed_segments) || Number(state.completed_segments) < 0 || Number(state.completed_segments) > TOTAL_SEGMENTS) {
    throw new ReportStoreError("STATE_INVALID", "report progress is invalid");
  }
  if (state.total_segments !== TOTAL_SEGMENTS) throw new ReportStoreError("STATE_INVALID", "report segment count is invalid");
  if (state.last_checkpoint !== null && (!Number.isInteger(state.last_checkpoint) || Number(state.last_checkpoint) < 1 || Number(state.last_checkpoint) > TOTAL_SEGMENTS)) {
    throw new ReportStoreError("STATE_INVALID", "report checkpoint is invalid");
  }
  if (typeof state.pause_requested !== "boolean") throw new ReportStoreError("STATE_INVALID", "report pause request is invalid");
  const error = parseError(state.error);
  return { ...state, error } as ReportState;
}

export function reportPath(dataDir: string, id: string): string {
  assertReportId(id);
  return join(dataDir, `${id}.json`);
}

export class ReportStore {
  constructor(public readonly dataDir: string) {}

  path(id: string): string {
    return reportPath(this.dataDir, id);
  }

  async read(id: string): Promise<ReportState> {
    const path = this.path(id);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ReportStoreError("REPORT_NOT_FOUND", "report was not found", 404);
      throw new ReportStoreError("STATE_READ_FAILED", "report state could not be read", 500);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ReportStoreError("STATE_CORRUPT", "report state is not valid JSON");
    }
    return validateReportState(parsed);
  }

  async write(state: ReportState): Promise<void> {
    const validated = validateReportState(state);
    await mkdir(this.dataDir, { recursive: true });
    const destination = this.path(validated.id);
    const temporary = join(this.dataDir, `.${validated.id}.${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await rename(temporary, destination);
    } catch {
      await rm(temporary, { force: true });
      throw new ReportStoreError("STATE_WRITE_FAILED", "report state could not be written", 500);
    }
  }
}
