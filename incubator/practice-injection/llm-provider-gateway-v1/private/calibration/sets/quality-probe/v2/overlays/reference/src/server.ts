import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { activeProvider, loadRegistry, ProviderNotConfigured } from "./config";
import { buildRegistry, ProviderUpstreamError } from "./providers";
import { costFor } from "./billing";
import { recordUsage, usageAggregates } from "./usage";
import type { ChatRequest, DomainErrorCode, Usage } from "./types";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function domainError(error: unknown): { status: number; code: DomainErrorCode | "upstream_error" } {
  if (error instanceof ProviderUpstreamError) {
    if (error.code === "authentication_failed") return { status: 401, code: "authentication_failed" };
    if (error.code === "rate_limited") return { status: 429, code: "rate_limited" };
    if (error.code === "upstream_timeout") return { status: 504, code: "upstream_timeout" };
  }
  return { status: 502, code: "upstream_error" };
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/usage") {
      sendJson(res, 200, { byModel: usageAggregates() });
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let request: ChatRequest;
  try {
    request = JSON.parse((await readBody(req)) || "{}") as ChatRequest;
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }

  const started = performance.now();
  let provider;
  try {
    provider = activeProvider();
  } catch (error) {
    sendJson(res, 400, { error: "unsupported_provider", message: error instanceof ProviderNotConfigured ? error.provider : String(error) });
    return;
  }

  const adapters = buildRegistry(loadRegistry());
  const adapter = adapters[provider.name];
  if (!adapter) {
    sendJson(res, 400, { error: "unsupported_provider" });
    return;
  }

  const streaming = request.stream === true && (req.headers.accept ?? "").includes("text/event-stream");
  try {
    if (streaming) {
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for await (const event of adapter.stream(request.messages)) {
        if (event.type === "delta") {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.text } }] })}\n\n`);
        } else {
          usage = event.usage;
        }
      }
      const cost = costFor(provider, usage);
      res.write(`data: ${JSON.stringify({ usage, cost })}\n\n`);
      await recordUsage({ provider: provider.name, model: provider.model, stream: true, latencyMs: Date.now() - started, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
      res.end();
      return;
    }
    const result = await adapter.chat(request.messages);
    const cost = costFor(provider, result.usage);
    await recordUsage({ provider: provider.name, model: provider.model, stream: false, latencyMs: Date.now() - started, promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, cost, status: 200, timestamp: new Date().toISOString() });
    sendJson(res, 200, { content: result.content, usage: result.usage, cost });
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const mapped = domainError(error);
    await recordUsage({ provider: provider.name, model: provider.model, stream: streaming, latencyMs: Date.now() - started, promptTokens: 0, completionTokens: 0, cost: 0, status: mapped.status, timestamp: new Date().toISOString() });
    sendJson(res, mapped.status, { error: mapped.code });
  }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}