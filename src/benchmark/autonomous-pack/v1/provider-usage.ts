export type ProviderUsage = { promptTokens: number; completionTokens: number; totalTokens: number; costUsd?: number };
export type UsageStatus = "pending" | "complete" | "missing" | "interrupted" | "error" | "invalid";
export type UsageRecord = { id: number; status: UsageStatus; usage?: ProviderUsage };

/** Host-side only. Neither response bodies nor request metadata are retained. */
export class UsageCollector {
  private records: UsageRecord[] = [];
  constructor(private readonly onRecord?: (record: UsageRecord) => void) {}

  begin(): UsageCapture {
    const record: UsageRecord = { id: this.records.length + 1, status: "pending" };
    this.records.push(record);
    try { this.onRecord?.({ ...record }); } catch {}
    return new UsageCapture((status, usage) => {
      if (record.status !== "pending") return;
      record.status = status;
      if (usage && status === "complete") record.usage = usage;
      // An observer must never affect the agent's response stream.
      try { this.onRecord?.({ ...record, usage: record.usage && { ...record.usage } }); } catch {}
    });
  }

  snapshot(): { records: UsageRecord[]; complete: boolean; totals: ProviderUsage | null } {
    const records = this.records.map(record => ({ ...record, usage: record.usage && { ...record.usage } }));
    const complete = records.length > 0 && records.every(record => record.status === "complete");
    if (!complete) return { records, complete, totals: null };
    const totals: ProviderUsage = records.reduce((sum, record) => ({
      promptTokens: sum.promptTokens + record.usage!.promptTokens,
      completionTokens: sum.completionTokens + record.usage!.completionTokens,
      totalTokens: sum.totalTokens + record.usage!.totalTokens,
    }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    if (!Object.values(totals).every(Number.isSafeInteger)) return { records, complete: false, totals: null };
    if (records.every(record => typeof record.usage?.costUsd === "number" && Number.isFinite(record.usage.costUsd) && record.usage.costUsd >= 0)) {
      const costUsd = records.reduce((sum, record) => sum + record.usage!.costUsd!, 0);
      if (Number.isFinite(costUsd)) totals.costUsd = costUsd;
    }
    return { records, complete, totals };
  }
}

/** Validate the complete private proxy event stream before reporting totals.
 * A caller must establish that it received all stdout and the proxy exited
 * cleanly after its deliberate stop; neither condition can be inferred here. */
export function auditUsageStream(text: string, cleanStop: boolean): { complete: boolean; totals: ProviderUsage | null } {
  const incomplete = { complete: false, totals: null };
  if (!cleanStop || !text.endsWith("\n")) return incomplete;
  const lines = text.slice(0, -1).split("\n");
  if (!/^model-proxy-ready:\d+$/.test(lines[0] ?? "")) return incomplete;
  const records = new Map<number, UsageRecord | null>();
  let terminal: unknown;
  try {
    for (const line of lines.slice(1)) {
      if (line.startsWith("model-proxy-usage:") && terminal === undefined) {
        const value: unknown = JSON.parse(line.slice("model-proxy-usage:".length));
        if (!value || typeof value !== "object" || Array.isArray(value)) return incomplete;
        const record = value as Record<string, unknown>;
        if (!Number.isSafeInteger(record.id) || (record.id as number) < 1) return incomplete;
        const id = record.id as number;
        if (record.status === "pending") {
          if (records.has(id) || id !== records.size + 1 || Object.hasOwn(record, "usage")) return incomplete;
          records.set(id, null);
        } else {
          if (!records.has(id) || records.get(id) !== null || !["complete", "missing", "interrupted", "error", "invalid"].includes(String(record.status))) return incomplete;
          records.set(id, record as UsageRecord);
        }
      } else if (line.startsWith("model-proxy-stopped:") && terminal === undefined) {
        terminal = JSON.parse(line.slice("model-proxy-stopped:".length));
      } else return incomplete;
    }
  } catch { return incomplete; }
  if (!terminal || typeof terminal !== "object" || Array.isArray(terminal) || records.size === 0) return incomplete;
  const snapshot = terminal as Record<string, unknown>;
  if (snapshot.complete !== true || !Array.isArray(snapshot.records) || snapshot.records.length !== records.size) return incomplete;
  const totals: ProviderUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let costAvailable = true, costUsd = 0;
  for (let id = 1; id <= records.size; id++) {
    const record = records.get(id);
    const saved: unknown = snapshot.records[id - 1];
    if (!record || record.status !== "complete" || !record.usage || !saved || typeof saved !== "object" || Array.isArray(saved)) return incomplete;
    const persisted = saved as Record<string, unknown>;
    const u = record.usage;
    if (persisted.id !== id || persisted.status !== "complete" || JSON.stringify(persisted.usage) !== JSON.stringify(u)) return incomplete;
    if (![u.promptTokens, u.completionTokens, u.totalTokens].every(value => Number.isSafeInteger(value) && value >= 0) || u.promptTokens + u.completionTokens !== u.totalTokens) return incomplete;
    totals.promptTokens += u.promptTokens;
    totals.completionTokens += u.completionTokens;
    totals.totalTokens += u.totalTokens;
    if (typeof u.costUsd === "number" && Number.isFinite(u.costUsd) && u.costUsd >= 0) costUsd += u.costUsd;
    else costAvailable = false;
  }
  if (![totals.promptTokens, totals.completionTokens, totals.totalTokens].every(Number.isSafeInteger)) return incomplete;
  if (costAvailable && Number.isFinite(costUsd)) totals.costUsd = costUsd;
  if (JSON.stringify(snapshot.totals) !== JSON.stringify(totals)) return incomplete;
  return { complete: true, totals };
}

const MAX_BUFFER = 1024 * 1024;

/** Incrementally observes provider bytes; never mutates or returns them. */
export class UsageCapture {
  private decoder = new TextDecoder();
  private buffer = "";
  private usage?: ProviderUsage;
  private costUsd?: number;
  private costInvalid = false;
  private invalid = false;
  private done = false;
  private finished = false;
  private eventData: string[] = [];
  private eventSize = 0;
  constructor(private readonly finishRecord: (status: UsageStatus, usage?: ProviderUsage) => void) {}

  private observe(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { this.invalid = true; return; }
    const obj = value as Record<string, unknown>;
    if (obj.error != null) { this.invalid = true; return; }
    if (obj.usage == null) return;
    if (typeof obj.usage !== "object" || Array.isArray(obj.usage)) { this.invalid = true; return; }
    const raw = obj.usage as Record<string, unknown>;
    const values = [raw.prompt_tokens, raw.completion_tokens, raw.total_tokens];
    if (!values.every(v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) { this.invalid = true; return; }
    const [promptTokens, completionTokens, totalTokens] = values as number[];
    if (promptTokens + completionTokens !== totalTokens) { this.invalid = true; return; }
    const usage = { promptTokens, completionTokens, totalTokens };
    if (this.usage && (this.usage.promptTokens !== promptTokens || this.usage.completionTokens !== completionTokens || this.usage.totalTokens !== totalTokens)) this.invalid = true;
    else this.usage = usage;
    // Only an explicitly USD-denominated provider field is attributable as USD.
    if (Object.hasOwn(raw, "cost_usd")) {
      if (typeof raw.cost_usd !== "number" || !Number.isFinite(raw.cost_usd) || raw.cost_usd < 0 || (this.costUsd !== undefined && this.costUsd !== raw.cost_usd)) this.costInvalid = true;
      else this.costUsd = raw.cost_usd;
    }
  }

  private event() {
    if (!this.eventData.length) return;
    const data = this.eventData.join("\n");
    this.eventData = [];
    this.eventSize = 0;
    if (data === "[DONE]") { this.done = true; return; }
    if (this.done) { this.invalid = true; return; }
    try { this.observe(JSON.parse(data)); } catch { this.invalid = true; }
  }

  private line(line: string) {
    if (!line) { this.event(); return; }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      this.eventSize += value.length;
      if (this.eventSize > MAX_BUFFER) { this.invalid = true; this.eventData = []; return; }
      this.eventData.push(value);
    }
  }

  private consume(text: string, streaming: boolean, final: boolean) {
    this.buffer += text;
    if (!streaming) {
      if (this.buffer.length > MAX_BUFFER) { this.invalid = true; this.buffer = ""; }
      return;
    }
    // A trailing CR may be the first half of a CRLF split across chunks.
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch !== "\n" && ch !== "\r") continue;
      if (ch === "\r" && i + 1 === this.buffer.length && !final) break;
      this.line(this.buffer.slice(start, i));
      if (ch === "\r" && this.buffer[i + 1] === "\n") i++;
      start = i + 1;
    }
    this.buffer = this.buffer.slice(start);
    if (this.buffer.length > MAX_BUFFER) { this.invalid = true; this.buffer = ""; }
    if (final) {
      if (this.buffer) this.line(this.buffer);
      this.buffer = "";
      // An event without a terminating blank line is incomplete per SSE framing.
      if (this.eventData.length) this.invalid = true;
    }
  }

  push(bytes: Uint8Array, streaming: boolean) {
    if (!this.finished) this.consume(this.decoder.decode(bytes, { stream: true }), streaming, false);
  }

  end(streaming: boolean) {
    if (this.finished) return;
    this.consume(this.decoder.decode(), streaming, true);
    if (!streaming && !this.invalid) {
      try { this.observe(JSON.parse(this.buffer)); } catch { this.invalid = true; }
    }
    this.finish(this.invalid ? "invalid" : streaming && !this.done ? "interrupted" : this.usage ? "complete" : "missing");
  }

  finish(status: UsageStatus) {
    if (this.finished) return;
    this.finished = true;
    const usage = this.usage && !this.costInvalid && this.costUsd !== undefined ? { ...this.usage, costUsd: this.costUsd } : this.usage;
    this.finishRecord(status, usage);
  }
}
