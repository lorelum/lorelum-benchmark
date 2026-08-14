import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  callNonStream,
  callStream,
  classifyFailure,
  loadRegistry,
  MidStreamError,
  type ProviderFailure,
  type StreamOutcome,
} from "./providers";
import {
  addRecord,
  idempotencyLookup,
  idempotencyStoreResult,
  reserveBudget,
  settleBudget,
  writeLogRecord,
} from "./store";
import type { ChatMessage, ChatRequest, ProviderConfig, Usage, UsageRecord } from "./types";

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

const VALID_ROLES = new Set(["system", "user", "assistant"]);

function validateChatRequest(body: unknown): { ok: true; value: ChatRequest } | { ok: false } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false };
  const candidate = body as Record<string, unknown>;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) return { ok: false };
  for (const message of candidate.messages) {
    if (typeof message !== "object" || message === null) return { ok: false };
    const msg = message as Record<string, unknown>;
    if (typeof msg.role !== "string" || !VALID_ROLES.has(msg.role)) return { ok: false };
    if (typeof msg.content !== "string") return { ok: false };
  }
  if (candidate.max_tokens !== undefined && (typeof candidate.max_tokens !== "number" || !Number.isFinite(candidate.max_tokens) || candidate.max_tokens <= 0)) {
    return { ok: false };
  }
  if (candidate.stream !== undefined && typeof candidate.stream !== "boolean") return { ok: false };
  return {
    ok: true,
    value: {
      messages: candidate.messages as ChatMessage[],
      max_tokens: candidate.max_tokens as number | undefined,
      stream: candidate.stream as boolean | undefined,
    },
  };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`).join(",")}}`;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function computeCost(provider: ProviderConfig, usage: Usage): number {
  const raw = (usage.promptTokens / 1_000_000) * provider.priceInPerMillion + (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return round6(raw);
}

function makeRecord(input: {
  tenant: string;
  provider: string;
  model: string;
  stream: boolean;
  traceId: string;
  retryCount: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  status: number;
}): UsageRecord {
  return {
    tenant: input.tenant,
    provider: input.provider,
    model: input.model,
    stream: input.stream,
    traceId: input.traceId,
    retryCount: input.retryCount,
    latencyMs: Math.round(input.latencyMs),
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    cost: input.cost,
    status: input.status,
    timestamp: new Date().toISOString(),
  };
}

/** Write SSE response headers once the upstream accepted the streaming request. */
function startSse(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
}

function writeSse(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }

  const validation = validateChatRequest(body);
  if (!validation.ok) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  const chatRequest = validation.value;

  const tenant = String(req.headers["x-tenant-id"] ?? "default");
  const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;
  const clientStreams = chatRequest.stream === true && String(req.headers.accept ?? "").includes("text/event-stream");
  const bodyHash = canonicalStringify(body);

  // Idempotency: same key + same body replays the first result; same key +
  // different body is a conflict. Neither replays nor conflicts touch budget.
  if (idempotencyKey !== undefined) {
    const cached = idempotencyLookup(tenant, idempotencyKey);
    if (cached !== undefined) {
      if (cached.hash !== bodyHash) {
        sendJson(res, 409, { error: "idempotency_conflict" });
        return;
      }
      sendJson(res, cached.status, cached.payload);
      return;
    }
  }

  const registry = loadRegistry();
  const activeName = (process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai").toLowerCase();
  const active = registry.get(activeName);
  if (!active) {
    sendJson(res, 400, { error: "unsupported_provider" });
    return;
  }
  const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER?.toLowerCase();
  const fallback = fallbackName !== undefined ? registry.get(fallbackName) : undefined;

  const retryAttemptsRaw = Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? "1");
  const retryAttempts = Number.isFinite(retryAttemptsRaw) && retryAttemptsRaw >= 0 ? Math.floor(retryAttemptsRaw) : 1;

  const maxTokens = chatRequest.max_tokens ?? 256;
  const maxOutputPrice = [...registry.values()].reduce((max, provider) => Math.max(max, provider.priceOutPerMillion), 0);
  // Hold the tenant's budget before any upstream transmission. Synchronous, so
  // concurrent requests cannot both pass the check.
  const reservation = reserveBudget(tenant, (maxTokens * maxOutputPrice) / 1_000_000);
  if (!reservation.ok) {
    sendJson(res, 402, { error: "budget_exceeded" });
    return;
  }
  const reserved = reservation.reserved;

  const traceId = randomUUID();
  const startedAt = performance.now();
  const providers = fallback !== undefined ? [active, fallback] : [active];

  let lastFailure: ProviderFailure | undefined;
  let retryCount = 0;
  let settled = false;

  try {
    outer: for (const provider of providers) {
      for (let attempt = 0; attempt <= retryAttempts; attempt++) {
        if (attempt > 0) retryCount += 1;

        const outcome = clientStreams
          ? await streamAttempt(provider, chatRequest, maxTokens, res)
          : await callNonStream(provider, chatRequest.messages, maxTokens);

        if (outcome.ok) {
          await completeSuccess({
            res,
            provider,
            clientStreams,
            usage: outcome.usage,
            content: "content" in outcome ? outcome.content : undefined,
            tenant,
            traceId,
            retryCount,
            startedAt,
            reserved,
            idempotencyKey,
            bodyHash,
          });
          return;
        }

        lastFailure = outcome.failure;
        if (outcome.headersSent) {
          // Headers + some deltas already went out: terminate the SSE stream
          // with an error event and record only what upstream reported.
          await completeMidStreamFailure({
            res,
            provider,
            usage: outcome.usage,
            failure: outcome.failure,
            tenant,
            traceId,
            retryCount,
            startedAt,
            reserved,
          });
          settled = true;
          return;
        }
        if (!outcome.retryable) break outer;
      }
    }

    // Every attempt failed before anything reached the client: uniform domain error.
    const failure = lastFailure ?? { kind: "network" as const, message: "no provider attempted" };
    const classified = classifyFailure(failure);
    settleBudget(tenant, reserved, 0);
    settled = true;
    const record = makeRecord({
      tenant,
      provider: providers[0].name,
      model: providers[0].model,
      stream: clientStreams,
      traceId,
      retryCount,
      latencyMs: performance.now() - startedAt,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      status: classified.status,
    });
    addRecord(record);
    await writeLogRecord(record);
    sendJson(res, classified.status, { error: classified.code });
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 502, { error: "upstream_error" });
    } else if (clientStreams) {
      writeSse(res, { error: { code: "upstream_error" } });
      res.end();
    } else {
      res.end();
    }
  } finally {
    if (!settled) settleBudget(tenant, reserved, 0);
  }
}

