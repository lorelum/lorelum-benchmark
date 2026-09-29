import { isAbsolute, resolve } from "node:path";

export const HARNESS_PROTOCOL_VERSION = 1 as const;
export const DEFAULT_HARNESS_TIMEOUT_MS = 120_000;
export const HARNESS_ENTRYPOINT = "packages/backend/src/benchmark/semantic-retrieval-harness.ts";
export const HARNESS_CACHE_ROOT_ENV = "LORELUM_BENCHMARK_CACHE_ROOT";

const profileIdPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const stableErrorCodes = new Set([
  "invalid_request",
  "profile_mismatch",
  "runtime_unavailable",
  "index_unavailable",
  "store_busy",
  "retrieval_failed",
  "invalid_result",
]);
const requestKeys = ["query", "storeRoot", "embeddingProfileId", "candidateWidth", "resultLimit"] as const;

export interface HarnessRequestV1 {
  query: string;
  storeRoot: string;
  embeddingProfileId: string;
  candidateWidth: number;
  resultLimit: number;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  durationMs: number;
}

export type ProcessRunner = (
  command: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
  environment?: Record<string, string>,
) => Promise<ProcessResult>;

export interface HarnessClientOptions {
  lorelumRoot: string;
  lorelumCommit: string;
  bunExecutable?: string;
  timeoutMs?: number;
  processRunner?: ProcessRunner;
  environment?: Record<string, string>;
}

export interface HarnessSuccess {
  status: "ok";
  candidateIds: string[];
  finalIds: string[];
}

export interface HarnessRuntimeError {
  status: "error";
  errorCode: string;
}

export type HarnessObservation =
  | { kind: "success"; response: HarnessSuccess; exitCode: 0; durationMs: number }
  | { kind: "harness-error"; errorCode: string; exitCode: number; durationMs: number }
  | { kind: "process-error"; errorCode: "launch-failed" | "timed-out" | "process-exited-without-response"; exitCode: number | null; durationMs: number }
  | { kind: "protocol-error"; errorCode: "invalid-request" | "invalid-stdout" | "invalid-response" | "exit-status-mismatch" | "invalid-result"; exitCode: number | null; durationMs: number };

export interface PinnedHarnessClient {
  readonly lorelumRoot: string;
  readonly lorelumCommit: string;
  run(request: HarnessRequestV1, corpusIds: ReadonlySet<string>): Promise<HarnessObservation>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isValidHarnessRequestV1(value: unknown): value is HarnessRequestV1 {
  if (!isRecord(value) || !hasExactKeys(value, requestKeys)) return false;
  return typeof value.query === "string"
    && value.query.trim().length > 0
    && typeof value.storeRoot === "string"
    && isAbsolute(value.storeRoot)
    && typeof value.embeddingProfileId === "string"
    && profileIdPattern.test(value.embeddingProfileId)
    && Number.isInteger(value.candidateWidth)
    && Number(value.candidateWidth) >= 1
    && Number(value.candidateWidth) <= 50
    && Number.isInteger(value.resultLimit)
    && Number(value.resultLimit) >= 1
    && Number(value.resultLimit) <= 50
    && Number(value.resultLimit) <= Number(value.candidateWidth);
}

function exactRequest(request: HarnessRequestV1): HarnessRequestV1 {
  if (!isValidHarnessRequestV1(request)) throw new TypeError("Invalid harness protocol v1 request");
  // Rebuild the payload from the allowlist; never serialize caller-owned objects.
  return {
    query: request.query,
    storeRoot: request.storeRoot,
    embeddingProfileId: request.embeddingProfileId,
    candidateWidth: request.candidateWidth,
    resultLimit: request.resultLimit,
  };
}

function parseSingleJsonLine(stdout: string): unknown | null {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.includes("\r")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function parseHarnessSuccess(value: unknown): HarnessSuccess | null {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "candidateIds", "finalIds"])) return null;
  if (value.status !== "ok" || !Array.isArray(value.candidateIds) || !Array.isArray(value.finalIds)) return null;
  if (!value.candidateIds.every((id) => typeof id === "string" && id.length > 0)) return null;
  if (!value.finalIds.every((id) => typeof id === "string" && id.length > 0)) return null;
  return { status: "ok", candidateIds: value.candidateIds as string[], finalIds: value.finalIds as string[] };
}

function parseHarnessError(value: unknown): HarnessRuntimeError | null {
  if (!isRecord(value) || !hasExactKeys(value, ["status", "errorCode"])) return null;
  if (value.status !== "error" || typeof value.errorCode !== "string" || !stableErrorCodes.has(value.errorCode)) return null;
  return { status: "error", errorCode: value.errorCode };
}

function validateResult(response: HarnessSuccess, request: HarnessRequestV1, corpusIds: ReadonlySet<string>): boolean {
  const candidateSet = new Set(response.candidateIds);
  const finalSet = new Set(response.finalIds);
  if (candidateSet.size !== response.candidateIds.length || finalSet.size !== response.finalIds.length) return false;
  if (response.candidateIds.length > request.candidateWidth || response.finalIds.length > request.resultLimit) return false;
  if (response.finalIds.some((id) => !candidateSet.has(id))) return false;
  if ([...candidateSet, ...finalSet].some((id) => !corpusIds.has(id))) return false;
  return true;
}

