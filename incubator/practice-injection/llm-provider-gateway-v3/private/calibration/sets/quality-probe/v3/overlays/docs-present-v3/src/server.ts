import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { chatAnthropic, anthropicCost, streamAnthropic } from "./anthropic";
import { chatNebula, nebulaCost, streamNebula } from "./nebula";
import { chatOpenAi, openAiCost, streamOpenAi, UpstreamFailure } from "./openai";
import { appendRecord, idempotentLookup, remember, reserve, settle, snap } from "./usage";
import type { ChatMessage, ChatRequest, ProviderConfig, ProviderProtocol, Usage } from "./types";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function loadProvider(name: string): ProviderConfig | null {
  const prefix = name.toUpperCase();
  const model = process.env[`${prefix}_MODEL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const baseUrl = process.env[`${prefix}_BASE_URL`];
  if (!model || !apiKey || !baseUrl) return null;
  const rawProtocol = process.env[`${prefix}_PROTOCOL`];
  const protocol: ProviderProtocol = rawProtocol === "anthropic" ? "anthropic" : rawProtocol === "nebula" ? "nebula" : "openai";
  return {
    name,
    protocol,
    model,
    apiKey,
    baseUrl,
    priceInPerMillion: Number(process.env[`${prefix}_PRICE_IN`] ?? "0"),
    priceOutPerMillion: Number(process.env[`${prefix}_PRICE_OUT`] ?? "0"),
  };
}

function registry(): Record<string, ProviderConfig> {
  const names = (process.env.GATEWAY_PROVIDERS ?? "openai,deepseek,anthropic,nebula").split(",").map((name) => name.trim()).filter(Boolean);
  const result: Record<string, ProviderConfig> = {};
  for (const name of names) {
    const provider = loadProvider(name);
    if (provider) result[name] = provider;
  }
  return result;
}

function chain(): ProviderConfig[] {
  const all = registry();
  const activeName = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
  const active = all[activeName];
  if (!active) throw new Error("unsupported_provider");
  const fallbackName = process.env.GATEWAY_FALLBACK_PROVIDER;
  const fallback = fallbackName ? all[fallbackName] : undefined;
  return fallback && fallback.name !== active.name ? [active, fallback] : [active];
}

function maxPrice(providers: ProviderConfig[]): number {
  return Math.max(...providers.map((provider) => provider.priceOutPerMillion));
}

function mapFailure(error: unknown): { status: number; code: string } {
  if (error instanceof UpstreamFailure) {
    if (error.code === "authentication_failed") return { status: 401, code: "authentication_failed" };
    if (error.code === "rate_limited") return { status: 429, code: "rate_limited" };
    if (error.code === "upstream_timeout") return { status: 504, code: "upstream_timeout" };
  }
  return { status: 502, code: "upstream_error" };
}

type ProviderCall = {
  chat: (provider: ProviderConfig, messages: ChatMessage[]) => Promise<{ content: string; usage: Usage }>;
  stream: (provider: ProviderConfig, messages: ChatMessage[]) => AsyncGenerator<{ type: "delta"; text: string } | { type: "done"; usage: Usage }, void, unknown>;
  cost: (provider: ProviderConfig, usage: Usage) => number;
};

function callFor(provider: ProviderConfig): ProviderCall {
  if (provider.name === "openai" || provider.name === "deepseek") return { chat: chatOpenAi, stream: streamOpenAi, cost: openAiCost };
  if (provider.name === "anthropic") return { chat: chatAnthropic, stream: streamAnthropic, cost: anthropicCost };
  if (provider.name === "nebula") return { chat: chatNebula, stream: streamNebula, cost: nebulaCost };
  throw new Error("unsupported_provider");
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/usage") {
      const statusRaw = url.searchParams.get("status");
      sendJson(res, 200, snap({
        tenant: url.searchParams.get("tenant") ?? undefined,
        model: url.searchParams.get("model") ?? undefined,
        status: statusRaw ? Number(statusRaw) : undefined,
      }));
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
  let request: ChatRequest;
  try {
    request = JSON.parse(rawBody || "{}") as ChatRequest;
    if (!Array.isArray(request.messages) || request.messages.length === 0) throw new Error("invalid");
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  const tenant = (req.headers["x-tenant-id"] as string | undefined) ?? "default";
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  const idempotency = await idempotentLookup(tenant, idempotencyKey, rawBody);
  if (idempotency.kind === "hit") {
    sendJson(res, 200, idempotency.value);
    return;
  }
  if (idempotency.kind === "conflict") {
    sendJson(res, 409, { error: "idempotency_conflict" });
    return;
  }

  let providers: ProviderConfig[];
  try {
    providers = chain();
  } catch {
    sendJson(res, 400, { error: "unsupported_provider" });
    return;
  }
  const reservation = await reserve(tenant, request.max_tokens ?? 0, maxPrice(Object.values(registry())));
  if (reservation === null && Number.isFinite(Number(process.env[`BUDGET_${tenant.toUpperCase()}`]))) {
    sendJson(res, 402, { error: "budget_exceeded" });
    return;
  }

  const streaming = request.stream === true && (req.headers.accept ?? "").includes("text/event-stream");
  const started = performance.now();
  const traceId = crypto.randomUUID();
  try {
    if (streaming) {
      let served: ProviderConfig | null = null;
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      let iterator: AsyncGenerator<any, void, unknown> | null = null;
      let current: ProviderConfig = providers[0];
      for (const provider of providers) {
        const call = callFor(provider);
        iterator = call.stream(provider, request.messages);
        const first = await iterator.next();
        current = provider;
        served = provider;
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        let event = first;
        while (true) {
          if (event.done) break;
          if (event.value.type === "delta") res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.value.text } }] })}\n\n`);
          else usage = event.value.usage;
          event = await iterator.next();
        }
        break;
      }
      if (!served) throw new Error("all providers failed");
      const cost = callFor(served).cost(served, usage);
      res.write(`data: ${JSON.stringify({ usage, cost, provider: served.name, model: served.model })}\n\n`);
      await appendRecord({ tenant, provider: served.name, model: served.model, stream: true, traceId, retryCount: 0, latencyMs: performance.now() - started, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
      if (reservation) await settle(tenant, reservation.reserved, cost);
      res.end();
      return;
    }

    let lastError: unknown;
    for (const provider of providers) {
      const call = callFor(provider);
      const attempts = Number(process.env.GATEWAY_RETRY_ATTEMPTS ?? "1");
      for (let attempt = 0; attempt <= attempts; attempt += 1) {
        try {
          const result = await call.chat(provider, request.messages);
          const cost = call.cost(provider, result.usage);
          const response = { content: result.content, provider: provider.name, model: provider.model, usage: result.usage, cost };
          await appendRecord({ tenant, provider: provider.name, model: provider.model, stream: false, traceId, retryCount: attempt, latencyMs: performance.now() - started, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
          if (reservation) await settle(tenant, reservation.reserved, cost);
          await remember(tenant, idempotencyKey, rawBody, response);
          sendJson(res, 200, response);
          return;
        } catch (error) {
          lastError = error;
          if (!(error instanceof UpstreamFailure) || !error.retryable) break;
        }
      }
    }
    throw lastError;
  } catch (error) {
    const mapped = mapFailure(error);
    const partialUsage = error instanceof UpstreamFailure && error.usage
      ? error.usage
      : { promptTokens: 0, completionTokens: 0 };
    const partialCost = (partialUsage.promptTokens > 0 || partialUsage.completionTokens > 0)
      ? callFor(providers[0]).cost(providers[0], partialUsage)
      : 0;
    await appendRecord({
      tenant,
      provider: providers[0].name,
      model: providers[0].model,
      stream: streaming,
      traceId,
      retryCount: 0,
      latencyMs: performance.now() - started,
      promptTokens: partialUsage.promptTokens,
      completionTokens: partialUsage.completionTokens,
      cost: partialCost,
      status: mapped.status,
      timestamp: new Date().toISOString(),
    });
    if (reservation) await settle(tenant, reservation.reserved, 0);
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
