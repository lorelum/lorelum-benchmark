import type { ProviderConfig, Usage } from "./types";

/**
 * Central cost calculation. Every request's cost is derived here from the
 * provider pricing table; provider adapters never compute cost themselves.
 */
export function costFor(provider: ProviderConfig, usage: Usage): number {
  const raw =
    (usage.promptTokens / 1_000_000) * provider.priceInPerMillion +
    (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}