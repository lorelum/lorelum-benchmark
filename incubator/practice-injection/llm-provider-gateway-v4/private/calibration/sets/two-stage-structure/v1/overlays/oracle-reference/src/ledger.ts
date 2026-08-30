import { appendFile } from "node:fs/promises";

export async function recordBilling(entry: { tenant: string; provider: string; input: number; output: number; cost: number; trace_id: string }): Promise<void> {
  await appendFile("usage.jsonl", JSON.stringify(entry) + "\n");
}
