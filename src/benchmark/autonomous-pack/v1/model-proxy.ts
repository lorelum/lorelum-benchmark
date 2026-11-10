import { isIP } from "node:net";
import { UsageCollector } from "./provider-usage";

export { UsageCollector } from "./provider-usage";
export type { ProviderUsage, UsageRecord, UsageStatus } from "./provider-usage";

/** A single-purpose gateway: the coding agent never receives the upstream key. */
export type ModelProxyConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  port: number;
  hostname: string;
  maxRequests: number;
};

export function startModelProxy(config: ModelProxyConfig, usage = new UsageCollector()) {
  let base: URL;
  try { base = new URL(config.baseUrl); } catch { throw new Error("Invalid model endpoint"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Model endpoint must be an HTTPS base URL without credentials, query or fragment");
  if (!config.apiKey || !config.model || !Number.isSafeInteger(config.port) || config.port < 0 || config.port > 65535 || !Number.isSafeInteger(config.maxRequests) || config.maxRequests < 1) throw new Error("Invalid model proxy configuration");
  // The operator supplies the listen interface; the agent must be on a Docker
  // internal network and must not share the proxy's upstream network.
  if (!config.hostname || (config.hostname !== "localhost" && !isIP(config.hostname))) throw new Error("Proxy listen address must be an IP address or localhost");
  const endpoint = new URL(`${base.pathname.replace(/\/+$/, "")}/chat/completions`, base.origin);
  let requests = 0;
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
      // Enforce the equal turn budget independently of Pi extensions. Every
      // permitted provider request consumes one slot, including failures.
      if (requests >= config.maxRequests) return new Response("Request budget exhausted", { status: 429 });
      requests++;
      const capture = usage.begin();
      const payload = body as Record<string, unknown>;
      if (payload.stream === true) {
        const options = payload.stream_options;
        payload.stream_options = { ...(options && typeof options === "object" && !Array.isArray(options) ? options : {}), include_usage: true };
      }
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
        capture.finish("error");
        return new Response("Upstream request failed", { status: 502 });
      }
      // Never relay provider error bodies, which may contain sensitive details.
      if (!upstream.ok) {
        capture.finish("error");
        void upstream.body?.cancel().catch(() => {});
        return new Response("Upstream request failed", { status: upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502 });
      }
      const contentType = upstream.headers.get("content-type");
      const streaming = contentType?.split(";", 1)[0].trim().toLowerCase() === "text/event-stream";
      if (!upstream.body) {
        capture.finish("missing");
        return new Response(null, { status: upstream.status, headers: contentType ? { "content-type": contentType } : {} });
      }
      const reader = upstream.body.getReader();
      const responseBody = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const result = await reader.read();
            if (result.done) {
              capture.end(streaming);
              controller.close();
            } else {
              capture.push(result.value, streaming);
              controller.enqueue(result.value);
            }
          } catch {
            capture.finish("interrupted");
            controller.error(new Error("Upstream response interrupted"));
          }
        },
        async cancel() {
          capture.finish("interrupted");
          try { await reader.cancel(); } catch {}
        },
      });
      return new Response(responseBody, { status: upstream.status, headers: contentType ? { "content-type": contentType } : {} });
    },
  });
  return server;
}

if (import.meta.main) {
  // Read once from stdin, not argv, logs, the image, or the agent environment.
  // The runner must close stdin after writing this JSON object.
  let config: ModelProxyConfig;
  try { config = JSON.parse(await Bun.stdin.text()) as ModelProxyConfig; } catch { throw new Error("Invalid model proxy configuration"); }
  // Stdout is a host-controlled channel, never an agent-accessible HTTP route.
  const usage = new UsageCollector(record => console.log(`model-proxy-usage:${JSON.stringify(record)}`));
  const server = startModelProxy(config, usage);
  console.log(`model-proxy-ready:${server.port}`);
  process.once("SIGTERM", async () => {
    try {
      await server.stop(true);
      process.stdout.write(`model-proxy-stopped:${JSON.stringify(usage.snapshot())}\n`, () => process.exit(0));
    } catch {
      process.exit(1);
    }
  });
}
