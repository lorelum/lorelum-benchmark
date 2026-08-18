import { createServer as createHttpServer, type Server } from "node:http";
import { handleChat, sendJson } from "./gateway";
import { queryUsage } from "./store";

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/chat") {
        await handleChat(req, res);
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/api/usage")) {
        const url = new URL(req.url, "http://localhost");
        const payload = queryUsage({
          tenant: url.searchParams.get("tenant") ?? undefined,
          model: url.searchParams.get("model") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        });
        sendJson(res, 200, payload);
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, { error: "upstream_error" });
      else res.end();
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}
