import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { buildRegistry, getAdapter, UpstreamError, type StreamEvent } from "./providers";
import type {
  ChatRequest,
  ChatResult,
  DomainErrorCode,
  ModelAggregate,
  ProviderConfig,
  TenantAggregate,
  Usage,
  UsageRecord,
} from "./types";

export type ChatOutcome =
  | { kind: "json"; status: number; payload: Record<string, unknown> }
  | { kind: "stream"; status: number; body: string };

type DomainError = { code: DomainErrorCode; status: number };

type CacheEntry = { bodyHash: string; contentType: "application/json" | "text/event-stream"; body: string };

type AttemptsResult<T> =
  | { ok: true; result: T; provider: ProviderConfig; attempts: number }
  | { ok: false; error: DomainError; lastProvider: ProviderConfig | null; attempts: number };

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  authentication_failed: 401,
  rate_limited: 429,
  upstream_timeout: 504,
  budget_exceeded: 402,
  idempotency_conflict: 409,
  unsupported_provider: 400,
  invalid_request: 422,
  upstream_error: 502,
};

const RETRYABLE_CODES = new Set<DomainErrorCode>(["rate_limited", "upstream_timeout", "upstream_error"]);

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function computeCost(usage: Usage, provider: ProviderConfig): number {
  const raw =
    (usage.promptTokens / 1_000_000) * provider.priceInPerMillion +
    (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return round6(raw);
}

function tenantBudget(tenant: string): number | null {
  const raw = process.env[`BUDGET_${tenant.toUpperCase()}`] ?? process.env[`BUDGET_${tenant}`];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function toDomainError(error: unknown): DomainError {
  if (error instanceof UpstreamError) return { code: error.code, status: error.status };
  if (error instanceof Error && error.name === "AbortError") return { code: "upstream_timeout", status: 504 };
  return { code: "upstream_error", status: 502 };
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Edge policies (fallback/retry, tenant budget, idempotency, metering) are all
 * centralized here. Retries and failover are transport details: one logical
 * request produces exactly one ledger record and one settled cost.
 */
export class Gateway {
  private records: UsageRecord[] = [];
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ChatOutcome>>();
  private budget = new Map<string, { budget: number; held: number; spent: number }>();

  async chat(request: ChatRequest, ctx: { tenant: string; idempotencyKey?: string }): Promise<ChatOutcome> {
    const tenant = ctx.tenant;
    const bodyHash = JSON.stringify(request);
    const cacheKey = ctx.idempotencyKey ? `${tenant}\u0000${ctx.idempotencyKey}` : undefined;

    if (cacheKey) {
      const existing = this.cache.get(cacheKey);
      if (existing) return this.replay(existing, bodyHash);
      const pending = this.inflight.get(cacheKey);
      if (pending) {
        const outcome = await pending;
        const entry = this.cache.get(cacheKey);
        if (entry) return this.replay(entry, bodyHash);
        return outcome;
      }
    }

    const execution = this.execute(request, ctx, cacheKey, bodyHash);
    if (cacheKey) {
      this.inflight.set(cacheKey, execution);
      try {
        return await execution;
      } finally {
        this.inflight.delete(cacheKey);
      }
    }
    return await execution;
  }

  private replay(entry: CacheEntry, bodyHash: string): ChatOutcome {
    if (entry.bodyHash !== bodyHash) {
      return { kind: "json", status: 409, payload: { error: "idempotency_conflict" } };
    }
    if (entry.contentType === "application/json") {
      return { kind: "json", status: 200, payload: JSON.parse(entry.body) as Record<string, unknown> };
    }
    return { kind: "stream", status: 200, body: entry.body };
  }

  private async execute(
    request: ChatRequest,
    ctx: { tenant: string; idempotencyKey?: string },
    cacheKey: string | undefined,
    bodyHash: string,
  ): Promise<ChatOutcome> {
    const start = performance.now();
    const traceId = randomUUID();
    const tenant = ctx.tenant;

    const registry = buildRegistry();
    const activeName = process.env.GATEWAY_ACTIVE_PROVIDER || "openai";
    const active = registry.get(activeName);
    if (!active) return { kind: "json", status: 400, payload: { error: "unsupported_provider" } };

    let hold = 0;
    if (tenantBudget(tenant) !== null) {
      if (typeof request.max_tokens !== "number" || request.max_tokens <= 0) {
        return { kind: "json", status: 422, payload: { error: "invalid_request" } };
      }
      const maxOutPrice = Math.max(0, ...[...registry.values()].map((p) => p.priceOutPerMillion));
      hold = round6((request.max_tokens * maxOutPrice) / 1_000_000);
      if (!this.reserve(tenant, hold)) {
        this.logRecord({
          tenant,
          provider: active.name,
          model: active.model,
          stream: request.stream === true,
          traceId,
          retryCount: 0,
          latencyMs: Math.round(performance.now() - start),
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          status: 402,
          timestamp: new Date().toISOString(),
        });
        return { kind: "json", status: 402, payload: { error: "budget_exceeded" } };
      }
    }

    const retryAttempts = Math.max(0, Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? "1") || 0);
    const targets = [active];
    const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER;
    if (fallbackName && fallbackName !== activeName) {
      const fallback = registry.get(fallbackName);
      if (fallback) targets.push(fallback);
    }

    if (request.stream === true) {
      return await this.executeStream(request, targets, retryAttempts, ctx, cacheKey, bodyHash, traceId, start, hold, active);
    }
    return await this.executeNonStream(request, targets, retryAttempts, ctx, cacheKey, bodyHash, traceId, start, hold, active);
  }

  private async executeNonStream(
    request: ChatRequest,
    targets: ProviderConfig[],
    retryAttempts: number,
    ctx: { tenant: string },
    cacheKey: string | undefined,
    bodyHash: string,
    traceId: string,
    start: number,
    hold: number,
    active: ProviderConfig,
  ): Promise<ChatOutcome> {
    const tenant = ctx.tenant;
    const run = await this.runNonStream(targets, retryAttempts, request);
    const latencyMs = Math.round(performance.now() - start);

    if (run.ok) {
      const { result, provider, attempts } = run;
      const cost = computeCost(result.usage, provider);
      this.settle(tenant, hold, cost);
      const payload = {
        content: result.content,
        provider: provider.name,
        model: provider.model,
        usage: result.usage,
        cost,
      };
      if (cacheKey) this.cache.set(cacheKey, { bodyHash, contentType: "application/json", body: JSON.stringify(payload) });
      this.logRecord({
        tenant,
        provider: provider.name,
        model: provider.model,
        stream: false,
        traceId,
        retryCount: attempts - 1,
        latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        cost,
        status: 200,
        timestamp: new Date().toISOString(),
      });
      return { kind: "json", status: 200, payload };
    }

    const { error, lastProvider, attempts } = run;
    this.settle(tenant, hold, 0);
    const provider = lastProvider ?? active;
    this.logRecord({
      tenant,
      provider: provider.name,
      model: provider.model,
      stream: false,
      traceId,
      retryCount: attempts - 1,
      latencyMs,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      status: error.status,
      timestamp: new Date().toISOString(),
    });
    return { kind: "json", status: error.status, payload: { error: error.code } };
  }

  private async executeStream(
    request: ChatRequest,
    targets: ProviderConfig[],
    retryAttempts: number,
    ctx: { tenant: string },
    cacheKey: string | undefined,
    bodyHash: string,
    traceId: string,
    start: number,
    hold: number,
    active: ProviderConfig,
  ): Promise<ChatOutcome> {
    const tenant = ctx.tenant;
    const run = await this.runStream(targets, retryAttempts, request);
    const latencyMs = Math.round(performance.now() - start);

    if (!run.ok) {
      const { error, lastProvider, attempts } = run;
      this.settle(tenant, hold, 0);
      const provider = lastProvider ?? active;
      this.logRecord({
        tenant,
        provider: provider.name,
        model: provider.model,
        stream: true,
        traceId,
        retryCount: attempts - 1,
        latencyMs,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        status: error.status,
        timestamp: new Date().toISOString(),
      });
      return { kind: "json", status: error.status, payload: { error: error.code } };
    }

    const { result, provider, attempts } = run;
    const gen = result.gen;
    const first = result.first;
    let lastUsage: Usage = first.type === "done" ? first.usage : { promptTokens: 0, completionTokens: 0 };
    let errorCode: DomainErrorCode | null = null;
    let doneEmitted = first.type === "done";
    const chunks: string[] = [];

    if (first.type === "delta") {
      chunks.push(sseLine({ choices: [{ delta: { content: first.text } }] }));
    } else if (first.type === "done") {
      lastUsage = first.usage;
      chunks.push(sseLine({ usage: lastUsage, cost: computeCost(lastUsage, provider), provider: provider.name, model: provider.model }));
    }

    try {
      for await (const event of gen) {
        if (event.type === "delta") {
          chunks.push(sseLine({ choices: [{ delta: { content: event.text } }] }));
        } else if (event.type === "done") {
          lastUsage = event.usage;
          doneEmitted = true;
          chunks.push(sseLine({ usage: lastUsage, cost: computeCost(lastUsage, provider), provider: provider.name, model: provider.model }));
        } else if (event.type === "error") {
          errorCode = event.code;
          lastUsage = event.usage;
          break;
        }
      }
    } catch (streamError) {
      // The upstream connection broke mid-stream: report a terminating error
      // event and only meter the usage the upstream already reported.
      errorCode = toDomainError(streamError).code;
    }

    if (errorCode !== null) {
      chunks.push(sseLine({ error: { code: errorCode } }));
    } else if (!doneEmitted) {
      chunks.push(sseLine({ usage: lastUsage, cost: computeCost(lastUsage, provider), provider: provider.name, model: provider.model }));
    }

    const status = errorCode !== null ? STATUS_BY_CODE[errorCode] : 200;
    const cost = computeCost(lastUsage, provider);
    this.settle(tenant, hold, cost);
    const body = chunks.join("");
    if (cacheKey && status === 200) this.cache.set(cacheKey, { bodyHash, contentType: "text/event-stream", body });
    this.logRecord({
      tenant,
      provider: provider.name,
      model: provider.model,
      stream: true,
      traceId,
      retryCount: attempts - 1,
      latencyMs,
      promptTokens: lastUsage.promptTokens,
      completionTokens: lastUsage.completionTokens,
      cost,
      status,
      timestamp: new Date().toISOString(),
    });
    return { kind: "stream", status: 200, body };
  }

  private async runNonStream(
    targets: ProviderConfig[],
    retryAttempts: number,
    request: ChatRequest,
  ): Promise<AttemptsResult<ChatResult>> {
    let attempts = 0;
    let lastError: DomainError | null = null;
    let lastProvider: ProviderConfig | null = null;
    let abort = false;
    for (const target of targets) {
      for (let i = 0; i <= retryAttempts; i++) {
        attempts++;
        lastProvider = target;
        try {
          const result = await getAdapter(target).chat(request);
          return { ok: true, result, provider: target, attempts };
        } catch (error) {
          lastError = toDomainError(error);
          if (!RETRYABLE_CODES.has(lastError.code)) {
            abort = true;
            break;
          }
        }
      }
      if (abort) break;
    }
    return { ok: false, error: lastError ?? { code: "upstream_error", status: 502 }, lastProvider, attempts };
  }

  private async runStream(
    targets: ProviderConfig[],
    retryAttempts: number,
    request: ChatRequest,
  ): Promise<AttemptsResult<{ gen: AsyncGenerator<StreamEvent>; first: StreamEvent }>> {
    let attempts = 0;
    let lastError: DomainError | null = null;
    let lastProvider: ProviderConfig | null = null;
    let abort = false;
    for (const target of targets) {
      for (let i = 0; i <= retryAttempts; i++) {
        attempts++;
        lastProvider = target;
        try {
          const gen = getAdapter(target).stream(request);
          const first = await gen.next();
          if (first.done) throw new UpstreamError("upstream_error", 502, "empty upstream stream");
          if (first.value.type === "error") {
            lastError = { code: first.value.code, status: STATUS_BY_CODE[first.value.code] };
            if (!RETRYABLE_CODES.has(lastError.code)) {
              abort = true;
              break;
            }
            continue;
          }
          return { ok: true, result: { gen, first: first.value }, provider: target, attempts };
        } catch (error) {
          lastError = toDomainError(error);
          if (!RETRYABLE_CODES.has(lastError.code)) {
            abort = true;
            break;
          }
        }
      }
      if (abort) break;
    }
    return { ok: false, error: lastError ?? { code: "upstream_error", status: 502 }, lastProvider, attempts };
  }

  /** Synchronous check-and-hold so concurrent requests can never overspend. */
  private reserve(tenant: string, amount: number): boolean {
    let state = this.budget.get(tenant);
    if (!state) {
      const budget = tenantBudget(tenant);
      if (budget === null) return true;
      state = { budget, held: 0, spent: 0 };
      this.budget.set(tenant, state);
    }
    if (state.held + state.spent + amount > state.budget + 1e-9) return false;
    state.held += amount;
    return true;
  }

  private settle(tenant: string, hold: number, cost: number): void {
    const state = this.budget.get(tenant);
    if (!state) return;
    state.held = Math.max(0, state.held - hold);
    state.spent += cost;
  }

  private logRecord(record: UsageRecord): void {
    this.records.push(record);
    const logPath = process.env.GATEWAY_LOG_PATH;
    if (logPath) {
      try {
        appendFileSync(logPath, JSON.stringify(record) + "\n", "utf-8");
      } catch {
        // Logging must never break request handling.
      }
    }
  }

  getUsage(
    tenant?: string,
    model?: string,
    status?: number,
  ): { byModel: Record<string, ModelAggregate>; byTenant: Record<string, TenantAggregate> } {
    const filtered = this.records.filter(
      (record) =>
        (tenant === undefined || record.tenant === tenant) &&
        (model === undefined || record.model === model) &&
        (status === undefined || record.status === status),
    );
    const byModel: Record<string, ModelAggregate> = {};
    const byTenant: Record<string, TenantAggregate> = {};
    const latencyTotal = new Map<string, number>();

    for (const record of filtered) {
      let modelAggregate = byModel[record.model];
      if (!modelAggregate) {
        modelAggregate = { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, avgLatencyMs: 0, maxLatencyMs: 0 };
        byModel[record.model] = modelAggregate;
      }
      modelAggregate.requests += 1;
      modelAggregate.promptTokens += record.promptTokens;
      modelAggregate.completionTokens += record.completionTokens;
      modelAggregate.totalCost += record.cost;
      modelAggregate.maxLatencyMs = Math.max(modelAggregate.maxLatencyMs, record.latencyMs);
      latencyTotal.set(record.model, (latencyTotal.get(record.model) ?? 0) + record.latencyMs);

      let tenantAggregate = byTenant[record.tenant];
      if (!tenantAggregate) {
        tenantAggregate = { requests: 0, totalCost: 0, budget: 0, remainingBudget: 0 };
        byTenant[record.tenant] = tenantAggregate;
      }
      tenantAggregate.requests += 1;
      tenantAggregate.totalCost += record.cost;
    }

    for (const [modelName, modelAggregate] of Object.entries(byModel)) {
      modelAggregate.avgLatencyMs = modelAggregate.requests > 0 ? latencyTotal.get(modelName)! / modelAggregate.requests : 0;
    }
    for (const [tenantName, tenantAggregate] of Object.entries(byTenant)) {
      const state = this.budget.get(tenantName);
      const budget = state ? state.budget : tenantBudget(tenantName) ?? 0;
      const held = state?.held ?? 0;
      tenantAggregate.budget = budget;
      tenantAggregate.remainingBudget = round6(budget - tenantAggregate.totalCost - held);
    }

    return { byModel, byTenant };
  }
}
