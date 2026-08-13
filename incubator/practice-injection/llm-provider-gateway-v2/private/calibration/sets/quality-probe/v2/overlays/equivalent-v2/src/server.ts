import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadRegistry } from "./gateway/registry";
import { GatewayError, ProviderUpstreamError } from "./gateway/domain-errors";
import { costFor, makeTraceId, recordUsage, usageSnapshot, type BudgetReservation } from "./gateway/accounting";
import {
  configuredRetryAttempts,
  lookupIdempotency,
  rememberIdempotency,
  reserveForTenant,
  resolveProviderChain,
  runChatAttempts,
  runStreamAttempts,
  settleForTenant,
} from "./gateway/execution";
import type { ChatRequest, DomainErrorCode, Usage, UsageRecord } from "./types";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function domainError(error: unknown): { status: number; code: DomainErrorCode } {
  if (error instanceof GatewayError) return { status: error.status, code: error.code };
  if (error instanceof ProviderUpstreamError) {
    if (error.code === "authentication_failed") return { status: 401, code: "authentication_failed" };
    if (error.code === "rate_limited") return { status: 429, code: "rate_limited" };
    if (error.code === "upstream_timeout") return { status: 504, code: "upstream_timeout" };
  }
  return { status: 502, code: "upstream_error" };
}

function parseChatRequest(body: string): ChatRequest | null {
  try {
    const value = JSON.parse(body || "{}") as ChatRequest;
    if (!Array.isArray(value.messages) || value.messages.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/usage") {
      const tenant = url.searchParams.get("tenant") ?? undefined;
      const model = url.searchParams.get("model") ?? undefined;
      const statusRaw = url.searchParams.get("status");
      const status = statusRaw ? Number(statusRaw) : undefined;
      sendJson(res, 200, usageSnapshot({ tenant, model, ...(Number.isInteger(status) ? { status } : {}) }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawBody = await readBody(req);
  const request = parseChatRequest(rawBody);
  if (!request) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  const tenant = (req.headers["x-tenant-id"] as string | undefined) ?? "default";
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  const idempotency = await lookupIdempotency(tenant, idempotencyKey, rawBody);
  if (idempotency.kind === "hit") {
    sendJson(res, 200, idempotency.value);
    return;
  }
  if (idempotency.kind === "conflict") {
    sendJson(res, 409, { error: "idempotency_conflict" });
    return;
  }
  const registry = loadRegistry();
  let providers;
  try {
    providers = resolveProviderChain(registry);
  } catch (error) {
    const mapped = domainError(error);
    sendJson(res, mapped.status, { error: mapped.code });
    return;
  }
  const streaming = request.stream === true && (req.headers.accept ?? "").includes("text/event-stream");
  let reservation: BudgetReservation = { applied: false };
  try {
    reservation = await reserveForTenant(tenant, request.max_tokens, registry);
  } catch (error) {
    const mapped = domainError(error);
    sendJson(res, mapped.status, { error: mapped.code });
    return;
  }
  const started = performance.now();
  const traceId = makeTraceId();
  const active = providers[0];
  try {
    if (streaming) {
      const iterator = runStreamAttempts(providers, request.messages);
      let first = await iterator.next();
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      let served = active;
      while (true) {
        if (first.done) break;
        const event = first.value;
        if (event.type === "delta") {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.text } }] })}\n\n`);
        } else {
          usage = event.usage;
          served = event.provider;
        }
        first = await iterator.next();
      }
      const cost = costFor(served, usage);
      res.write(`data: ${JSON.stringify({ usage, cost, provider: served.name, model: served.model })}\n\n`);
      await recordUsage({ tenant, provider: served.name, model: served.model, stream: true, traceId, retryCount: 0, latencyMs: performance.now() - started, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
      await settleForTenant(tenant, reservation, cost);
      res.end();
      return;
    }
    const result = await runChatAttempts(providers, request.messages, configuredRetryAttempts());
    const cost = costFor(result.provider, result.usage);
    const response = { content: result.content, provider: result.provider.name, model: result.provider.model, usage: result.usage, cost };
    await recordUsage({ tenant, provider: result.provider.name, model: result.provider.model, stream: false, traceId, retryCount: result.retryCount, latencyMs: performance.now() - started, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
    await settleForTenant(tenant, reservation, cost);
    await rememberIdempotency(tenant, idempotencyKey, rawBody, response);
    sendJson(res, 200, response);
  } catch (error) {
    const mapped = domainError(error);
    const partialUsage = error instanceof ProviderUpstreamError && error.usage
      ? error.usage
      : { promptTokens: 0, completionTokens: 0 };
    const partialCost = (partialUsage.promptTokens > 0 || partialUsage.completionTokens > 0)
      ? costFor(active, partialUsage)
      : 0;
    await settleForTenant(tenant, reservation, 0);
    await recordUsage({ tenant, provider: active.name, model: active.model, stream: streaming, traceId, retryCount: 0, latencyMs: performance.now() - started, promptTokens: partialUsage.promptTokens, completionTokens: partialUsage.completionTokens, cost: partialCost, status: mapped.status, timestamp: new Date().toISOString() });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: { code: mapped.code } })}\n\n`);
      res.end();
      return;
    }
    sendJson(res, mapped.status, { error: mapped.code });
  }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
