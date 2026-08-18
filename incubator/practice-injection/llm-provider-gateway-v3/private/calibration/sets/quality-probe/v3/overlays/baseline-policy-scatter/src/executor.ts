import type { ChatRequest, ProviderConfig, StreamEvent, Usage } from "./types";
import { DomainError, isRetryable, toDomainError } from "./errors";
import { loadProviderConfig } from "./config";
import { callProvider } from "./providers";

export type StreamExecution = { stream: true; provider: ProviderConfig; events: AsyncGenerator<StreamEvent> };
export type NonStreamExecution = { stream: false; provider: ProviderConfig; content: string; usage: Usage };
export type ExecutionSuccess = StreamExecution | NonStreamExecution;

/**
 * Run a logical request across the primary provider (with up to
 * GATEWAY_RETRY_ATTEMPTS retries) and then the configured fallback provider.
 * Only rate limits / 5xx / timeouts are retried or routed to the fallback.
 * retryCount counts every failed attempt before the successful one so one
 * logical request is billed exactly once regardless of retries / fallback.
 */
export async function executeWithRetry(request: ChatRequest, wantStream: true): Promise<{ retryCount: number; result: StreamExecution }>;
export async function executeWithRetry(request: ChatRequest, wantStream: false): Promise<{ retryCount: number; result: NonStreamExecution }>;
export async function executeWithRetry(
  request: ChatRequest,
  wantStream: boolean,
): Promise<{ retryCount: number; result: ExecutionSuccess }> {
  const active = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
  const primary = loadProviderConfig(active);
  if (!primary) throw new DomainError("unsupported_provider", 400, `provider "${active}" is not configured`);

  const retryAttempts = Math.max(0, Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? 1) || 0);
  const attempts: ProviderConfig[] = [];
  for (let i = 0; i <= retryAttempts; i++) attempts.push(primary);

  const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER;
  if (fallbackName && fallbackName.toLowerCase() !== active.toLowerCase()) {
    const fallback = loadProviderConfig(fallbackName);
    if (fallback) for (let i = 0; i <= retryAttempts; i++) attempts.push(fallback);
  }

  let lastError: DomainError | undefined;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await callProvider(attempts[i], request, wantStream);
      if (result.stream) {
        return { retryCount: i, result: { stream: true, provider: attempts[i], events: result.events } };
      }
      return { retryCount: i, result: { stream: false, provider: attempts[i], content: result.content, usage: result.usage } };
    } catch (error) {
      const domainError = toDomainError(error);
      lastError = domainError;
      if (!isRetryable(domainError)) throw domainError;
    }
  }
  throw lastError ?? new DomainError("upstream_error", 502);
}
