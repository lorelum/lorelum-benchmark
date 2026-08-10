import type { ChatMessage, ProviderConfig, Usage } from "../types";
import type { GatewayClient, GatewayResult, StreamSignal, TokenCounts } from "./client";

export class VendorError extends Error {
  constructor(message: string, readonly label: "authentication_failed" | "rate_limited" | "upstream_timeout") {
    super(message);
  }
}

async function parseOrThrow(response: Response): Promise<unknown> {
  if (response.status === 401) throw new VendorError("bad key", "authentication_failed");
  if (response.status === 429) throw new VendorError("throttled", "rate_limited");
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  return await response.json();
}

function toTokens(raw: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }): TokenCounts {
  return { in: raw.prompt_tokens ?? raw.input_tokens ?? 0, out: raw.completion_tokens ?? raw.output_tokens ?? 0 };
}

async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
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
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data && data !== "[DONE]") yield data;
      }
    }
  }
}

export function makeOpenAiLike(cfg: ProviderConfig): GatewayClient {
  async function complete(messages: ChatMessage[]): Promise<GatewayResult> {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages }),
    });
    const payload = (await parseOrThrow(response)) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: payload.choices?.[0]?.message?.content ?? "", tokens: toTokens(payload.usage ?? {}) };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamSignal, void, unknown> {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}`, accept: "text/event-stream" },
      body: JSON.stringify({ model: cfg.model, messages, stream: true }),
    });
    if (response.status === 401) throw new VendorError("bad key", "authentication_failed");
    if (response.status === 429) throw new VendorError("throttled", "rate_limited");
    if (!response.ok || !response.body) throw new Error(`upstream ${response.status}`);
    let tokens: TokenCounts = { in: 0, out: 0 };
    for await (const data of sse(response.body)) {
      const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const piece = event.choices?.[0]?.delta?.content;
      if (piece) yield { kind: "text", value: piece };
      if (event.usage) tokens = toTokens(event.usage);
    }
    yield { kind: "finish", tokens };
  }

  return { complete, stream };
}

export function makeClaude(cfg: ProviderConfig): GatewayClient {
  async function complete(messages: ChatMessage[]): Promise<GatewayResult> {
    const response = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: 1024 }),
    });
    const payload = (await parseOrThrow(response)) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (payload.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    return { text, tokens: toTokens(payload.usage ?? {}) };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamSignal, void, unknown> {
    const response = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", accept: "text/event-stream" },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: 1024, stream: true }),
    });
    if (response.status === 401) throw new VendorError("bad key", "authentication_failed");
    if (response.status === 429) throw new VendorError("throttled", "rate_limited");
    if (!response.ok || !response.body) throw new Error(`upstream ${response.status}`);
    let tokens: TokenCounts = { in: 0, out: 0 };
    for await (const data of sse(response.body)) {
      const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; usage?: { input_tokens?: number; output_tokens?: number }; message?: { usage?: { input_tokens?: number } } };
      if (event.type === "message_start" && event.message?.usage) tokens = { ...tokens, in: event.message.usage.input_tokens ?? 0 };
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield { kind: "text", value: event.delta.text };
      if (event.type === "message_delta" && event.usage) tokens = { ...tokens, out: event.usage.output_tokens ?? tokens.out };
    }
    yield { kind: "finish", tokens };
  }

  return { complete, stream };
}

export function assemble(catalog: Record<string, ProviderConfig>): Record<string, GatewayClient> {
  const clients: Record<string, GatewayClient> = {};
  for (const name of Object.keys(catalog)) {
    const cfg = catalog[name];
    clients[name] = cfg.protocol === "anthropic" ? makeClaude(cfg) : makeOpenAiLike(cfg);
  }
  return clients;
}