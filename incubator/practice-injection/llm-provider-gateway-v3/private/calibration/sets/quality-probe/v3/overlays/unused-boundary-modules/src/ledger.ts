import { appendFile } from "node:fs/promises";

export type UsageRecord = {
  promptTokens: number;
  completionTokens: number;
};

const records: UsageRecord[] = [];

export async function recordUsage(record: UsageRecord): Promise<void> {
  records.push(record);
  await appendFile("unused-usage.jsonl", `${JSON.stringify(record)}\n`, "utf-8");
}

export function usageSnapshot(): { requests: number; promptTokens: number } {
  const filtered = records.filter((record) => record.promptTokens >= 0);
  return {
    requests: filtered.length,
    promptTokens: filtered.reduce((sum, record) => sum + record.promptTokens, 0),
  };
}
