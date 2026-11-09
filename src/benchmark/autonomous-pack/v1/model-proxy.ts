import { isIP } from "node:net";

/** A single-purpose gateway: the coding agent never receives the upstream key. */
export type ModelProxyConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  port: number;
  hostname: string;
};

export function startModelProxy(config: ModelProxyConfig) {
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Model endpoint must be an HTTPS base URL without credentials, query or fragment");
  if (!config.apiKey || !config.model || !Number.isSafeInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error("Invalid model proxy configuration");
  // The operator supplies the listen interface; the agent must be on a Docker
  // internal network and must not share the proxy's upstream network.
  if (!config.hostname || (config.hostname !== "localhost" && !isIP(config.hostname))) throw new Error("Proxy listen address must be an IP address or localhost");
  const endpoint = new URL(`${base.pathname.replace(/\/+$/, "")}/chat/completions`, base.origin);
  const server = Bun.serve({
    hostname: config.hostname,
    port: config.port,
    idleTimeout: 255,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "POST" || url.pathname !== "/v1/chat/completions" || url.search) return new Response("Not found", { status: 404 });
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response("Expected JSON", { status: 415 });
      let body: unknown;
      try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body) || (body as Record<string, unknown>).model !== config.model) return new Response("Model not permitted", { status: 403 });
      let upstream: Response;
      try {
        upstream = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(body),
          redirect: "manual",
          signal: request.signal,
        });
      } catch {
        return new Response("Upstream request failed", { status: 502 });
      }
      // Redirects are never followed or forwarded; only provider response data
      // and its content type pass back to the isolated agent.
      if (upstream.status >= 300 && upstream.status < 400) return new Response("Upstream redirect rejected", { status: 502 });
      const contentType = upstream.headers.get("content-type");
      return new Response(upstream.body, { status: upstream.status, headers: contentType ? { "content-type": contentType } : {} });
    },
  });
  return server;
}

if (import.meta.main) {
  // Read once from stdin, not argv, logs, the image, or the agent environment.
  // The runner must close stdin after writing this JSON object.
  const config = JSON.parse(await Bun.stdin.text()) as ModelProxyConfig;
  const server = startModelProxy(config);
  console.log(`model-proxy-ready:${server.port}`);
}
