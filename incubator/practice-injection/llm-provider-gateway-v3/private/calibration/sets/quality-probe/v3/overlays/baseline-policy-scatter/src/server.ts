import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ChatRequest, ModelAggregate, TenantAggregate, Usage, UsageRecord } from "./types";
import { DomainError, toDomainError } from "./errors";
import { computeCost, getTenantBudget, loadProviderConfig, reservationAmount, roundCost } from "./config";
import { addRecord, getBudgetInfo, queryRecords, reserveBudget, settleBudget } from "./store";
import { executeWithRetry } from "./executor";

/** Normalized, provider-agnostic response used for live replies and idempotency replay. */
type NormalizedResponse = {
  provider: string;
  model: string;
  usage: Usage;
  cost: number;
  content: string;
  deltas: string[];
};

type ChatOutcome = { ok: true; cached: NormalizedResponse } | { ok: false; error: DomainError };

type CacheEntry = {
  bodyHash: string;
  result?: NormalizedResponse;
  promise?: Promise<ChatOutcome>;
};

const idempotencyCache = new Map<string, CacheEntry>();

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function isValidRequest(request: unknown): request is ChatRequest {
  if (typeof request !== "object" || request === null) return false;
  const candidate = request as Record<string, unknown>;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) return false;
  for (const message of candidate.messages) {
    if (typeof message !== "object" || message === null) return false;
    const m = message as Record<string, unknown>;
    if (m.role !== "system" && m.role !== "user" && m.role !== "assistant") return false;
    if (typeof m.content !== "string") return false;
  }
  if (
    candidate.max_tokens !== undefined &&
    (typeof candidate.max_tokens !== "number" || !Number.isFinite(candidate.max_tokens) || candidate.max_tokens <= 0)
  ) {
    return false;
  }
  if (candidate.stream !== undefined && typeof candidate.stream !== "boolean") return false;
  return true;
}

function reserveForRequest(tenant: string, request: ChatRequest): number {
  const budget = getTenantBudget(tenant);
  if (budget === undefined) return 0;
  if (request.max_tokens === undefined) {
    throw new DomainError("invalid_request", 422, "max_tokens is required when a tenant budget is configured");
  }
  const amount = reservationAmount(request.max_tokens);
  if (!reserveBudget(tenant, amount)) throw new DomainError("budget_exceeded", 402);
  return amount;
}

function makeRecord(params: {
  tenant: string;
  provider: string;
  model: string;
  stream: boolean;
  traceId: string;
  retryCount: number;
  startedAt: number;
  usage: Usage;
  cost: number;
  status: number;
}): UsageRecord {
  return {
    tenant: params.tenant,
    provider: params.provider,
    model: params.model,
    stream: params.stream,
    traceId: params.traceId,
    retryCount: params.retryCount,
    latencyMs: Date.now() - params.startedAt,
    promptTokens: params.usage.promptTokens,
    completionTokens: params.usage.completionTokens,
    cost: params.cost,
    status: params.status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute one logical request end to end: reserve budget, call providers with
 * retry/fallback, settle budget with the actual cost, write the single usage
 * record and stream/JSON the response to the client.
 */
async function executeChat(
  request: ChatRequest,
  tenant: string,
  wantStream: boolean,
  res: ServerResponse,
  startedAt: number,
): Promise<ChatOutcome> {
  const traceId = randomUUID();
  let reservedAmount = 0;
  try {
    reservedAmount = reserveForRequest(tenant, request);

    if (!wantStream) {
      const execution = await executeWithRetry(request, false);
      const { provider, content, usage } = execution.result;
      const cost = computeCost(usage.promptTokens, usage.completionTokens, provider);
      const payload = { content, provider: provider.name, model: provider.model, usage, cost };
      const record = makeRecord({
        tenant,
        provider: provider.name,
        model: provider.model,
        stream: false,
        traceId,
        retryCount: execution.retryCount,
        startedAt,
        usage,
        cost,
        status: 200,
      });
      settleBudget(tenant, reservedAmount, cost);
      await addRecord(record);
      sendJson(res, 200, payload);
      return { ok: true, cached: { provider: provider.name, model: provider.model, usage, cost, content, deltas: [content] } };
    }

    const execution = await executeWithRetry(request, true);
    const { provider, events } = execution.result;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const deltas: string[] = [];
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    let status = 200;
    let streamError: DomainError | undefined;
    try {
      for await (const event of events) {
        if (event.type === "delta") {
          deltas.push(event.text);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.text } }] })}\n\n`);
        } else {
          usage = event.usage;
        }
      }
    } catch (error) {
      // Headers are already out: terminate the stream with an SSE error event
      // and only bill what the upstream actually reported.
      streamError = toDomainError(error);
      usage = streamError.partialUsage ?? usage;
      status = streamError.status;
      res.write(`data: ${JSON.stringify({ error: { code: streamError.code } })}\n\n`);
    }
    const cost = computeCost(usage.promptTokens, usage.completionTokens, provider);
    if (!streamError) {
      res.write(`data: ${JSON.stringify({ usage, cost, provider: provider.name, model: provider.model })}\n\n`);
    }
    const record = makeRecord({
      tenant,
      provider: provider.name,
      model: provider.model,
      stream: true,
      traceId,
      retryCount: execution.retryCount,
      startedAt,
      usage,
      cost,
      status,
    });
    settleBudget(tenant, reservedAmount, cost);
    await addRecord(record);
    res.end();
    if (streamError) return { ok: false, error: streamError };
    return {
      ok: true,
      cached: { provider: provider.name, model: provider.model, usage, cost, content: deltas.join(""), deltas },
    };
  } catch (error) {
    const domainError = toDomainError(error);
    if (domainError.code === "budget_exceeded") {
      const activeName = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
      const active = loadProviderConfig(activeName);
      const zeroUsage: Usage = { promptTokens: 0, completionTokens: 0 };
      const record = makeRecord({
        tenant,
        provider: activeName,
        model: active?.model ?? "",
        stream: wantStream,
        traceId,
        retryCount: 0,
        startedAt,
        usage: zeroUsage,
        cost: 0,
        status: 402,
      });
      await addRecord(record);
    }
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ error: { code: domainError.code } })}\n\n`);
      } catch {
        // client already gone
      }
      res.end();
    } else {
      sendJson(res, domainError.status, { error: domainError.code });
    }
    return { ok: false, error: domainError };
  }
}

