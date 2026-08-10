import { appendFile } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ChatMessage } from "./types";

type ChatRequest = { messages?: ChatMessage[]; stream?: boolean };

const books: Record<string, { requests: number; promptTokens: number; completionTokens: number; totalCost: number; totalLatencyMs: number; maxLatencyMs: number }> = {};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function record(provider: string, model: string, stream: boolean, latencyMs: number, promptTokens: number, completionTokens: number, cost: number, status: number): Promise<void> {
  const row = books[model] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0, totalLatencyMs: 0, maxLatencyMs: 0 };
  row.requests += 1;
  row.promptTokens += promptTokens;
  row.completionTokens += completionTokens;
  row.totalCost += cost;
  row.totalLatencyMs += latencyMs;
  row.maxLatencyMs = Math.max(row.maxLatencyMs, latencyMs);
  books[model] = row;
  const sink = process.env.GATEWAY_LOG_PATH;
  if (sink) {
    await appendFile(sink, `${JSON.stringify({ provider, model, stream, latencyMs, promptTokens, completionTokens, cost, status, timestamp: new Date().toISOString() })}\n`, "utf-8");
  }
}

async function callOpenAiCompatible(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[], stream: boolean): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...(stream ? { accept: "text/event-stream" } : {}) },
    body: JSON.stringify({ model, messages, ...(stream ? { stream: true } : {}) }),
  });
}

async function callAnthropic(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[], stream: boolean): Promise<Response> {
  return fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", ...(stream ? { accept: "text/event-stream" } : {}) },
    body: JSON.stringify({ model, messages, max_tokens: 1024, ...(stream ? { stream: true } : {}) }),
  });
}

async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") yield data;
        }
      }
    }
  }
}