export async function defaultProcessRunner(
  command: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
  environment?: Record<string, string>,
): Promise<ProcessResult> {
  const startedAt = performance.now();
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn(command, {
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      ...(environment === undefined ? {} : { env: { ...process.env, ...environment } }),
    });
  } catch {
    return { exitCode: null, stdout: "", stderr: "", durationMs: performance.now() - startedAt };
  }

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  try {
    child.stdin.write(stdin);
    child.stdin.end();
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr, timedOut, durationMs: performance.now() - startedAt };
  } catch {
    child.kill();
    const exitCode = await child.exited.catch(() => null);
    return { exitCode, stdout: "", stderr: "", timedOut, durationMs: performance.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function readGitOutput(processRunner: ProcessRunner, root: string, args: string[]): Promise<ProcessResult> {
  return processRunner(["git", ...args], root, "", 15_000);
}

export async function verifyPinnedCleanCheckout(
  rootPath: string,
  expectedCommit: string,
  processRunner: ProcessRunner = defaultProcessRunner,
): Promise<{ root: string; commit: string }> {
  if (!isAbsolute(rootPath) || !commitPattern.test(expectedCommit)) throw new Error("Invalid pinned Lorelum checkout configuration");
  const root = resolve(rootPath);
  const topLevel = await readGitOutput(processRunner, root, ["rev-parse", "--show-toplevel"]);
  const head = await readGitOutput(processRunner, root, ["rev-parse", "HEAD"]);
  const status = await readGitOutput(processRunner, root, ["status", "--porcelain", "--untracked-files=all"]);
  if (topLevel.exitCode !== 0 || head.exitCode !== 0 || status.exitCode !== 0) throw new Error("Lorelum checkout could not be verified");
  if (resolve(topLevel.stdout.trim()) !== root) throw new Error("Lorelum path is not the checkout root");
  if (head.stdout.trim() !== expectedCommit) throw new Error("Lorelum checkout commit does not match the pinned commit");
  if (status.stdout.trim().length > 0) throw new Error("Lorelum checkout must be clean");
  return { root, commit: expectedCommit };
}

export async function createHarnessV1Client(
  options: HarnessClientOptions,
): Promise<PinnedHarnessClient> {
  const processRunner = options.processRunner ?? defaultProcessRunner;
  const checkout = await verifyPinnedCleanCheckout(options.lorelumRoot, options.lorelumCommit, processRunner);
  const bunExecutable = options.bunExecutable ?? process.execPath;
  const timeoutMs = options.timeoutMs ?? DEFAULT_HARNESS_TIMEOUT_MS;
  const environment = options.environment;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("Harness timeout must be a positive integer");

  return {
    lorelumRoot: checkout.root,
    lorelumCommit: checkout.commit,
    async run(callerRequest, corpusIds) {
      let request: HarnessRequestV1;
      try {
        request = exactRequest(callerRequest);
      } catch {
        return { kind: "protocol-error", errorCode: "invalid-request", exitCode: null, durationMs: 0 };
      }

      const result = await processRunner(
        [bunExecutable, HARNESS_ENTRYPOINT],
        checkout.root,
        `${JSON.stringify(request)}\n`,
        timeoutMs,
        environment,
      );
      if (result.timedOut) return { kind: "process-error", errorCode: "timed-out", exitCode: result.exitCode, durationMs: result.durationMs };
      if (result.exitCode === null) return { kind: "process-error", errorCode: "launch-failed", exitCode: null, durationMs: result.durationMs };

      const payload = parseSingleJsonLine(result.stdout);
      if (payload === null) {
        if (result.exitCode !== 0 && result.stdout.trim().length === 0) {
          return { kind: "process-error", errorCode: "process-exited-without-response", exitCode: result.exitCode, durationMs: result.durationMs };
        }
        return { kind: "protocol-error", errorCode: "invalid-stdout", exitCode: result.exitCode, durationMs: result.durationMs };
      }

      const success = parseHarnessSuccess(payload);
      const harnessError = parseHarnessError(payload);
      if (success && result.exitCode !== 0 || harnessError && result.exitCode === 0) {
        return { kind: "protocol-error", errorCode: "exit-status-mismatch", exitCode: result.exitCode, durationMs: result.durationMs };
      }
      if (harnessError) return { kind: "harness-error", errorCode: harnessError.errorCode, exitCode: result.exitCode, durationMs: result.durationMs };
      if (!success) return { kind: "protocol-error", errorCode: "invalid-response", exitCode: result.exitCode, durationMs: result.durationMs };
      if (!validateResult(success, request, corpusIds)) {
        return { kind: "protocol-error", errorCode: "invalid-result", exitCode: result.exitCode, durationMs: result.durationMs };
      }
      return { kind: "success", response: success, exitCode: 0, durationMs: result.durationMs };
    },
  };
}
