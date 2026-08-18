import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Gateway } from "./gateway";
import type { ChatRequest } from "./types";

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function parseQuery(url: string): URLSearchParams {
  const index = url.indexOf("?");
  return new URLSearchParams(index >= 0 ? url.slice(index + 1) : "");
}

export function createServer(): Server {
  const gateway = new Gateway();
  return createHttpServer(async (req, res) => {
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (req.method === "POST" && path === "/api/chat") {
        await handleChat(gateway, req, res);
        return;
      }
      if (req.method === "GET" && path === "/api/usage") {
        const query = parseQuery(req.url ?? "");
        const tenant = query.get("tenant") ?? undefined;
        const model = query.get("model") ?? undefined;
        const statusRaw = query.get("status");
        const status = statusRaw !== null && statusRaw !== "" ? Number(statusRaw) : undefined;
        sendJson(res, 200, gateway.getUsage(tenant, model, status));
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    } catch {
      sendJson(res, 500, { error: "upstream_error" });
    }
  });
}

async function handleChat(gateway: Gateway, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let request: ChatRequest;
  try {
    request = JSON.parse((await readBody(req)) || "{}") as ChatRequest;
  } catch {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }

  const tenantHeader = req.headers["x-tenant-id"];
  const tenant = typeof tenantHeader === "string" && tenantHeader ? tenantHeader : "default";
  const keyHeader = req.headers["idempotency-key"];
  const idempotencyKey = typeof keyHeader === "string" && keyHeader ? keyHeader : undefined;

  const outcome = await gateway.chat(request, { tenant, idempotencyKey });
  if (outcome.kind === "json") {
    sendJson(res, outcome.status, outcome.payload);
  } else {
    res.writeHead(outcome.status, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.end(outcome.body);
  }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
