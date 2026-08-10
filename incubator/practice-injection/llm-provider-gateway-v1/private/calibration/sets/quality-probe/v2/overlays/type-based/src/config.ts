import type { ProviderConfig } from "./types";

function value(name: string, env: Record<string, string | undefined>): string | undefined {
  return env[name];
}

export function loadProvider(name: string, env: Record<string, string | undefined> = process.env): ProviderConfig | null {
  const prefix = name.toUpperCase();
  const model = value(`${prefix}_MODEL`, env);
  const apiKey = value(`${prefix}_API_KEY`, env);
  const baseUrl = value(`${prefix}_BASE_URL`, env);
  if (!model || !apiKey || !baseUrl) return null;
  const protocol = value(`${prefix}_PROTOCOL`, env) === "anthropic" ? "anthropic" : "openai";
  const priceInPerMillion = Number(value(`${prefix}_PRICE_IN`, env) ?? "0");
  const priceOutPerMillion = Number(value(`${prefix}_PRICE_OUT`, env) ?? "0");
  return { name, protocol, model, apiKey, baseUrl, priceInPerMillion, priceOutPerMillion };
}

export function activeProviderName(env: Record<string, string | undefined> = process.env): string {
  return env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
}

const DEFAULT_PROVIDERS = ["openai", "deepseek", "anthropic"];

export function loadRegistry(env: Record<string, string | undefined> = process.env): Record<string, ProviderConfig> {
  const names = (env.GATEWAY_PROVIDERS ?? DEFAULT_PROVIDERS.join(",")).split(",").map((entry) => entry.trim()).filter(Boolean);
  const registry: Record<string, ProviderConfig> = {};
  for (const name of names) {
    const provider = loadProvider(name, env);
    if (provider) registry[name] = provider;
  }
  return registry;
}

export function activeProvider(env: Record<string, string | undefined> = process.env): ProviderConfig {
  const name = activeProviderName(env);
  const provider = loadProvider(name, env);
  if (!provider) throw new ProviderNotConfigured(name);
  return provider;
}

export class ProviderNotConfigured extends Error {
  constructor(readonly provider: string) {
    super(`provider ${provider} is not configured`);
  }
}