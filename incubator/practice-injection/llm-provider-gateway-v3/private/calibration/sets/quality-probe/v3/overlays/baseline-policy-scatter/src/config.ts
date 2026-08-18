import type { ProviderConfig, ProviderProtocol } from "./types";

/**
 * Open provider registry: any NAME_MODEL / NAME_API_KEY / NAME_BASE_URL group
 * of environment variables registers a provider named `name`.
 */
export function loadProviderConfig(name: string): ProviderConfig | undefined {
  const prefix = `${name.toUpperCase()}_`;
  const model = process.env[`${prefix}MODEL`];
  const apiKey = process.env[`${prefix}API_KEY`];
  const baseUrl = process.env[`${prefix}BASE_URL`];
  if (!model || !apiKey || !baseUrl) return undefined;
  const protocol = (process.env[`${prefix}PROTOCOL`] ?? "openai") as ProviderProtocol;
  return {
    name,
    protocol,
    model,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    priceInPerMillion: Number(process.env[`${prefix}PRICE_IN`] ?? 0) || 0,
    priceOutPerMillion: Number(process.env[`${prefix}PRICE_OUT`] ?? 0) || 0,
  };
}

export function listProviders(): ProviderConfig[] {
  const names = new Set<string>();
  for (const key of Object.keys(process.env)) {
    if (key.endsWith("_MODEL")) names.add(key.slice(0, -"_MODEL".length).toLowerCase());
  }
  const providers: ProviderConfig[] = [];
  for (const name of names) {
    const config = loadProviderConfig(name);
    if (config) providers.push(config);
  }
  return providers;
}

/** Highest output unit price across the whole registry, used for budget pre-reservation. */
export function maxOutputPrice(): number {
  let max = 0;
  for (const provider of listProviders()) {
    if (provider.priceOutPerMillion > max) max = provider.priceOutPerMillion;
  }
  return max;
}

export function reservationAmount(maxTokens: number): number {
  return roundCost((maxTokens / 1_000_000) * maxOutputPrice());
}

export function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function computeCost(promptTokens: number, completionTokens: number, provider: ProviderConfig): number {
  return roundCost(
    (promptTokens / 1_000_000) * provider.priceInPerMillion +
      (completionTokens / 1_000_000) * provider.priceOutPerMillion,
  );
}

/** USD budget for a tenant, configured via `BUDGET_<TENANT>` (case-insensitive). */
export function getTenantBudget(tenant: string): number | undefined {
  const raw = process.env[`BUDGET_${tenant.toUpperCase()}`];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
