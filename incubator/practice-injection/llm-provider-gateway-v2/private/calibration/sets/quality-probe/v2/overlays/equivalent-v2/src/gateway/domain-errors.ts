import type { DomainErrorCode, Usage } from "../types";

export class ProviderUpstreamError extends Error {
  constructor(
    message: string,
    readonly code: Extract<DomainErrorCode, "authentication_failed" | "rate_limited" | "upstream_timeout" | "upstream_error">,
    readonly retryable: boolean,
    readonly usage?: Usage,
  ) {
    super(message);
  }
}

export class GatewayError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    readonly status: number,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
  }
}

export function upstreamErrorFromStatus(status: number): ProviderUpstreamError {
  if (status === 401 || status === 403) return new ProviderUpstreamError("upstream rejected the API key", "authentication_failed", false);
  if (status === 429) return new ProviderUpstreamError("upstream rate limit exceeded", "rate_limited", true);
  if (status === 408 || status === 504) return new ProviderUpstreamError("upstream request timed out", "upstream_timeout", true);
  if (status >= 500) return new ProviderUpstreamError(`upstream failed with HTTP ${status}`, "upstream_error", true);
  return new ProviderUpstreamError(`upstream failed with HTTP ${status}`, "upstream_error", false);
}