function streamAttempt(provider: ProviderConfig, chatRequest: ChatRequest, maxTokens: number, res: ServerResponse): Promise<StreamOutcome> {
  return callStream(provider, chatRequest.messages, maxTokens, {
    start() {
      startSse(res);
    },
    delta(text) {
      writeSse(res, { choices: [{ delta: { content: text } }] });
    },
    error(code, message) {
      throw new MidStreamError(code, message);
    },
  });
}

async function completeSuccess(input: {
  res: ServerResponse;
  provider: ProviderConfig;
  clientStreams: boolean;
  usage: Usage;
  content: string | undefined;
  tenant: string;
  traceId: string;
  retryCount: number;
  startedAt: number;
  reserved: number;
  idempotencyKey: string | undefined;
  bodyHash: string;
}): Promise<void> {
  const cost = computeCost(input.provider, input.usage);
  settleBudget(input.tenant, input.reserved, cost);
  const record = makeRecord({
    tenant: input.tenant,
    provider: input.provider.name,
    model: input.provider.model,
    stream: input.clientStreams,
    traceId: input.traceId,
    retryCount: input.retryCount,
    latencyMs: performance.now() - input.startedAt,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    cost,
    status: 200,
  });
  addRecord(record);
  const logPromise = writeLogRecord(record);

  const payload = {
    content: input.content,
    provider: input.provider.name,
    model: input.provider.model,
    usage: input.usage,
    cost,
  };

  if (input.clientStreams) {
    writeSse(input.res, {
      usage: input.usage,
      cost,
      provider: input.provider.name,
      model: input.provider.model,
    });
    await logPromise;
    input.res.end();
  } else {
    if (input.idempotencyKey !== undefined) {
      idempotencyStoreResult(input.tenant, input.idempotencyKey, input.bodyHash, 200, payload);
    }
    await logPromise;
    sendJson(input.res, 200, payload);
  }
}

async function completeMidStreamFailure(input: {
  res: ServerResponse;
  provider: ProviderConfig;
  usage: Usage;
  failure: ProviderFailure;
  tenant: string;
  traceId: string;
  retryCount: number;
  startedAt: number;
  reserved: number;
}): Promise<void> {
  const classified = classifyFailure(input.failure);
  const cost = computeCost(input.provider, input.usage);
  settleBudget(input.tenant, input.reserved, cost);
  const record = makeRecord({
    tenant: input.tenant,
    provider: input.provider.name,
    model: input.provider.model,
    stream: true,
    traceId: input.traceId,
    retryCount: input.retryCount,
    latencyMs: performance.now() - input.startedAt,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    cost,
    status: classified.status,
  });
  addRecord(record);
  await writeLogRecord(record);
  writeSse(input.res, { error: { code: classified.code } });
  input.res.end();
}
