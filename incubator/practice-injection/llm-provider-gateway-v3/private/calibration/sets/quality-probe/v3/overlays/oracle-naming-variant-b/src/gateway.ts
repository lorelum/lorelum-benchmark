import { appendFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import type { ChatRequest, DomainErrorCode, ModelAggregate, ProviderConfig, TenantAggregate, Usage, UsageRecord } from "./types";
import {
  callProvider,
  consumeProviderStream,
  openProviderStream,
  ProviderError,
  readProviderRegistry,
  toProviderError,
  type ChatCall,
  type StreamSink,
} from "./providers";

export type Outcome =
  | { kind: "json"; status: number; payload: unknown }
  | { kind: "sse"; status: number; events: unknown[]; written: boolean; failed?: boolean };

export type ChatContext = { tenant: string; traceId: string; startedAt: number };

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}

export const DOMAIN_STATUS: Record<DomainErrorCode, number> = {
  authentication_failed: 401,
  rate_limited: 429,
  upstream_timeout: 504,
  budget_exceeded: 402,
  idempotency_conflict: 409,
  unsupported_provider: 400,
  invalid_request: 422,
  upstream_error: 502,
};

const ledger: UsageRecord[] = [];
const budgetStore = new Map<string, { budget: number; remaining: number }>();
const idempotencyStore = new Map<string, { bodyHash: string; promise: Promise<Outcome> }>();

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function parseRetryAttempts(): number {
  const raw = Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? "1");
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1;
}

