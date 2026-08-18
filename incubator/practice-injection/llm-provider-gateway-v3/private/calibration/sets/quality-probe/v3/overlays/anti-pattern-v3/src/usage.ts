import { appendFile } from "node:fs/promises";
import type { ModelAggregate, TenantAggregate, UsageRecord } from "./types";

export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

const records: UsageRecord[] = [];
const budgetState: Record<string, { limit: number; held: number; spent: number }> = {};
const idempotencyState: Record<string, { body: string; value: unknown }> = {};
let chain: Promise<void> = Promise.resolve();

export function lock<T>(action: () => T | Promise<T>): Promise<T> {
  const next = chain.then(action, action);
  chain = next.then(() => undefined, () => undefined);
  return next;
}

export async function appendRecord(entry: UsageRecord): Promise<void> {
  await lock(() => records.push(entry));
  if (process.env.GATEWAY_LOG_PATH) await appendFile(process.env.GATEWAY_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function snap(filters: { tenant?: string; model?: string; status?: number } = {}): { byModel: Record<string, ModelAggregate>; byTenant: Record<string, TenantAggregate> } {
  const matching = records.filter((entry) =>
    (!filters.tenant || entry.tenant === filters.tenant) &&
    (!filters.model || entry.model === filters.model) &&
    (filters.status === undefined || entry.status === filters.status));
  const models: Record<string, { requests: number; promptTokens: number; completionTokens: number; totalCost: number; totalLatencyMs: number; maxLatencyMs: number }> = {};
  for (const entry of matching) {
    const current = models[entry.model] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
    current.requests += 1;
    current.promptTokens += entry.promptTokens;
    current.completionTokens += entry.completionTokens;
    current.totalCost += entry.cost;
    current.totalLatencyMs += entry.latencyMs;
    current.maxLatencyMs = Math.max(current.maxLatencyMs, entry.latencyMs);
    models[entry.model] = current;
  }
  const byModel: Record<string, ModelAggregate> = {};
  for (const [model, totals] of Object.entries(models)) {
    byModel[model] = {
      requests: totals.requests,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalCost: round6(totals.totalCost),
      avgLatencyMs: Math.round(totals.totalLatencyMs / totals.requests),
      maxLatencyMs: totals.maxLatencyMs,
    };
  }
  const spent: Record<string, number> = {};
  for (const entry of matching) spent[entry.tenant] = (spent[entry.tenant] ?? 0) + entry.cost;
  const byTenant: Record<string, TenantAggregate> = {};
  for (const [tenant, totalCost] of Object.entries(spent)) {
    const rawLimit = Number(process.env[`BUDGET_${tenant.toUpperCase()}`] ?? "0");
    const state = budgetState[tenant] ?? { limit: rawLimit, held: 0, spent: 0 };
    byTenant[tenant] = {
      requests: matching.filter((entry) => entry.tenant === tenant).length,
      totalCost: round6(totalCost),
      budget: rawLimit,
      remainingBudget: round6(Math.max(0, rawLimit - state.held - state.spent)),
    };
  }
  return { byModel, byTenant };
}

export async function reserve(tenant: string, maxTokens: number, maxPrice: number): Promise<{ reserved: number } | null> {
  const limit = Number(process.env[`BUDGET_${tenant.toUpperCase()}`]);
  if (!Number.isFinite(limit) || limit === 0) return null;
  return lock(() => {
    const state = budgetState[tenant] ?? { limit, held: 0, spent: 0 };
    const reserved = round6((maxTokens * maxPrice) / 1_000_000);
    if (round6(state.held + state.spent + reserved) > limit) return null;
    state.held = round6(state.held + reserved);
    budgetState[tenant] = state;
    return { reserved };
  });
}

export async function settle(tenant: string, reserved: number, cost: number): Promise<void> {
  await lock(() => {
    const state = budgetState[tenant] ?? { limit: 0, held: 0, spent: 0 };
    state.held = round6(state.held - reserved);
    state.spent = round6(state.spent + cost);
    budgetState[tenant] = state;
  });
}

export async function idempotentLookup(tenant: string, key: string | undefined, body: string): Promise<{ kind: "miss" } | { kind: "hit"; value: unknown } | { kind: "conflict" }> {
  if (!key) return { kind: "miss" };
  return lock(() => {
    const existing = idempotencyState[`${tenant}\0${key}`];
    if (!existing) return { kind: "miss" };
    return existing.body === body ? { kind: "hit", value: existing.value } : { kind: "conflict" };
  });
}

export async function remember(tenant: string, key: string | undefined, body: string, value: unknown): Promise<void> {
  if (!key) return;
  await lock(() => { idempotencyState[`${tenant}\0${key}`] = { body, value }; });
}
