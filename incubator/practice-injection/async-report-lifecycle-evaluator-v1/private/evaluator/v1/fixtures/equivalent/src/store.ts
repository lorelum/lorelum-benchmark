import { link, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isReportStatus, TOTAL_SEGMENTS, type ReportState } from "./types";

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 10;

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

function stateContents(state: ReportState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
      if (isErrno(error, "ENOENT")) throw new ReportStoreError("REPORT_NOT_FOUND", "report was not found", 404);
      throw new ReportStoreError("STATE_READ_FAILED", "report state could not be read", 500);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ReportStoreError("STATE_CORRUPT", "report state is not valid JSON");
    }
    const state = validateReportState(parsed);
    if (state.id !== id) {
      throw new ReportStoreError("STATE_ID_MISMATCH", "report state id does not match the requested report");
    }
    return state;
  }

  async create(state: ReportState): Promise<void> {
    const validated = validateReportState(state);
    await mkdir(this.dataDir, { recursive: true });
    const destination = this.path(validated.id);
    const temporary = join(this.dataDir, `.${validated.id}.${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temporary, stateContents(validated), "utf8");
      try {
        // A hard link publishes the fully written temporary file without allowing
        // a concurrent create to replace an existing report.
        await link(temporary, destination);
      } catch (error) {
        if (isErrno(error, "EEXIST")) {
          throw new ReportStoreError("REPORT_ALREADY_EXISTS", "report already exists", 409);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ReportStoreError) throw error;
      throw new ReportStoreError("STATE_WRITE_FAILED", "report state could not be written", 500);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async write(state: ReportState): Promise<void> {
    const validated = validateReportState(state);
    await mkdir(this.dataDir, { recursive: true });
    const destination = this.path(validated.id);
    const temporary = join(this.dataDir, `.${validated.id}.${crypto.randomUUID()}.tmp`);
    try {
      let output: ReportState = validated;
      try {
        const existing = JSON.parse(await readFile(destination, "utf8")) as unknown;
        if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
          output = { ...(existing as Record<string, unknown>), ...validated } as ReportState;
        }
      } catch (error) {
        if (!isErrno(error, "ENOENT")) throw error;
      }
      await writeFile(temporary, stateContents(output), "utf8");
      await rename(temporary, destination);
    } catch {
      await rm(temporary, { force: true });
      throw new ReportStoreError("STATE_WRITE_FAILED", "report state could not be written", 500);
    }
  }

  async withReportLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    assertReportId(id);
    await mkdir(this.dataDir, { recursive: true });
    const lockPath = join(this.dataDir, `.${id}.lock`);
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    while (true) {
      try {
        await mkdir(lockPath);
        break;
      } catch (error) {
        if (!isErrno(error, "EEXIST")) {
          throw new ReportStoreError("STATE_LOCK_FAILED", "report state could not be locked", 500);
        }
        try {
          const lockInfo = await stat(lockPath);
          if (Date.now() - lockInfo.mtimeMs > LOCK_STALE_MS) {
            await rm(lockPath, { recursive: true, force: true });
            continue;
          }
        } catch {
          // The competing lock may have been released between mkdir and stat.
          continue;
        }
        if (Date.now() >= deadline) {
          throw new ReportStoreError("REPORT_BUSY", "report is busy; retry the operation", 409);
        }
        await wait(LOCK_RETRY_MS);
      }
    }

    try {
      return await operation();
    } finally {
      await rm(lockPath, { recursive: true, force: true });
    }
  }
}
