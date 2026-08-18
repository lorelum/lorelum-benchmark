import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { ChatRequest } from "./types";
import { DOMAIN_STATUS, DomainError, buildUsageReport, runWithIdempotency, writeOutcome } from "./gateway";
import { ProviderError } from "./providers";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function validateRequest(body: unknown): ChatRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const messages = record.messages;
  if (!Array.isArray(messages)) return null;
  for (const message of messages) {
    if (typeof message !== "object" || message === null) return null;
    const item = message as Record<string, unknown>;
    if (typeof item.role !== "string" || !["system", "user", "assistant"].includes(item.role)) return null;
    if (typeof item.content !== "string") return null;
  }
  const maxTokens = record.max_tokens;
  if (maxTokens !== undefined && (typeof maxTokens !== "number" || !Number.isFinite(maxTokens))) return null;
  const stream = record.stream;
  if (stream !== undefined && typeof stream !== "boolean") return null;

  const request: ChatRequest = { messages: messages as ChatRequest["messages"] };
  if (maxTokens !== undefined) request.max_tokens = maxTokens;
  if (stream !== undefined) request.stream = stream;
  return request;
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/chat") {
        let body: unknown;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          sendJson(res, DOMAIN_STATUS.invalid_request, { error: "invalid_request", message: "request body is not valid JSON" });
          return;
        }
        const request = validateRequest(body);
        if (!request) {
          sendJson(res, DOMAIN_STATUS.invalid_request, { error: "invalid_request", message: "messages must be an array of {role, content}" });
          return;
        }
        const tenant = typeof req.headers["x-tenant-id"] === "string" ? req.headers["x-tenant-id"] : "default";
        const idemKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;
        const outcome = await runWithIdempotency(request, { tenant, traceId: randomUUID(), startedAt: performance.now() }, res, idemKey);
        writeOutcome(res, outcome, false);
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/usage")) {
        const url = new URL(req.url, "http://localhost");
        const tenant = url.searchParams.get("tenant") ?? undefined;
        const model = url.searchParams.get("model") ?? undefined;
        const status = url.searchParams.get("status") ?? undefined;
        sendJson(res, 200, buildUsageReport(tenant, model, status));
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof DomainError) {
        sendJson(res, DOMAIN_STATUS[error.code] ?? 500, { error: error.code, message: error.message });
        return;
      }
      if (error instanceof ProviderError) {
        sendJson(res, DOMAIN_STATUS[error.code] ?? 502, { error: error.code, message: error.message });
        return;
      }
      sendJson(res, 502, { error: "upstream_error", message: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
