import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { chatWithOpenAI } from "./openai";
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

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/chat") {
      try {
        const request = JSON.parse((await readBody(req)) || "{}") as ChatRequest;
        const result = await chatWithOpenAI(request.messages ?? []);
        sendJson(res, 200, { content: result.content });
      } catch (error) {
        const status = error instanceof Error && "status" in error ? Number((error as { status: number }).status) : 500;
        sendJson(res, status, { error: "upstream_error", message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}