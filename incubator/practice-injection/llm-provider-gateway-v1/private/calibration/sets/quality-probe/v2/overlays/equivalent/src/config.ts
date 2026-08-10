import type { ProviderConfig } from "../types";

export function loadProvider(name: string, env: Record<string, string | undefined> = process.env): ProviderConfig | null {
  const prefix = name.toUpperCase();
  const model = env[`${prefix}_MODEL`];
  const apiKey = env[`${prefix}_API_KEY`];
  const baseUrl = env[`${prefix}_BASE_URL`];
  if (!model || !apiKey || !baseUrl) return null;
  return {
    name,
    protocol: env[`${prefix}_PROTOCOL`] === "anthropic" ? "anthropic" : "openai",
    model,
    apiKey,
    baseUrl,
    priceInPerMillion: Number(env[`${prefix}_PRICE_IN`] ?? "0"),
    priceOutPerMillion: Number(env[`${prefix}_PRICE_OUT`] ?? "0"),
  };
}

export function activeProvider(env: Record<string, string | undefined> = process.env): ProviderConfig {
  const name = env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
  const provider = loadProvider(name, env);
  if (!provider) throw new Error(`provider ${name} is not configured`);
  return provider;
}

export function loadRegistry(env: Record<string, string | undefined> = process.env): Record<string, ProviderConfig> {
  const names = (env.GATEWAY_PROVIDERS ?? "openai,deepseek,anthropic").split(",").map((entry) => entry.trim()).filter(Boolean);
  const registry: Record<string, ProviderConfig> = {};
  for (const name of names) {
    const provider = loadProvider(name, env);
    if (provider) registry[name] = provider;
  }
  return registry;
}