function timeoutSignal(): AbortSignal {
  const raw = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS ?? 30000);
  return AbortSignal.timeout(Number.isFinite(raw) && raw > 0 ? raw : 30000);
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function computeCost(usage: Usage, provider: ProviderConfig): number {
  const raw = (usage.promptTokens / 1_000_000) * provider.priceInPerMillion
    + (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return round6(raw);
}

function getTenantBudget(tenant: string): { budget: number; remaining: number } | undefined {
  const raw = process.env[`BUDGET_${tenant.toUpperCase()}`];
  if (raw === undefined) return undefined;
  let entry = budgetStore.get(tenant);
  if (!entry) {
    const budget = Number(raw);
    if (!Number.isFinite(budget)) return undefined;
    entry = { budget, remaining: budget };
    budgetStore.set(tenant, entry);
  }
  return entry;
}

async function recordUsage(record: UsageRecord): Promise<void> {
  ledger.push(record);
  const logPath = process.env.GATEWAY_LOG_PATH;
  if (logPath) {
    try {
      await appendFile(logPath, JSON.stringify(record) + "\n", "utf8");
    } catch {
      // logging must never break the request path
    }
  }
}

function buildBaseRecord(ctx: ChatContext, provider: ProviderConfig, stream: boolean, retryCount: number, status: number, usage: Usage, cost: number): UsageRecord {
  return {
    tenant: ctx.tenant,
    provider: provider.name,
    model: provider.model,
    stream,
    traceId: ctx.traceId,
    retryCount,
    latencyMs: elapsedMs(ctx.startedAt),
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cost,
    status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute a logical chat request with per-provider retries and fallback.
 * One logical request (all transport attempts) produces exactly one ledger
 * record and one budget settlement.
 */
async function executeNonStream(
  active: ProviderConfig,
  fallback: ProviderConfig | undefined,
  call: ChatCall,
  maxRetries: number,
  ctx: ChatContext,
  budget: { budget: number; remaining: number } | undefined,
  reservation: number,
): Promise<Outcome> {
  const candidates = fallback ? [active, fallback] : [active];
  let lastError: ProviderError | undefined;
  let lastAttempt: ProviderConfig = active;
  let totalAttempts = 0;

  outer: for (const candidate of candidates) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      totalAttempts++;
      lastAttempt = candidate;
      try {
        const result = await callProvider(candidate, call, timeoutSignal());
        const usage = result.usage;
        const cost = computeCost(usage, candidate);
        if (budget) budget.remaining += reservation - cost;
        await recordUsage(buildBaseRecord(ctx, candidate, false, totalAttempts - 1, 200, usage, cost));
        return { kind: "json", status: 200, payload: { content: result.content, provider: candidate.name, model: candidate.model, usage, cost } };
      } catch (error) {
        lastError = toProviderError(error);
        if (!lastError.retryable) break outer;
        if (attempt >= maxRetries) continue outer;
      }
    }
  }

  const error = lastError ?? new ProviderError("upstream_error", 502, true);
  if (budget) budget.remaining += reservation;
  await recordUsage(buildBaseRecord(ctx, lastAttempt, false, totalAttempts - 1, DOMAIN_STATUS[error.code] ?? 502, { promptTokens: 0, completionTokens: 0 }, 0));
  throw error;
}

async function executeStreaming(
  active: ProviderConfig,
  fallback: ProviderConfig | undefined,
  call: ChatCall,
  maxRetries: number,
  res: ServerResponse,
  ctx: ChatContext,
  budget: { budget: number; remaining: number } | undefined,
  reservation: number,
): Promise<Outcome> {
  const candidates = fallback ? [active, fallback] : [active];
  let response: Response | undefined;
  let winner: ProviderConfig | undefined;
  let lastError: ProviderError | undefined;
  let totalAttempts = 0;
  const signal = timeoutSignal();

  outer: for (const candidate of candidates) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      totalAttempts++;
      try {
        response = await openProviderStream(candidate, call, signal);
        winner = candidate;
        break outer;
      } catch (error) {
        lastError = toProviderError(error);
        if (!lastError.retryable) break outer;
        if (attempt >= maxRetries) continue outer;
      }
    }
  }

  if (!response || !winner) {
    // Failed before any byte reached the client: reserve released, JSON error downstream.
    const error = lastError ?? new ProviderError("upstream_error", 502, true);
    if (budget) budget.remaining += reservation;
    await recordUsage(buildBaseRecord(ctx, active, true, totalAttempts - 1, DOMAIN_STATUS[error.code] ?? 502, { promptTokens: 0, completionTokens: 0 }, 0));
    throw error;
  }

  // Response headers are committed now; any later failure is surfaced as a
  // terminating SSE error event, never as a fabricated success usage.
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const events: unknown[] = [];
  let usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const sink: StreamSink = {
    onDelta: (text) => {
      const event = { choices: [{ delta: { content: text } }] };
      events.push(event);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
  };

  try {
    const result = await consumeProviderStream(winner, response, sink);
    usage = result.usage;
    const cost = computeCost(usage, winner);
    const finalEvent = { usage, cost, provider: winner.name, model: winner.model };
    events.push(finalEvent);
    res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
    if (budget) budget.remaining += reservation - cost;
    await recordUsage(buildBaseRecord(ctx, winner, true, totalAttempts - 1, 200, usage, cost));
    res.end();
    return { kind: "sse", status: 200, events, written: true };
  } catch (error) {
    const streamError = toProviderError(error);
    const partial = streamError.partialUsage ?? usage;
    const cost = computeCost(partial, winner);
    const errorEvent = { error: { code: streamError.code } };
    events.push(errorEvent);
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    if (budget) budget.remaining += reservation - cost;
    await recordUsage(buildBaseRecord(ctx, winner, true, totalAttempts - 1, DOMAIN_STATUS[streamError.code] ?? 502, partial, cost));
    res.end();
    return { kind: "sse", status: 200, events, written: true, failed: true };
  }
}

export async function executeLogicalRequest(body: ChatRequest, ctx: ChatContext, res: ServerResponse): Promise<Outcome> {
  const registry = readProviderRegistry();
  const activeName = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
  const active = registry.get(activeName);
  if (!active) throw new DomainError("unsupported_provider", `provider "${activeName}" is not configured`);

  const maxOutPrice = [...registry.values()].reduce((max, provider) => Math.max(max, provider.priceOutPerMillion), 0);
  const maxTokens = body.max_tokens;
  const reservation = maxTokens ? round6((maxTokens * maxOutPrice) / 1_000_000) : 0;
  const budget = getTenantBudget(ctx.tenant);
  if (budget && reservation > budget.remaining + 1e-9) {
    throw new DomainError("budget_exceeded", `insufficient budget for tenant "${ctx.tenant}"`);
  }
  if (budget) budget.remaining -= reservation;

  const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER;
  const fallback = fallbackName ? registry.get(fallbackName) : undefined;
  const maxRetries = parseRetryAttempts();
  const call: ChatCall = { messages: body.messages, max_tokens: maxTokens };

  if (body.stream) return executeStreaming(active, fallback, call, maxRetries, res, ctx, budget, reservation);
  return executeNonStream(active, fallback, call, maxRetries, ctx, budget, reservation);
}

