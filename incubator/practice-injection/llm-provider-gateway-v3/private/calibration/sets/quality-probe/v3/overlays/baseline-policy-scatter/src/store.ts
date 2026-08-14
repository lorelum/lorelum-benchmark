import { appendFile } from "node:fs/promises";
import type { UsageRecord } from "./types";
import { getTenantBudget } from "./config";

/**
 * In-memory budget ledger. Reservations are synchronous so concurrent requests
 * can never overspend a tenant budget: a reservation either succeeds atomically
 * (reserved += amount) or is rejected.
 */
const budgetState = new Map<string, { reserved: number; spent: number }>();

const records: UsageRecord[] = [];

export function reserveBudget(tenant: string, amount: number): boolean {
  const budget = getTenantBudget(tenant);
  if (budget === undefined) return true; // no budget configured -> unthrottled
  let state = budgetState.get(tenant);
  if (!state) {
    state = { reserved: 0, spent: 0 };
    budgetState.set(tenant, state);
  }
  const available = budget - state.spent - state.reserved;
  if (amount > available) return false;
  state.reserved += amount;
  return true;
}

/** Settle a logical request: release its reservation and charge the actual cost. */
export function settleBudget(tenant: string, reservedAmount: number, actualCost: number): void {
  const state = budgetState.get(tenant);
  if (!state) return;
  state.reserved = Math.max(0, state.reserved - reservedAmount);
  state.spent += actualCost;
}

export function getBudgetInfo(tenant: string): { budget: number; totalCost: number } {
  const budget = getTenantBudget(tenant) ?? 0;
  const totalCost = records.reduce((sum, record) => (record.tenant === tenant ? sum + record.cost : sum), 0);
  return { budget, totalCost };
}

/** One record per logical request (retries / fallback attempts are consolidated). */
export async function addRecord(record: UsageRecord): Promise<void> {
  records.push(record);
  const logPath = process.env.GATEWAY_LOG_PATH;
  if (!logPath) return;
  try {
    await appendFile(logPath, JSON.stringify(record) + "\n", { flag: "a" });
  } catch {
    // request logging must never break the request itself
  }
}

export function queryRecords(filter: { tenant?: string; model?: string; status?: string }): UsageRecord[] {
  return records.filter((record) => {
    if (filter.tenant !== undefined && record.tenant !== filter.tenant) return false;
    if (filter.model !== undefined && record.model !== filter.model) return false;
    if (filter.status !== undefined && String(record.status) !== filter.status) return false;
    return true;
  });
}
