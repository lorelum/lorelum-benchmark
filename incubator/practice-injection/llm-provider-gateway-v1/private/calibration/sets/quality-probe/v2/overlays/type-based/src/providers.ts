import type { ChatMessage, ChatResult, ProviderConfig, Usage } from "./types";

export type StreamEvent = { type: "delta"; text: string } | { type: "done"; usage: Usage };

/**
 * Unified model client contract. Business and API code depend only on this
 * interface; every provider is a small adapter behind it.
 */
export type ModelClient = {
  chat(messages: ChatMessage[]): Promise<ChatResult>;
  stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown>;
}

export type ProviderAdapter = ModelClient & { name: string };

export class ProviderUpstreamError extends Error {
  constructor(message: string, readonly code: "authentication_failed" | "rate_limited" | "upstream_timeout") {
    super(message);
  }
}

async function jsonOrThrow(response: Response): Promise<unknown> {
  if (response.status === 401) throw new ProviderUpstreamError("authentication failed", "authentication_failed");
  if (response.status === 429) throw new ProviderUpstreamError("rate limit exceeded", "rate_limited");
  if (!response.ok) throw new Error(`upstream returned ${response.status}`);
  return await response.json();
}

function normalizeUsage(raw: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }): Usage {
  return {
    promptTokens: raw.prompt_tokens ?? raw.input_tokens ?? 0,
    completionTokens: raw.completion_tokens ?? raw.output_tokens ?? 0,
  };
}

function sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return (async function* () {
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
  })();
}

function openAiCompatibleAdapter(config: ProviderConfig): ProviderAdapter {
  async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages }),
    });
    const payload = (await jsonOrThrow(response)) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { content: payload.choices?.[0]?.message?.content ?? "", usage: normalizeUsage(payload.usage ?? {}) };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}`, accept: "text/event-stream" },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
    });
    if (response.status === 401) throw new ProviderUpstreamError("authentication failed", "authentication_failed");
    if (response.status === 429) throw new ProviderUpstreamError("rate limit exceeded", "rate_limited");
    if (!response.ok || !response.body) throw new Error(`upstream returned ${response.status}`);
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    for await (const data of sseEvents(response.body)) {
      const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) yield { type: "delta", text: delta };
      if (event.usage) usage = normalizeUsage(event.usage);
    }
    yield { type: "done", usage };
  }

  return { name: config.name, chat, stream };
}

function anthropicAdapter(config: ProviderConfig): ProviderAdapter {
  async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1024 }),
    });
    const payload = (await jsonOrThrow(response)) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (payload.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    return { content: text, usage: normalizeUsage(payload.usage ?? {}) };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", accept: "text/event-stream" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1024, stream: true }),
    });
    if (response.status === 401) throw new ProviderUpstreamError("authentication failed", "authentication_failed");
    if (response.status === 429) throw new ProviderUpstreamError("rate limit exceeded", "rate_limited");
    if (!response.ok || !response.body) throw new Error(`upstream returned ${response.status}`);
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    for await (const data of sseEvents(response.body)) {
      const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; usage?: { input_tokens?: number; output_tokens?: number }; message?: { usage?: { input_tokens?: number } } };
      if (event.type === "message_start" && event.message?.usage) usage = normalizeUsage({ input_tokens: event.message.usage.input_tokens ?? 0 });
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield { type: "delta", text: event.delta.text };
      if (event.type === "message_delta" && event.usage) usage = { ...usage, completionTokens: event.usage.output_tokens ?? usage.completionTokens };
    }
    yield { type: "done", usage };
  }

  return { name: config.name, chat, stream };
}

/**
 * Provider registry. OpenAI-compatible providers (openai, deepseek, ...) share
 * the same adapter; protocol-different providers (anthropic) get their own.
 */
export function buildRegistry(providers: Record<string, ProviderConfig>): Record<string, ProviderAdapter> {
  const registry: Record<string, ProviderAdapter> = {};
  for (const name of Object.keys(providers)) {
    const config = providers[name];
    registry[name] = config.protocol === "anthropic" ? anthropicAdapter(config) : openAiCompatibleAdapter(config);
  }
  return registry;
}