/**
 * Idempotency: same tenant + key + body replays the first outcome without
 * calling the provider again or billing again; same key + different body is a
 * conflict. Failed executions are never cached.
 */
export async function runWithIdempotency(body: ChatRequest, ctx: ChatContext, res: ServerResponse, idemKey: string | undefined): Promise<Outcome> {
  if (idemKey === undefined) return executeLogicalRequest(body, ctx, res);
  const mapKey = `${ctx.tenant}:${idemKey}`;
  const bodyHash = JSON.stringify(body);
  const existing = idempotencyStore.get(mapKey);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      throw new DomainError("idempotency_conflict", `idempotency key "${idemKey}" was used with a different request body`);
    }
    return existing.promise;
  }
  let resolveOutcome!: (outcome: Outcome) => void;
  let rejectOutcome!: (error: unknown) => void;
  const promise = new Promise<Outcome>((resolve, reject) => {
    resolveOutcome = resolve;
    rejectOutcome = reject;
  });
  idempotencyStore.set(mapKey, { bodyHash, promise });
  try {
    const outcome = await executeLogicalRequest(body, ctx, res);
    resolveOutcome(outcome);
    if (outcome.kind === "sse" && outcome.failed) idempotencyStore.delete(mapKey);
    return outcome;
  } catch (error) {
    idempotencyStore.delete(mapKey);
    rejectOutcome(error);
    throw error;
  }
}

export function writeOutcome(res: ServerResponse, outcome: Outcome, replay: boolean): void {
  if (outcome.kind === "json") {
    res.writeHead(outcome.status, { "content-type": "application/json" });
    res.end(JSON.stringify(outcome.payload));
    return;
  }
  if (!replay && outcome.written) return;
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of outcome.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
  res.end();
}

export function buildUsageReport(
  tenant?: string,
  model?: string,
  status?: string,
): { byModel: Record<string, ModelAggregate>; byTenant: Record<string, TenantAggregate> } {
  const records = ledger.filter(
    (record) =>
      (tenant === undefined || record.tenant === tenant)
      && (model === undefined || record.model === model)
      && (status === undefined || String(record.status) === status),
  );

  const byModel: Record<string, ModelAggregate> = {};
  const byTenant: Record<string, TenantAggregate> = {};
  const latency = new Map<string, { sum: number; count: number }>();

  for (const record of records) {
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
    let l = latency.get(record.model);
    if (!l) {
      l = { sum: 0, count: 0 };
      latency.set(record.model, l);
    }
    l.sum += record.latencyMs;
    l.count += 1;

    let tenantAggregate = byTenant[record.tenant];
    if (!tenantAggregate) {
      tenantAggregate = { requests: 0, totalCost: 0, budget: 0, remainingBudget: 0 };
      byTenant[record.tenant] = tenantAggregate;
    }
    tenantAggregate.requests += 1;
    tenantAggregate.totalCost += record.cost;
  }

  for (const [model, l] of latency) byModel[model].avgLatencyMs = Math.round((l.sum / l.count) * 10) / 10;

  const tenantNames = new Set(Object.keys(byTenant));
  if (tenant === undefined) for (const name of budgetStore.keys()) tenantNames.add(name);
  for (const name of tenantNames) {
    const aggregate = byTenant[name] ?? { requests: 0, totalCost: 0, budget: 0, remainingBudget: 0 };
    const entry = getTenantBudget(name);
    byTenant[name] = {
      requests: aggregate.requests,
      totalCost: round6(aggregate.totalCost),
      budget: entry?.budget ?? 0,
      remainingBudget: entry?.remaining ?? 0,
    };
  }

  return { byModel, byTenant };
}
