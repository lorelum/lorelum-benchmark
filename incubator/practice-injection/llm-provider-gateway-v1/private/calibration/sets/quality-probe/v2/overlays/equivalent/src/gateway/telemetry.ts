import { appendFile } from "node:fs/promises";
import type { UsageAggregate, UsageRecord } from "../types";

type Ledger = {
  hits: number;
  in: number;
  out: number;
  money: number;
  sumLatency: number;
  maxLatency: number;
};

const books: Record<string, Ledger> = {};

export async function track(entry: UsageRecord): Promise<void> {
  const row = books[entry.model] ?? { hits: 0, in: 0, out: 0, money: 0, sumLatency: 0, maxLatency: 0 };
  row.hits += 1;
  row.in += entry.promptTokens;
  row.out += entry.completionTokens;
  row.money += entry.cost;
  row.sumLatency += entry.latencyMs;
  row.maxLatency = Math.max(row.maxLatency, entry.latencyMs);
  books[entry.model] = row;
  const sink = process.env.GATEWAY_LOG_PATH;
  if (sink) await appendFile(sink, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function summarize(): Record<string, UsageAggregate> {
  const result: Record<string, UsageAggregate> = {};
  for (const [model, row] of Object.entries(books)) {
    result[model] = {
      model,
      requests: row.hits,
      promptTokens: row.in,
      completionTokens: row.out,
      totalCost: row.money,
      avgLatencyMs: Math.round(row.sumLatency / row.hits),
      maxLatencyMs: row.maxLatency,
    };
  }
  return result;
}