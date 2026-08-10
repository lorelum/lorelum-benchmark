import { appendFile } from "node:fs/promises";
import type { UsageAggregate, UsageRecord } from "./types";

type RunningTotals = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
};

const totals: Record<string, RunningTotals> = {};

export async function recordUsage(entry: UsageRecord): Promise<void> {
  const current = totals[entry.model] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
  current.requests += 1;
  current.promptTokens += entry.promptTokens;
  current.completionTokens += entry.completionTokens;
  current.totalCost += entry.cost;
  current.totalLatencyMs += entry.latencyMs;
  current.maxLatencyMs = Math.max(current.maxLatencyMs, entry.latencyMs);
  totals[entry.model] = current;
  const logPath = process.env.GATEWAY_LOG_PATH;
  if (logPath) await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function usageAggregates(): Record<string, UsageAggregate> {
  const result: Record<string, UsageAggregate> = {};
  for (const [model, current] of Object.entries(totals)) {
    result[model] = {
      model,
      requests: current.requests,
      promptTokens: current.promptTokens,
      completionTokens: current.completionTokens,
      totalCost: current.totalCost,
      avgLatencyMs: Math.round(current.totalLatencyMs / current.requests),
      maxLatencyMs: current.maxLatencyMs,
    };
  }
  return result;
}