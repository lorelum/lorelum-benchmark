import type { DomainErrorCode, Usage } from "./types";

/**
 * Domain error carrying a stable, documented error code. Upstream payloads are
 * never forwarded verbatim; they are translated through this type instead.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  /** Usage the upstream already reported before the stream failed (never fabricated). */
  readonly partialUsage?: Usage;

  constructor(code: DomainErrorCode, status: number, message?: string, partialUsage?: Usage) {
    super(message ?? code);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.partialUsage = partialUsage;
  }
}

export function errorFromUpstreamStatus(status: number): DomainError {
  if (status === 401) return new DomainError("authentication_failed", 401, `upstream returned ${status}`);
  if (status === 429) return new DomainError("rate_limited", 429, `upstream returned ${status}`);
  if (status === 504) return new DomainError("upstream_timeout", 504, `upstream returned ${status}`);
  return new DomainError("upstream_error", 502, `upstream returned ${status}`);
}

export function errorFromStreamErrorType(type: string | undefined, partialUsage?: Usage): DomainError {
  if (type === "overloaded_error" || type === "rate_limit_error" || type === "rate_limited") {
    return new DomainError("rate_limited", 429, type, partialUsage);
  }
  if (type === "authentication_error") return new DomainError("authentication_failed", 401, type, partialUsage);
  if (type === "timeout_error") return new DomainError("upstream_timeout", 504, type, partialUsage);
  return new DomainError("upstream_error", 502, type, partialUsage);
}

/** Rate limits, 5xx and timeouts may be retried / routed to a fallback. */
export function isRetryable(error: DomainError): boolean {
  return error.status === 429 || error.status === 502 || error.status === 504;
}

export function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  return new DomainError("upstream_error", 502, error instanceof Error ? error.message : String(error));
}