export function createServer(): Server {
  return createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/api/usage") {
      const byModel: Record<string, unknown> = {};
      for (const [model, row] of Object.entries(books)) {
        byModel[model] = {
          model,
          requests: row.requests,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalCost: row.totalCost,
          avgLatencyMs: Math.round(row.totalLatencyMs / row.requests),
          maxLatencyMs: row.maxLatencyMs,
        };
      }
      sendJson(res, 200, { byModel });
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
  const messages = request.messages ?? [];
  if (messages.length === 0) {
    sendJson(res, 422, { error: "invalid_request" });
    return;
  }
  const provider = process.env.GATEWAY_ACTIVE_PROVIDER ?? "openai";
  const streaming = request.stream === true && (req.headers.accept ?? "").includes("text/event-stream");
  const started = performance.now();
  try {
    if (provider === "openai") {
      const model = process.env.OPENAI_MODEL ?? "gpt-4o";
      const response = await callOpenAiCompatible(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1", process.env.OPENAI_API_KEY ?? "", model, messages, streaming);
      if (response.status === 401) {
        await record("openai", model, streaming, performance.now() - started, 0, 0, 0, 401);
        sendJson(res, 401, { error: "authentication_failed" });
        return;
      }
      if (response.status === 429) {
        await record("openai", model, streaming, performance.now() - started, 0, 0, 0, 429);
        sendJson(res, 429, { error: "rate_limited" });
        return;
      }
      if (!response.ok) throw new Error(`openai returned ${response.status}`);
      if (streaming) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        let promptTokens = 0;
        let completionTokens = 0;
        for await (const data of sseLines(response.body!)) {
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          if (event.choices?.[0]?.delta?.content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.choices[0].delta.content } }] })}\n\n`);
          if (event.usage) {
            promptTokens = event.usage.prompt_tokens ?? 0;
            completionTokens = event.usage.completion_tokens ?? 0;
          }
        }
        const cost = round6((promptTokens / 1_000_000) * Number(process.env.OPENAI_PRICE_IN ?? "0") + (completionTokens / 1_000_000) * Number(process.env.OPENAI_PRICE_OUT ?? "0"));
        res.write(`data: ${JSON.stringify({ usage: { promptTokens, completionTokens }, cost })}\n\n`);
        await record("openai", model, true, performance.now() - started, promptTokens, completionTokens, cost, 200);
        res.end();
        return;
      }
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const cost = round6((promptTokens / 1_000_000) * Number(process.env.OPENAI_PRICE_IN ?? "0") + (completionTokens / 1_000_000) * Number(process.env.OPENAI_PRICE_OUT ?? "0"));
      await record("openai", model, false, performance.now() - started, promptTokens, completionTokens, cost, 200);
      sendJson(res, 200, { content, usage: { promptTokens, completionTokens }, cost });
      return;
    }
    if (provider === "deepseek") {
      const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
      const response = await callOpenAiCompatible(process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1", process.env.DEEPSEEK_API_KEY ?? "", model, messages, streaming);
      if (response.status === 401) {
        await record("deepseek", model, streaming, performance.now() - started, 0, 0, 0, 401);
        sendJson(res, 401, { error: "authentication_failed" });
        return;
      }
      if (response.status === 429) {
        await record("deepseek", model, streaming, performance.now() - started, 0, 0, 0, 429);
        sendJson(res, 429, { error: "rate_limited" });
        return;
      }
      if (!response.ok) throw new Error(`deepseek returned ${response.status}`);
      if (streaming) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        let promptTokens = 0;
        let completionTokens = 0;
        for await (const data of sseLines(response.body!)) {
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          if (event.choices?.[0]?.delta?.content) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.choices[0].delta.content } }] })}\n\n`);
          if (event.usage) {
            promptTokens = event.usage.prompt_tokens ?? 0;
            completionTokens = event.usage.completion_tokens ?? 0;
          }
        }
        const cost = round6((promptTokens / 1_000_000) * Number(process.env.DEEPSEEK_PRICE_IN ?? "0") + (completionTokens / 1_000_000) * Number(process.env.DEEPSEEK_PRICE_OUT ?? "0"));
        res.write(`data: ${JSON.stringify({ usage: { promptTokens, completionTokens }, cost })}\n\n`);
        await record("deepseek", model, true, performance.now() - started, promptTokens, completionTokens, cost, 200);
        res.end();
        return;
      }
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const cost = round6((promptTokens / 1_000_000) * Number(process.env.DEEPSEEK_PRICE_IN ?? "0") + (completionTokens / 1_000_000) * Number(process.env.DEEPSEEK_PRICE_OUT ?? "0"));
      await record("deepseek", model, false, performance.now() - started, promptTokens, completionTokens, cost, 200);
      sendJson(res, 200, { content, usage: { promptTokens, completionTokens }, cost });
      return;
    }
    if (provider === "anthropic") {
      const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
      const response = await callAnthropic(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com", process.env.ANTHROPIC_API_KEY ?? "", model, messages, streaming);
      if (response.status === 401) {
        await record("anthropic", model, streaming, performance.now() - started, 0, 0, 0, 401);
        sendJson(res, 401, { error: "authentication_failed" });
        return;
      }
      if (response.status === 429) {
        await record("anthropic", model, streaming, performance.now() - started, 0, 0, 0, 429);
        sendJson(res, 429, { error: "rate_limited" });
        return;
      }
      if (!response.ok) throw new Error(`anthropic returned ${response.status}`);
      if (streaming) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        let inputTokens = 0;
        let outputTokens = 0;
        for await (const data of sseLines(response.body!)) {
          const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; usage?: { output_tokens?: number }; message?: { usage?: { input_tokens?: number } } };
          if (event.type === "message_start" && event.message?.usage) inputTokens = event.message.usage.input_tokens ?? 0;
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] })}\n\n`);
          }
          if (event.type === "message_delta" && event.usage) outputTokens = event.usage.output_tokens ?? 0;
        }
        const cost = round6((inputTokens / 1_000_000) * Number(process.env.ANTHROPIC_PRICE_IN ?? "0") + (outputTokens / 1_000_000) * Number(process.env.ANTHROPIC_PRICE_OUT ?? "0"));
        res.write(`data: ${JSON.stringify({ usage: { promptTokens: inputTokens, completionTokens: outputTokens }, cost })}\n\n`);
        await record("anthropic", model, true, performance.now() - started, inputTokens, outputTokens, cost, 200);
        res.end();
        return;
      }
      const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const content = (payload.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
      const inputTokens = payload.usage?.input_tokens ?? 0;
      const outputTokens = payload.usage?.output_tokens ?? 0;
      const cost = round6((inputTokens / 1_000_000) * Number(process.env.ANTHROPIC_PRICE_IN ?? "0") + (outputTokens / 1_000_000) * Number(process.env.ANTHROPIC_PRICE_OUT ?? "0"));
      await record("anthropic", model, false, performance.now() - started, inputTokens, outputTokens, cost, 200);
      sendJson(res, 200, { content, usage: { promptTokens: inputTokens, completionTokens: outputTokens }, cost });
      return;
    }
    sendJson(res, 400, { error: "unsupported_provider" });
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    sendJson(res, 502, { error: "upstream_error", message: error instanceof Error ? error.message : String(error) });
  }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => console.log(`ai-gateway listening on http://127.0.0.1:${port}`));
}