import { createServer, type Server } from "node:http";

export type StubKind = "openai" | "deepseek" | "anthropic" | "nebula";

export type Stub = {
  url: string;
  close: () => Promise<void>;
  requestCount: () => number;
};

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) resolve(`http://127.0.0.1:${address.port}`);
      else reject(new Error("stub server did not yield a port"));
    });
  });
}

function send(res: import("node:http").ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function writeEvent(res: import("node:http").ServerResponse, data: string): void {
  res.write(`data: ${data}\n\n`);
}

const responses = {
  openai: { text: "hello from openai", inputTokens: 10, outputTokens: 5 },
  deepseek: { text: "hello from deepseek", inputTokens: 8, outputTokens: 4 },
  anthropic: { text: "hello from anthropic", inputTokens: 12, outputTokens: 6 },
  nebula: { text: "hello from nebula", inputTokens: 14, outputTokens: 7 },
} as const;

/**
 * Local provider stub used by the public test suite. It serves four wire
 * protocols with fixed deterministic responses, SSE included. Nebula uses an
 * OpenAI-like endpoint path, but its auth headers and response/stream field
 * names differ from OpenAI.
 */
export async function createStub(kind: StubKind): Promise<Stub> {
  const validKey = `test-${kind}-key`;
  const attemptCounts = new Map<string, number>();
  let calls = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}") as Record<string, unknown>;
    } catch {
      send(res, 422, { error: "invalid request" });
      return;
    }
    calls += 1;
    const path = (req.url ?? "").split("?")[0];
    const model = typeof body.model === "string" ? body.model : "";
    const attempt = (attemptCounts.get(model) ?? 0) + 1;
    attemptCounts.set(model, attempt);

    // Request-side wire validation: each protocol has a distinct contract.
    if (kind === "anthropic") {
      if (path !== "/v1/messages") return send(res, 400, { error: "wrong path" });
      if (typeof req.headers["x-api-key"] !== "string") return send(res, 400, { error: "missing x-api-key" });
      if (typeof req.headers["anthropic-version"] !== "string") return send(res, 400, { error: "missing anthropic-version" });
      if (typeof body.model !== "string" || !Array.isArray(body.messages) || typeof body.max_tokens !== "number") {
        return send(res, 400, { error: "malformed anthropic body" });
      }
      if (req.headers["x-api-key"] !== validKey) return send(res, 401, { error: "invalid api key" });
    } else if (kind === "nebula") {
      if (path !== "/v1/chat/completions") return send(res, 400, { error: "wrong path" });
      if (typeof req.headers["x-nebula-key"] !== "string") return send(res, 400, { error: "missing x-nebula-key" });
      if (typeof body.model !== "string" || !Array.isArray(body.messages)) return send(res, 400, { error: "malformed nebula body" });
      if (req.headers["x-nebula-key"] !== validKey) return send(res, 401, { error: "invalid api key" });
    } else {
      if (path !== "/chat/completions") return send(res, 400, { error: "wrong path" });
      if (typeof body.model !== "string" || !Array.isArray(body.messages)) return send(res, 400, { error: "malformed body" });
      if (req.headers.authorization !== `Bearer ${validKey}`) return send(res, 401, { error: "invalid api key" });
    }

    if (model === `${kind}-ratelimit` || model === "gpt-4o-ratelimit" || model === "claude-ratelimit") {
      return send(res, 429, { error: "rate limit exceeded" });
    }
    if (model === "gpt-4o-down") return send(res, 503, { error: "service unavailable" });
    if (model === "gpt-4o-timeout") return send(res, 504, { error: "gateway timeout" });
    if (model === "gpt-4o-flaky" && attempt === 1) return send(res, 429, { error: "rate limit exceeded" });

    const stream = req.headers.accept === "text/event-stream" || body.stream === true;
    if (kind === "anthropic") {
      const r = responses.anthropic;
      if (model === "claude-midstream" && stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        writeEvent(res, JSON.stringify({ type: "message_start", message: { usage: { input_tokens: r.inputTokens, output_tokens: 0 } } }));
        writeEvent(res, JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: `${r.text} ` } }));
        writeEvent(res, JSON.stringify({ type: "error", error: { type: "overloaded_error" } }));
        res.end();
        return;
      }
      if (!stream) {
        send(res, 200, { content: [{ type: "text", text: r.text }], usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens } });
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      writeEvent(res, JSON.stringify({ type: "message_start", message: { usage: { input_tokens: r.inputTokens, output_tokens: 0 } } }));
      for (const part of r.text.split(" ")) writeEvent(res, JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: `${part} ` } }));
      writeEvent(res, JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: r.outputTokens } }));
      writeEvent(res, JSON.stringify({ type: "message_stop" }));
      res.end();
      return;
    }
    if (kind === "nebula") {
      const r = responses.nebula;
      if (!stream) {
        send(res, 200, { output_text: r.text, usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens } });
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (const part of r.text.split(" ")) writeEvent(res, JSON.stringify({ delta: { text: `${part} ` } }));
      writeEvent(res, JSON.stringify({ usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens } }));
      writeEvent(res, "[DONE]");
      res.end();
      return;
    }

    const r = responses[kind as Exclude<StubKind, "anthropic" | "nebula">];
    if (!stream) {
      send(res, 200, { choices: [{ message: { content: r.text } }], usage: { prompt_tokens: r.inputTokens, completion_tokens: r.outputTokens } });
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    for (const part of r.text.split(" ")) writeEvent(res, JSON.stringify({ choices: [{ delta: { content: `${part} ` } }] }));
    writeEvent(res, JSON.stringify({ choices: [], usage: { prompt_tokens: r.inputTokens, completion_tokens: r.outputTokens } }));
    writeEvent(res, "[DONE]");
    res.end();
  });
  const url = await listen(server);
  return {
    url,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
    requestCount: () => calls,
  };
}
