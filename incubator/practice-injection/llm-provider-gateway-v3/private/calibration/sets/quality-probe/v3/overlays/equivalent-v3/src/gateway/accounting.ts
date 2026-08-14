import { appendFile } from "node:fs/promises";
import type { ModelAggregate, ProviderConfig, TenantAggregate, Usage, UsageRecord } from "../types";
import { GatewayError } from "./domain-errors";
import { tenantBudget } from "./registry";

export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function costFor(provider: ProviderConfig, usage: Usage): number {
  const raw =
    (usage.promptTokens / 1_000_000) * provider.priceInPerMillion +
    (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return round6(raw);
}

type ModelTotals = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
};

type TenantBudgetState = {
  limit: number;
  held: number;
  spent: number;
};

const records: UsageRecord[] = [];
const modelTotals: Record<string, ModelTotals> = {};
const budgets: Record<string, TenantBudgetState> = {};
const idempotency: Record<string, { body: string; value: unknown }> = {};

let lockChain: Promise<void> = Promise.resolve();

function withLock<T>(action: () => T | Promise<T>): Promise<T> {
  const next = lockChain.then(action, action);
  lockChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function recordUsage(entry: UsageRecord): Promise<void> {
  await withLock(() => {
    records.push(entry);
    const current = modelTotals[entry.model] ?? {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
    };
    current.requests += 1;
    current.promptTokens += entry.promptTokens;
    current.completionTokens += entry.completionTokens;
    current.totalCost += entry.cost;
    current.totalLatencyMs += entry.latencyMs;
    current.maxLatencyMs = Math.max(current.maxLatencyMs, entry.latencyMs);
    modelTotals[entry.model] = current;
  });
  const logPath = process.env.GATEWAY_LOG_PATH;
  if (logPath) await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export type BudgetReservation =
  | { applied: false }
  | { applied: true; tenant: string; reservedAmount: number };

export async function reserveBudget(tenant: string, maxTokens: number | undefined, maxOutputPrice: number): Promise<BudgetReservation> {
  return withLock(() => {
    const limit = tenantBudget(tenant);
    if (limit === undefined) return { applied: false };
    if (!maxTokens || maxTokens <= 0) throw new GatewayError("budget_exceeded", 402, "max_tokens is required for a budgeted tenant");
    const reservedAmount = round6((maxTokens * maxOutputPrice) / 1_000_000);
    const state = budgets[tenant] ?? { limit, held: 0, spent: 0 };
    state.limit = limit;
    if (round6(state.held + state.spent + reservedAmount) > limit) {
      budgets[tenant] = state;
      throw new GatewayError("budget_exceeded", 402, "tenant budget is exhausted");
    }
    state.held = round6(state.held + reservedAmount);
    budgets[tenant] = state;
    return { applied: true, tenant, reservedAmount };
  });
}

export async function settleBudget(tenant: string, reservation: BudgetReservation, actualCost: number): Promise<void> {
  if (!reservation.applied) return;
  await withLock(() => {
    const state = budgets[tenant] ?? { limit: 0, held: 0, spent: 0 };
    state.held = round6(state.held - reservation.reservedAmount);
    state.spent = round6(state.spent + actualCost);
    budgets[tenant] = state;
  });
}

export function remainingBudget(tenant: string): number | undefined {
  const limit = tenantBudget(tenant);
  if (limit === undefined) return undefined;
  const state = budgets[tenant] ?? { limit, held: 0, spent: 0 };
  return round6(Math.max(0, state.limit - state.held - state.spent));
}

export function usageSnapshot(filters: { tenant?: string; model?: string; status?: number } = {}): {
  byModel: Record<string, ModelAggregate>;
  byTenant: Record<string, TenantAggregate>;
} {
  const matching = records.filter((record) => {
    if (filters.tenant && record.tenant !== filters.tenant) return false;
    if (filters.model && record.model !== filters.model) return false;
    if (filters.status !== undefined && record.status !== filters.status) return false;
    return true;
  });
  const modelAgg: Record<string, ModelTotals> = {};
  for (const record of matching) {
    const current = modelAgg[record.model] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
    current.requests += 1;
    current.promptTokens += record.promptTokens;
    current.completionTokens += record.completionTokens;
    current.totalCost += record.cost;
    current.totalLatencyMs += record.latencyMs;
    current.maxLatencyMs = Math.max(current.maxLatencyMs, record.latencyMs);
    modelAgg[record.model] = current;
  }
  const byModel: Record<string, ModelAggregate> = {};
  for (const [model, totals] of Object.entries(modelAgg)) {
    byModel[model] = {
      requests: totals.requests,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalCost: round6(totals.totalCost),
      avgLatencyMs: Math.round(totals.totalLatencyMs / totals.requests),
      maxLatencyMs: totals.maxLatencyMs,
    };
  }
  const tenantSpent: Record<string, number> = {};
  for (const record of matching) tenantSpent[record.tenant] = (tenantSpent[record.tenant] ?? 0) + record.cost;
  const byTenant: Record<string, TenantAggregate> = {};
  for (const tenant of Object.keys(tenantSpent)) {
    const budget = tenantBudget(tenant);
    byTenant[tenant] = {
      requests: matching.filter((record) => record.tenant === tenant).length,
      totalCost: round6(tenantSpent[tenant]),
      budget: budget ?? 0,
      remainingBudget: remainingBudget(tenant) ?? 0,
    };
  }
  return { byModel, byTenant };
}

export function makeTraceId(): string {
  return crypto.randomUUID();
}

export type IdempotencyLookup =
  | { kind: "miss" }
  | { kind: "hit"; value: unknown }
  | { kind: "conflict" };

export async function checkIdempotency(tenant: string, key: string | undefined, body: string): Promise<IdempotencyLookup> {
  if (!key) return { kind: "miss" };
  return withLock(() => {
    const id = `${tenant}\0${key}`;
    const existing = idempotency[id];
    if (!existing) return { kind: "miss" };
    if (existing.body !== body) return { kind: "conflict" };
    return { kind: "hit", value: existing.value };
  });
}

export async function storeIdempotency(tenant: string, key: string | undefined, body: string, value: unknown): Promise<void> {
  if (!key) return;
  await withLock(() => {
    idempotency[`${tenant}\0${key}`] = { body, value };
  });
}
