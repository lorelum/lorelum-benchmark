import { buildAdapter } from "./adapters";
import {
  activeProviderName,
  fallbackProviderName,
  maxOutputPrice,
  retryAttempts,
} from "./config";
import { GatewayError, ProviderUpstreamError } from "./errors";
import {
  checkIdempotency,
  reserveBudget,
  settleBudget,
  storeIdempotency,
  type BudgetReservation,
} from "./ledger";
import type { ChatMessage, ChatResult, ProviderConfig, Usage } from "../types";

type EnvLike = Record<string, string | undefined>;

export function resolveProviderChain(registry: Record<string, ProviderConfig>, env: EnvLike = process.env): ProviderConfig[] {
  const activeName = activeProviderName(env);
  const active = registry[activeName];
  if (!active) throw new GatewayError("unsupported_provider", 400, `provider ${activeName} is not configured`);
  const fallbackName = fallbackProviderName(env);
  const fallback = fallbackName ? registry[fallbackName] : undefined;
  return fallback && fallback.name !== active.name ? [active, fallback] : [active];
}

export async function runChatAttempts(
  providers: ProviderConfig[],
  messages: ChatMessage[],
  attempts: number,
): Promise<{ content: string; usage: ChatResult["usage"]; provider: ProviderConfig; retryCount: number }> {
  let lastError: unknown;
  for (const provider of providers) {
    const adapter = buildAdapter(provider);
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        const result = await adapter.chat(messages);
        return { content: result.content, usage: result.usage, provider, retryCount: attempt };
      } catch (error) {
        lastError = error;
        if (!(error instanceof ProviderUpstreamError) || !error.retryable) break;
      }
    }
  }
  if (lastError instanceof ProviderUpstreamError || lastError instanceof GatewayError) throw lastError;
  throw new GatewayError("upstream_error", 502, "all providers failed");
}

export type NormalizedStreamEvent =
  | { type: "delta"; text: string; provider: ProviderConfig }
  | { type: "done"; usage: Usage; provider: ProviderConfig };

export async function* runStreamAttempts(
  providers: ProviderConfig[],
  messages: ChatMessage[],
): AsyncGenerator<NormalizedStreamEvent, void, unknown> {
  let lastError: unknown;
  for (const provider of providers) {
    const adapter = buildAdapter(provider);
    const iterator = adapter.stream(messages);
    let yielded = false;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        yielded = true;
        if (next.value.type === "done") {
          yield { type: "done", usage: next.value.usage, provider };
        } else {
          yield { type: "delta", text: next.value.text, provider };
        }
      }
      return;
    } catch (error) {
      lastError = error;
      if (yielded || !(error instanceof ProviderUpstreamError) || !error.retryable) throw error;
    }
  }
  if (lastError instanceof ProviderUpstreamError || lastError instanceof GatewayError) throw lastError;
  throw new GatewayError("upstream_error", 502, "all providers failed");
}

export async function reserveForTenant(tenant: string, maxTokens: number | undefined, registry: Record<string, ProviderConfig>): Promise<BudgetReservation> {
  return reserveBudget(tenant, maxTokens, maxOutputPrice(registry));
}

export async function settleForTenant(tenant: string, reservation: BudgetReservation, cost: number): Promise<void> {
  await settleBudget(tenant, reservation, cost);
}

export async function lookupIdempotency(tenant: string, key: string | undefined, body: string) {
  return checkIdempotency(tenant, key, body);
}

export async function rememberIdempotency(tenant: string, key: string | undefined, body: string, value: unknown): Promise<void> {
  await storeIdempotency(tenant, key, body, value);
}

export function configuredRetryAttempts(env: EnvLike = process.env): number {
  return retryAttempts(env);
}
