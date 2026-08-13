import { ProviderUpstreamError, upstreamErrorFromStatus } from "./errors";
import type { ChatMessage, ChatResult, ProviderConfig, StreamEvent, Usage } from "./types";

export interface ModelClient {
  chat(messages: ChatMessage[]): Promise<ChatResult>;
  stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown>;
}

function normalizeUsage(raw: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }): Usage {
  return {
    promptTokens: raw.prompt_tokens ?? raw.input_tokens ?? 0,
    completionTokens: raw.completion_tokens ?? raw.output_tokens ?? 0,
  };
}

async function jsonOrThrow(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw upstreamErrorFromStatus(response.status);
  return await response.json() as Record<string, unknown>;
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
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

function openAiCompatibleAdapter(config: ProviderConfig): ModelClient {
  async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages }),
    });
    const payload = await jsonOrThrow(response);
    const choices = payload.choices as Array<{ message?: { content?: string } }> | undefined;
    return {
      content: choices?.[0]?.message?.content ?? "",
      usage: normalizeUsage(payload.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined ?? {}),
    };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}`, accept: "text/event-stream" },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
    });
    if (!response.ok) throw upstreamErrorFromStatus(response.status);
    if (!response.body) throw new ProviderUpstreamError("empty upstream stream", "upstream_error", false);
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    for await (const data of sseEvents(response.body)) {
      const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) yield { type: "delta", text: delta };
      if (event.usage) usage = normalizeUsage(event.usage);
    }
    yield { type: "done", usage };
  }

  return { chat, stream };
}

function anthropicAdapter(config: ProviderConfig): ModelClient {
  async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1024 }),
    });
    const payload = await jsonOrThrow(response);
    const content = payload.content as Array<{ type: string; text?: string }> | undefined;
    return {
      content: (content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join(""),
      usage: normalizeUsage(payload.usage as { input_tokens?: number; output_tokens?: number } | undefined ?? {}),
    };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", accept: "text/event-stream" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1024, stream: true }),
    });
    if (!response.ok) throw upstreamErrorFromStatus(response.status);
    if (!response.body) throw new ProviderUpstreamError("empty upstream stream", "upstream_error", false);
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    for await (const data of sseEvents(response.body)) {
      const event = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
        message?: { usage?: { input_tokens?: number } };
        error?: { type?: string };
      };
      if (event.type === "error") throw new ProviderUpstreamError("mid-stream upstream failure", "rate_limited", true, usage);
      if (event.type === "message_start" && event.message?.usage) {
        usage = { ...usage, promptTokens: event.message.usage.input_tokens ?? 0 };
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        yield { type: "delta", text: event.delta.text };
      }
      if (event.type === "message_delta" && event.usage) {
        usage = { ...usage, completionTokens: event.usage.output_tokens ?? usage.completionTokens };
      }
    }
    yield { type: "done", usage };
  }

  return { chat, stream };
}

function nebulaAdapter(config: ProviderConfig): ModelClient {
  async function chat(messages: ChatMessage[]): Promise<ChatResult> {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nebula-key": config.apiKey },
      body: JSON.stringify({ model: config.model, messages }),
    });
    const payload = await jsonOrThrow(response);
    const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined ?? {};
    return {
      content: typeof payload.output_text === "string" ? payload.output_text : "",
      usage: normalizeUsage(usage),
    };
  }

  async function* stream(messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nebula-key": config.apiKey, accept: "text/event-stream" },
      body: JSON.stringify({ model: config.model, messages, stream: true }),
    });
    if (!response.ok) throw upstreamErrorFromStatus(response.status);
    if (!response.body) throw new ProviderUpstreamError("empty upstream stream", "upstream_error", false);
    let usage: Usage = { promptTokens: 0, completionTokens: 0 };
    for await (const data of sseEvents(response.body)) {
      const event = JSON.parse(data) as { delta?: { text?: string }; usage?: { input_tokens?: number; output_tokens?: number } };
      if (event.delta?.text) yield { type: "delta", text: event.delta.text };
      if (event.usage) usage = normalizeUsage(event.usage);
    }
    yield { type: "done", usage };
  }

  return { chat, stream };
}

export function buildAdapter(config: ProviderConfig): ModelClient {
  if (config.protocol === "anthropic") return anthropicAdapter(config);
  if (config.protocol === "nebula") return nebulaAdapter(config);
  return openAiCompatibleAdapter(config);
}
