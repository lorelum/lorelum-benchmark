import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChatRequest, ChatRole, ModelAggregate, ProviderConfig, StreamEvent, TenantAggregate, Usage, UsageRecord } from "./types";
import { DomainError, createProvider, loadRegistry, toDomainError, type ChatProvider, type ProviderRequest } from "./providers";

const MILLION = 1_000_000;
const ROLES = new Set<ChatRole>(["system", "user", "assistant"]);
const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache" };

/** Round to 6 decimal places (四舍五入). */
export function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * MILLION) / MILLION;
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function stableHash(request: ChatRequest): string {
  return JSON.stringify({
    messages: request.messages,
    max_tokens: request.max_tokens ?? null,
    stream: request.stream === true,
  });
}

function isValidRequest(request: ChatRequest): boolean {
  if (!request || typeof request !== "object") return false;
  if (!Array.isArray(request.messages) || request.messages.length === 0) return false;
  for (const message of request.messages) {
    if (!message || typeof message !== "object") return false;
    if (!ROLES.has(message.role as ChatRole)) return false;
    if (typeof message.content !== "string") return false;
  }
  if (request.max_tokens !== undefined) {
    if (typeof request.max_tokens !== "number" || !Number.isFinite(request.max_tokens) || request.max_tokens <= 0) return false;
  }
  if (request.stream !== undefined && typeof request.stream !== "boolean") return false;
  return true;
}

function costFor(usage: Usage, provider: ChatProvider): number {
  return round6(
    (usage.promptTokens / MILLION) * provider.config.priceInPerMillion +
      (usage.completionTokens / MILLION) * provider.config.priceOutPerMillion,
  );
}

