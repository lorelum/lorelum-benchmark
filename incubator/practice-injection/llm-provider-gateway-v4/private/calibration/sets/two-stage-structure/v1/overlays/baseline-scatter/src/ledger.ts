export async function recordBilling(entry: unknown): Promise<void> { await Bun.write("billing-v2.jsonl", JSON.stringify(entry)); }
