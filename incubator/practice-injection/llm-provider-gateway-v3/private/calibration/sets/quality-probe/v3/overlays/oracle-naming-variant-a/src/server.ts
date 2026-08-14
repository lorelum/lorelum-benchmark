import { createServer as createHttpServer, type Server } from "node:http";
import { Gateway, sendJson } from "./gateway";

export function createServer(): Server {
  const gateway = new Gateway();
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/api/chat") {
      try {
        await gateway.handleChat(req, res);
      } catch {
        sendJson(res, 502, { error: "upstream_error" });
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/usage") {
      gateway.handleUsage(req, res);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