function elapsedMs(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

type IdempotencyEntry = { hash: string; stream: boolean; payload: unknown };

type StreamOpen = {
  iterator: AsyncIterator<StreamEvent>;
  first: IteratorResult<StreamEvent>;
  provider: ChatProvider;
  retryCount: number;
};

type Execution = { content: string; usage: Usage; provider: ChatProvider; retryCount: number };

type StreamContext = {
  tenant: string;
  traceId: string;
  idemKey: string | undefined;
  bodyHash: string;
  active: ChatProvider;
  fallback: ChatProvider | undefined;
  attempts: number;
  providerRequest: ProviderRequest;
  reserve: number;
  start: number;
};

export class Gateway {
  private records: UsageRecord[] = [];
  private idempotency = new Map<string, IdempotencyEntry>();
  private budgets = new Map<string, { reserved: number; spent: number }>();

  private budgetOf(tenant: string): number | undefined {
    const raw = process.env[`BUDGET_${tenant.toUpperCase()}`];
    if (raw === undefined || raw === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  private idemKey(tenant: string, key: string): string {
    return `${tenant}::${key}`;
  }

  /**
   * Check-and-reserve is fully synchronous: two concurrent requests cannot
   * both pass the check before either one reserves, so budgets never overrun.
   */
  private tryReserve(tenant: string, amount: number): boolean {
    const budget = this.budgetOf(tenant);
    if (budget === undefined) return true;
    const entry = this.budgets.get(tenant) ?? { reserved: 0, spent: 0 };
    const available = budget - entry.reserved - entry.spent;
    if (available + 1e-9 < amount) return false;
    entry.reserved += amount;
    this.budgets.set(tenant, entry);
    return true;
  }

  private settle(tenant: string, reserve: number, cost: number): void {
    const budget = this.budgetOf(tenant);
    if (budget === undefined) return;
    const entry = this.budgets.get(tenant);
    if (!entry) return;
    entry.reserved = Math.max(0, entry.reserved - reserve);
    entry.spent += cost;
  }

  private release(tenant: string, reserve: number): void {
    this.settle(tenant, reserve, 0);
  }

  private highestOutputPrice(registry: Map<string, ProviderConfig>): number {
    let max = 0;
    for (const config of registry.values()) max = Math.max(max, config.priceOutPerMillion);
    return max;
  }

  private makeRecord(params: {
    tenant: string;
    provider: ChatProvider;
    traceId: string;
    retryCount: number;
    stream: boolean;
    latencyMs: number;
    usage: Usage;
    cost: number;
    status: number;
  }): UsageRecord {
    return {
      tenant: params.tenant,
      provider: params.provider.config.name,
      model: params.provider.config.model,
      stream: params.stream,
      traceId: params.traceId,
      retryCount: params.retryCount,
      latencyMs: params.latencyMs,
      promptTokens: params.usage.promptTokens,
      completionTokens: params.usage.completionTokens,
      cost: params.cost,
      status: params.status,
      timestamp: new Date().toISOString(),
    };
  }

  private async logRecord(record: UsageRecord): Promise<void> {
    this.records.push(record);
    const logPath = process.env.GATEWAY_LOG_PATH;
    if (!logPath) return;
    try {
      await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf-8");
    } catch {
      // structured logging must never break the request path
    }
  }

  /** Non-streaming execution: retry on the primary, then fall back once. */
  private async executeNonStream(
    active: ChatProvider,
    fallback: ChatProvider | undefined,
    attempts: number,
    request: ProviderRequest,
  ): Promise<Execution> {
    let retryCount = 0;
    let lastError: DomainError = new DomainError("upstream_error", 502);
    for (let i = 0; i < attempts; i += 1) {
      try {
        const result = await active.chat(request);
        if (result.stream) throw new DomainError("upstream_error", 502);
        return { content: result.content, usage: result.usage, provider: active, retryCount };
      } catch (error) {
        const domain = toDomainError(error);
        lastError = domain;
        retryCount = i + 1;
        if (domain.retryable && i + 1 < attempts) continue;
        if (fallback && domain.retryable) {
          try {
            const result = await fallback.chat(request);
            if (result.stream) throw new DomainError("upstream_error", 502);
            return { content: result.content, usage: result.usage, provider: fallback, retryCount };
          } catch (fallbackError) {
            throw toDomainError(fallbackError);
          }
        }
        throw domain;
      }
    }
    throw lastError;
  }

  /**
   * Streaming execution up to the first chunk. Retry/fallback only apply
   * before any SSE byte is written; once headers are out, failures are
   * reported as a terminating SSE error event.
   */
  private async openStream(
    active: ChatProvider,
    fallback: ChatProvider | undefined,
    attempts: number,
    request: ProviderRequest,
  ): Promise<StreamOpen> {
    let retryCount = 0;
    for (let i = 0; i < attempts; i += 1) {
      try {
        const result = await active.chat(request);
        if (!result.stream) throw new DomainError("upstream_error", 502);
        const iterator = result.events[Symbol.asyncIterator]();
        const first = await iterator.next();
        return { iterator, first, provider: active, retryCount };
      } catch (error) {
        const domain = toDomainError(error);
        retryCount = i + 1;
        if (domain.retryable && i + 1 < attempts) continue;
        if (fallback && domain.retryable) {
          try {
            const result = await fallback.chat(request);
            if (!result.stream) throw new DomainError("upstream_error", 502);
            const iterator = result.events[Symbol.asyncIterator]();
            const first = await iterator.next();
            return { iterator, first, provider: fallback, retryCount };
          } catch (fallbackError) {
            throw toDomainError(fallbackError);
          }
        }
        throw domain;
      }
    }
    throw new DomainError("upstream_error", 502);
  }

  private async handleStream(res: ServerResponse, ctx: StreamContext): Promise<void> {
    let opened: StreamOpen;
    try {
      opened = await this.openStream(ctx.active, ctx.fallback, ctx.attempts, ctx.providerRequest);
    } catch (error) {
      // Failed before the first chunk: no SSE bytes were sent, return JSON.
      const domain = toDomainError(error);
      this.release(ctx.tenant, ctx.reserve);
      const usage = domain.usage ?? { promptTokens: 0, completionTokens: 0 };
      const record = this.makeRecord({
        tenant: ctx.tenant,
        provider: ctx.active,
        traceId: ctx.traceId,
        retryCount: 0,
        stream: true,
        latencyMs: elapsedMs(ctx.start),
        usage,
        cost: 0,
        status: domain.status,
      });
      await this.logRecord(record);
      sendJson(res, domain.status, { error: domain.code });
      return;
    }

    res.writeHead(200, SSE_HEADERS);
    const replayedEvents: unknown[] = [];
    let usage: Usage | undefined;

    try {
      if (!opened.first.done) {
        if (opened.first.value.type === "delta") {
          const event = { choices: [{ delta: { content: opened.first.value.text } }] };
          replayedEvents.push(event);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } else if (opened.first.value.type === "done") {
          usage = opened.first.value.usage;
        }
      }
      for (;;) {
        const next = await opened.iterator.next();
        if (next.done) break;
        const event = next.value;
        if (event.type === "delta") {
          const out = { choices: [{ delta: { content: event.text } }] };
          replayedEvents.push(out);
          res.write(`data: ${JSON.stringify(out)}\n\n`);
        } else if (event.type === "done") {
          usage = event.usage;
        }
      }
    } catch (error) {
      // Headers already sent: terminate with an SSE error event. Bill only the
      // usage the upstream actually reported, never fabricate a final usage.
      const domain = toDomainError(error);
      const partial = domain.usage ?? usage ?? { promptTokens: 0, completionTokens: 0 };
      const cost = costFor(partial, opened.provider);
      this.settle(ctx.tenant, ctx.reserve, cost);
      const record = this.makeRecord({
        tenant: ctx.tenant,
        provider: opened.provider,
        traceId: ctx.traceId,
        retryCount: opened.retryCount,
        stream: true,
        latencyMs: elapsedMs(ctx.start),
        usage: partial,
        cost,
        status: domain.status,
      });
      await this.logRecord(record);
      res.write(`data: ${JSON.stringify({ error: { code: domain.code } })}\n\n`);
      res.end();
      return;
    }

    const finalUsage = usage ?? { promptTokens: 0, completionTokens: 0 };
    const cost = costFor(finalUsage, opened.provider);
    this.settle(ctx.tenant, ctx.reserve, cost);
    const record = this.makeRecord({
      tenant: ctx.tenant,
      provider: opened.provider,
      traceId: ctx.traceId,
      retryCount: opened.retryCount,
      stream: true,
      latencyMs: elapsedMs(ctx.start),
      usage: finalUsage,
      cost,
      status: 200,
    });
    await this.logRecord(record);
    const finalEvent = { usage: finalUsage, cost, provider: opened.provider.config.name, model: opened.provider.config.model };
    replayedEvents.push(finalEvent);
    res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
    res.end();
    if (ctx.idemKey) {
      this.idempotency.set(this.idemKey(ctx.tenant, ctx.idemKey), { hash: ctx.bodyHash, stream: true, payload: replayedEvents });
    }
  }

  async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 422, { error: "invalid_request" });
      return;
    }
    const request = parsed as ChatRequest;
    if (!isValidRequest(request)) {
      sendJson(res, 422, { error: "invalid_request" });
      return;
    }

    const tenant = headerValue(req, "x-tenant-id") ?? "default";
    const traceId = randomUUID();
    const idemKey = headerValue(req, "idempotency-key");
    const bodyHash = stableHash(request);

    // Idempotency: same tenant + key + body replays the first result; a
    // different body for the same key conflicts without touching the provider.
    if (idemKey) {
      const cached = this.idempotency.get(this.idemKey(tenant, idemKey));
      if (cached) {
        if (cached.hash !== bodyHash) {
          sendJson(res, 409, { error: "idempotency_conflict" });
          return;
        }
        if (cached.stream) {
          res.writeHead(200, SSE_HEADERS);
          for (const event of cached.payload as unknown[]) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          res.end();
        } else {
          sendJson(res, 200, cached.payload);
        }
        return;
      }
    }

    const registry = loadRegistry();
    const activeName = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
    let active: ChatProvider;
    let fallback: ChatProvider | undefined;
    try {
      active = createProvider(registry.get(activeName));
      const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER;
      if (fallbackName) fallback = createProvider(registry.get(fallbackName));
    } catch (error) {
      const domain = toDomainError(error);
      sendJson(res, domain.status, { error: domain.code });
      return;
    }

    const rawAttempts = Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? "1");
    const attempts = Number.isFinite(rawAttempts) ? Math.max(1, rawAttempts + 1) : 1;

    // Tenant budget: reserve max_tokens x highest output price up front,
    // settle against actual cost afterwards.
    const budget = this.budgetOf(tenant);
    let reserve = 0;
    if (budget !== undefined) {
      if (typeof request.max_tokens !== "number" || !Number.isFinite(request.max_tokens) || request.max_tokens <= 0) {
        sendJson(res, 422, { error: "invalid_request" });
        return;
      }
      reserve = round6((request.max_tokens * this.highestOutputPrice(registry)) / MILLION);
      if (!this.tryReserve(tenant, reserve)) {
        sendJson(res, 402, { error: "budget_exceeded" });
        return;
      }
    }

    const providerRequest: ProviderRequest = {
      messages: request.messages,
      maxTokens: request.max_tokens ?? 256,
      stream: request.stream === true,
    };
    const start = performance.now();

    if (providerRequest.stream) {
      await this.handleStream(res, { tenant, traceId, idemKey, bodyHash, active, fallback, attempts, providerRequest, reserve, start });
      return;
    }

    try {
      const execution = await this.executeNonStream(active, fallback, attempts, providerRequest);
      const cost = costFor(execution.usage, execution.provider);
      this.settle(tenant, reserve, cost);
      const record = this.makeRecord({
        tenant,
        provider: execution.provider,
        traceId,
        retryCount: execution.retryCount,
        stream: false,
        latencyMs: elapsedMs(start),
        usage: execution.usage,
        cost,
        status: 200,
      });
      await this.logRecord(record);
      const payload = {
        content: execution.content,
        provider: execution.provider.config.name,
        model: execution.provider.config.model,
        usage: execution.usage,
        cost,
      };
      if (idemKey) {
        this.idempotency.set(this.idemKey(tenant, idemKey), { hash: bodyHash, stream: false, payload });
      }
      sendJson(res, 200, payload);
    } catch (error) {
      const domain = toDomainError(error);
      this.release(tenant, reserve);
      const usage = domain.usage ?? { promptTokens: 0, completionTokens: 0 };
      const record = this.makeRecord({
        tenant,
        provider: active,
        traceId,
        retryCount: 0,
        stream: false,
        latencyMs: elapsedMs(start),
        usage,
        cost: 0,
        status: domain.status,
      });
      await this.logRecord(record);
      sendJson(res, domain.status, { error: domain.code });
    }
  }

  handleUsage(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const tenant = url.searchParams.get("tenant") ?? undefined;
    const model = url.searchParams.get("model") ?? undefined;
    const status = url.searchParams.get("status") ?? "200";

    const filtered = this.records.filter((record) => {
      if (tenant !== undefined && record.tenant !== tenant) return false;
      if (model !== undefined && record.model !== model) return false;
      if (String(record.status) !== status) return false;
      return true;
    });

    const modelBuckets = new Map<string, {
      requests: number;
      promptTokens: number;
      completionTokens: number;
      totalCost: number;
      latencySum: number;
      maxLatencyMs: number;
    }>();
    const tenantBuckets = new Map<string, { requests: number; totalCost: number }>();

    for (const record of filtered) {
      const bucket = modelBuckets.get(record.model) ?? {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        latencySum: 0,
        maxLatencyMs: 0,
      };
      bucket.requests += 1;
      bucket.promptTokens += record.promptTokens;
      bucket.completionTokens += record.completionTokens;
      bucket.totalCost = round6(bucket.totalCost + record.cost);
      bucket.latencySum += record.latencyMs;
      bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs, record.latencyMs);
      modelBuckets.set(record.model, bucket);

      const tenantBucket = tenantBuckets.get(record.tenant) ?? { requests: 0, totalCost: 0 };
      tenantBucket.requests += 1;
      tenantBucket.totalCost = round6(tenantBucket.totalCost + record.cost);
      tenantBuckets.set(record.tenant, tenantBucket);
    }

    const byModel: Record<string, ModelAggregate> = {};
    for (const [name, bucket] of modelBuckets) {
      byModel[name] = {
        requests: bucket.requests,
        promptTokens: bucket.promptTokens,
        completionTokens: bucket.completionTokens,
        totalCost: bucket.totalCost,
        avgLatencyMs: bucket.requests > 0 ? Math.round(bucket.latencySum / bucket.requests) : 0,
        maxLatencyMs: bucket.maxLatencyMs,
      };
    }

    const byTenant: Record<string, TenantAggregate> = {};
    for (const [name, bucket] of tenantBuckets) {
      const budget = this.budgetOf(name) ?? 0;
      byTenant[name] = {
        requests: bucket.requests,
        totalCost: bucket.totalCost,
        budget,
        remainingBudget: round6(budget - bucket.totalCost),
      };
    }

    sendJson(res, 200, { byModel, byTenant });
  }
}