function renderCached(cached: NormalizedResponse, wantStream: boolean, res: ServerResponse): void {
  if (!wantStream) {
    sendJson(res, 200, {
      content: cached.content,
      provider: cached.provider,
      model: cached.model,
      usage: cached.usage,
      cost: cached.cost,
    });
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const delta of cached.deltas) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ usage: cached.usage, cost: cached.cost, provider: cached.provider, model: cached.model })}\n\n`);
  res.end();
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startedAt = Date.now();
  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  if (!isValidRequest(parsed)) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  const request = parsed;

  const tenantHeader = req.headers["x-tenant-id"];
  const tenant = typeof tenantHeader === "string" && tenantHeader.length > 0 ? tenantHeader : "default";
  const keyHeader = req.headers["idempotency-key"];
  const idempotencyKey = typeof keyHeader === "string" && keyHeader.length > 0 ? keyHeader : undefined;
  const wantStream = request.stream === true && req.headers.accept === "text/event-stream";
  const bodyHash = JSON.stringify(request);

  if (idempotencyKey === undefined) {
    await executeChat(request, tenant, wantStream, res, startedAt);
    return;
  }

  const cacheKey = `${tenant}:${idempotencyKey}`;
  const existing = idempotencyCache.get(cacheKey);
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      sendJson(res, 409, { error: "idempotency_conflict" });
      return;
    }
    if (existing.result) {
      renderCached(existing.result, wantStream, res);
      return;
    }
    if (existing.promise) {
      // A duplicate with the same body is in flight: wait for its outcome.
      const outcome = await existing.promise;
      if (outcome.ok) {
        renderCached(outcome.cached, wantStream, res);
        return;
      }
      sendJson(res, outcome.error.status, { error: outcome.error.code });
      return;
    }
  }

  const entry: CacheEntry = { bodyHash };
  idempotencyCache.set(cacheKey, entry);
  const promise = executeChat(request, tenant, wantStream, res, startedAt).then((outcome) => {
    if (outcome.ok) entry.result = outcome.cached;
    return outcome;
  });
  entry.promise = promise;
  const outcome = await promise;
  if (!outcome.ok && idempotencyCache.get(cacheKey) === entry && !entry.result) {
    idempotencyCache.delete(cacheKey);
  }
}

function handleUsage(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/api/usage", "http://localhost");
  const tenant = url.searchParams.get("tenant") ?? undefined;
  const model = url.searchParams.get("model") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const filtered = queryRecords({ tenant, model, status });

  const modelAgg: Record<string, ModelAggregate & { latencySum: number }> = {};
  for (const record of filtered) {
    const aggregate = modelAgg[record.model] ?? {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      latencySum: 0,
      maxLatencyMs: 0,
    };
    aggregate.requests += 1;
    aggregate.promptTokens += record.promptTokens;
    aggregate.completionTokens += record.completionTokens;
    aggregate.totalCost += record.cost;
    aggregate.latencySum += record.latencyMs;
    aggregate.maxLatencyMs = Math.max(aggregate.maxLatencyMs, record.latencyMs);
    modelAgg[record.model] = aggregate;
  }
  const byModel: Record<string, ModelAggregate> = {};
  for (const [modelName, aggregate] of Object.entries(modelAgg)) {
    byModel[modelName] = {
      requests: aggregate.requests,
      promptTokens: aggregate.promptTokens,
      completionTokens: aggregate.completionTokens,
      totalCost: aggregate.totalCost,
      avgLatencyMs: aggregate.requests > 0 ? Math.round(aggregate.latencySum / aggregate.requests) : 0,
      maxLatencyMs: aggregate.maxLatencyMs,
    };
  }

  const tenantAgg: Record<string, TenantAggregate> = {};
  for (const record of filtered) {
    const aggregate = tenantAgg[record.tenant] ?? { requests: 0, totalCost: 0, budget: 0, remainingBudget: 0 };
    aggregate.requests += 1;
    aggregate.totalCost += record.cost;
    tenantAgg[record.tenant] = aggregate;
  }
  const byTenant: Record<string, TenantAggregate> = {};
  for (const [tenantName, aggregate] of Object.entries(tenantAgg)) {
    const { budget } = getBudgetInfo(tenantName);
    byTenant[tenantName] = {
      requests: aggregate.requests,
      totalCost: aggregate.totalCost,
      budget,
      remainingBudget: roundCost(budget - aggregate.totalCost),
    };
  }

  sendJson(res, 200, { byModel, byTenant });
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "POST" && path === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "GET" && path === "/api/usage") {
      handleUsage(req, res);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
