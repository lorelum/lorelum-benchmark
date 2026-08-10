import type { ProviderConfig } from "../types";

export function estimateCost(cfg: ProviderConfig, tokens: { in: number; out: number }): number {
  const raw =
    (tokens.in / 1_000_000) * cfg.priceInPerMillion +
    (tokens.out / 1_000_000) * cfg.priceOutPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}