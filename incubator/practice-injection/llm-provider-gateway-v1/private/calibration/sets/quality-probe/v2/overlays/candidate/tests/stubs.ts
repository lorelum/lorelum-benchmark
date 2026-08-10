import { createServer, type Server } from "node:http";

export type StubKind = "openai" | "deepseek" | "anthropic";

export type Stub = { url: string; close: () => Promise<void> };

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

/**
 * Local provider stub used by the public test suite. It serves the two wire
 * protocols (OpenAI-compatible chat.completions and Anthropic messages) with
 * fixed deterministic responses, SSE included, so the tests never touch a real
 * vendor endpoint.
 */
export async function createStub(kind: StubKind): Promise<Stub> {
  const validKey = kind === "anthropic" ? "test-anthropic-key" : kind === "deepseek" ? "test-deepseek-key" : "test-openai-key";
  const text = kind === "anthropic" ? "hello from anthropic" : kind === "deepseek" ? "hello from deepseek" : "hello from openai";
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
    const auth = req.headers.authorization ?? req.headers["x-api-key"];
    if (auth !== `Bearer ${validKey}` && auth !== validKey) {
      send(res, 401, { error: "invalid api key" });
      return;
    }
    if (body.model === "gpt-4o-ratelimit" || body.model === "claude-ratelimit") {
      send(res, 429, { error: "rate limit exceeded" });
      return;
    }
    const stream = req.headers.accept === "text/event-stream" || body.stream === true;
    if (kind === "anthropic") {
      if (!stream) {
        send(res, 200, { content: [{ type: "text", text }], usage: { input_tokens: 12, output_tokens: 6 } });
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      writeEvent(res, JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 12, output_tokens: 0 } } }));
      for (const part of text.split(" ")) writeEvent(res, JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: `${part} ` } }));
      writeEvent(res, JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 6 } }));
      writeEvent(res, JSON.stringify({ type: "message_stop" }));
      res.end();
      return;
    }
    if (!stream) {
      send(res, 200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    for (const part of text.split(" ")) writeEvent(res, JSON.stringify({ choices: [{ delta: { content: `${part} ` } }] }));
    writeEvent(res, JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    writeEvent(res, "[DONE]");
    res.end();
  });
  const url = await listen(server);
  return {
    url,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}