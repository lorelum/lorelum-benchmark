import { appendFile } from "node:fs/promises";
import type { ModelAggregate, TenantAggregate, UsageRecord } from "./types";

/**
 * In-memory state shared by the gateway: request ledger (also aggregated by
 * /api/usage), per-tenant budget reservations and the idempotency cache.
 */

const records: UsageRecord[] = [];

export function addRecord(record: UsageRecord): void {
  records.push(record);
}

export function allRecords(): UsageRecord[] {
  return records;
}

export interface UsageFilters {
  tenant?: string;
  model?: string;
  status?: string;
}

export function queryUsage(filters: UsageFilters): { byModel: Record<string, ModelAggregate>; byTenant: Record<string, TenantAggregate> } {
  const filtered = records.filter(
    (record) =>
      (filters.tenant === undefined || record.tenant === filters.tenant) &&
      (filters.model === undefined || record.model === filters.model) &&
      (filters.status === undefined || String(record.status) === filters.status),
  );

  const byModel: Record<string, ModelAggregate> = {};
  for (const record of filtered) {
    let aggregate = byModel[record.model];
    if (!aggregate) {
      aggregate = { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, avgLatencyMs: 0, maxLatencyMs: 0 };
      byModel[record.model] = aggregate;
    }
    aggregate.requests += 1;
    aggregate.promptTokens += record.promptTokens;
    aggregate.completionTokens += record.completionTokens;
    aggregate.totalCost += record.cost;
    aggregate.maxLatencyMs = Math.max(aggregate.maxLatencyMs, record.latencyMs);
    aggregate.avgLatencyMs = Math.round((aggregate.avgLatencyMs * (aggregate.requests - 1) + record.latencyMs) / aggregate.requests);
  }

  const byTenant: Record<string, TenantAggregate> = {};
  for (const record of filtered) {
    let aggregate = byTenant[record.tenant];
    if (!aggregate) {
      aggregate = { requests: 0, totalCost: 0, budget: 0, remainingBudget: 0 };
      byTenant[record.tenant] = aggregate;
    }
    aggregate.requests += 1;
    aggregate.totalCost += record.cost;
  }
  for (const tenant of Object.keys(byTenant)) {
    const { budget, remainingBudget } = remainingBudgetFor(tenant);
    byTenant[tenant].budget = budget;
    byTenant[tenant].remainingBudget = remainingBudget;
  }

  return { byModel, byTenant };
}

// ---------------------------------------------------------------------------
// Budget ledger
// ---------------------------------------------------------------------------

interface BudgetState {
  budget: number;
  spent: number;
  pending: number;
}

const budgetStore = new Map<string, BudgetState>();

/** Returns the budget state for a tenant configured via BUDGET_<TENANT>, or undefined when unlimited. */
function budgetState(tenant: string): BudgetState | undefined {
  const envBudget = Number(process.env[`BUDGET_${tenant.toUpperCase()}`]);
  if (!Number.isFinite(envBudget)) return undefined;
  let state = budgetStore.get(tenant);
  if (!state) {
    state = { budget: envBudget, spent: 0, pending: 0 };
    budgetStore.set(tenant, state);
  } else {
    state.budget = envBudget;
  }
  return state;
}

/**
 * Atomically reserve `amount` of the tenant's remaining budget. This function
 * must be called without any intervening await so concurrent requests cannot
 * overspend. Returns the actually reserved amount (0 when no budget is set).
 */
export function reserveBudget(tenant: string, amount: number): { ok: boolean; reserved: number } {
  const state = budgetState(tenant);
  if (!state) return { ok: true, reserved: 0 };
  if (state.budget - state.spent - state.pending < amount) return { ok: false, reserved: 0 };
  state.pending += amount;
  return { ok: true, reserved: amount };
}

/** Settle a request: release the reservation and charge the actual cost. */
export function settleBudget(tenant: string, reserved: number, cost: number): void {
  const state = budgetStore.get(tenant);
  if (!state) return;
  state.pending = Math.max(0, state.pending - reserved);
  state.spent += cost;
}

export function remainingBudgetFor(tenant: string): { budget: number; remainingBudget: number } {
  const state = budgetStore.get(tenant);
  if (!state) return { budget: 0, remainingBudget: 0 };
  return { budget: state.budget, remainingBudget: state.budget - state.spent };
}

// ---------------------------------------------------------------------------
// Idempotency cache
// ---------------------------------------------------------------------------

interface IdempotencyEntry {
  hash: string;
  status: number;
  payload: unknown;
}

const idempotencyStore = new Map<string, IdempotencyEntry>();

function idempotencyKey(tenant: string, key: string): string {
  return `${tenant}\u0000${key}`;
}

export function idempotencyLookup(tenant: string, key: string): IdempotencyEntry | undefined {
  return idempotencyStore.get(idempotencyKey(tenant, key));
}

export function idempotencyStoreResult(tenant: string, key: string, hash: string, status: number, payload: unknown): void {
  idempotencyStore.set(idempotencyKey(tenant, key), { hash, status, payload });
}

// ---------------------------------------------------------------------------
// Structured JSONL request log
// ---------------------------------------------------------------------------

let logTail: Promise<void> = Promise.resolve();

/** Append one logical request record to GATEWAY_LOG_PATH when configured. */
export function writeLogRecord(record: UsageRecord): Promise<void> {
  const path = process.env.GATEWAY_LOG_PATH;
  if (!path) return Promise.resolve();
  const line = `${JSON.stringify(record)}\n`;
  logTail = logTail.then(() => appendFile(path, line, "utf-8")).catch(() => undefined);
  return logTail;
}
