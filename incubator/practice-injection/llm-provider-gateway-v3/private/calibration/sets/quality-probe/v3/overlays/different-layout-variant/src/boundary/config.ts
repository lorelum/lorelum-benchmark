import type { ProviderConfig, ProviderProtocol } from "../types";

type EnvLike = Record<string, string | undefined>;

const defaultProviderNames = ["openai", "deepseek", "anthropic", "nebula"];

function protocolFrom(value: string | undefined): ProviderProtocol {
  if (value === "anthropic") return "anthropic";
  if (value === "nebula") return "nebula";
  return "openai";
}

export function loadProvider(name: string, env: EnvLike = process.env): ProviderConfig | null {
  const prefix = name.toUpperCase();
  const model = env[`${prefix}_MODEL`];
  const apiKey = env[`${prefix}_API_KEY`];
  const baseUrl = env[`${prefix}_BASE_URL`];
  if (!model || !apiKey || !baseUrl) return null;
  return {
    name,
    protocol: protocolFrom(env[`${prefix}_PROTOCOL`]),
    model,
    apiKey,
    baseUrl,
    priceInPerMillion: Number(env[`${prefix}_PRICE_IN`] ?? "0"),
    priceOutPerMillion: Number(env[`${prefix}_PRICE_OUT`] ?? "0"),
  };
}

export function loadRegistry(env: EnvLike = process.env): Record<string, ProviderConfig> {
  const names = (env.GATEWAY_PROVIDERS ?? defaultProviderNames.join(","))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const registry: Record<string, ProviderConfig> = {};
  for (const name of names) {
    const provider = loadProvider(name, env);
    if (provider) registry[name] = provider;
  }
  return registry;
}

export function activeProviderName(env: EnvLike = process.env): string {
  return env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
}

export function fallbackProviderName(env: EnvLike = process.env): string | undefined {
  return env.GATEWAY_FALLBACK_PROVIDER || undefined;
}

export function retryAttempts(env: EnvLike = process.env): number {
  const raw = Number(env.GATEWAY_RETRY_ATTEMPTS ?? "1");
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

export function tenantBudget(tenant: string, env: EnvLike = process.env): number | undefined {
  const raw = env[`BUDGET_${tenant.toUpperCase()}`];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function maxOutputPrice(registry: Record<string, ProviderConfig>): number {
  const prices = Object.values(registry).map((provider) => provider.priceOutPerMillion);
  return prices.length > 0 ? Math.max(...prices) : 0;
}
