import type { ChatRequest, ChatResult, DomainErrorCode, ProviderConfig, ProviderProtocol, Usage } from "./types";

/** Normalized events produced by a provider wire adapter for streaming requests. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: Usage }
  | { type: "error"; code: DomainErrorCode; usage: Usage };

/**
 * Unified provider contract. The interface layer only depends on this shape;
 * every provider translates its own wire protocol into it.
 */
export type ProviderAdapter = {
  chat(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): AsyncGenerator<StreamEvent>;
};

export class UpstreamError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  constructor(code: DomainErrorCode, status: number, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.code = code;
    this.status = status;
  }
}

/** Map an upstream HTTP status onto the domain error taxonomy. */
export function mapHttpStatus(status: number): DomainErrorCode {
  if (status === 401) return "authentication_failed";
  if (status === 429) return "rate_limited";
  if (status === 504) return "upstream_timeout";
  return "upstream_error";
}

const PROTOCOLS: readonly ProviderProtocol[] = ["openai", "anthropic", "nebula"];

/**
 * Open registry: any `NAME_MODEL` together with `NAME_API_KEY` / `NAME_BASE_URL`
 * (plus optional `NAME_PROTOCOL`, `NAME_PRICE_IN`, `NAME_PRICE_OUT`) registers a
 * provider. The interface layer never branches on provider names.
 */
export function buildRegistry(): Map<string, ProviderConfig> {
  const registry = new Map<string, ProviderConfig>();
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^([A-Z0-9_]+)_MODEL$/.exec(key);
    if (!match) continue;
    const prefix = match[1];
    const name = prefix.toLowerCase();
    const apiKey = process.env[`${prefix}_API_KEY`];
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    if (!value || !apiKey || !baseUrl) continue;
    const protocolRaw = process.env[`${prefix}_PROTOCOL`] ?? "openai";
    const protocol: ProviderProtocol = (PROTOCOLS as readonly string[]).includes(protocolRaw)
      ? (protocolRaw as ProviderProtocol)
      : "openai";
    registry.set(name, {
      name,
      protocol,
      model: value,
      apiKey,
      baseUrl,
      priceInPerMillion: Number(process.env[`${prefix}_PRICE_IN`] ?? 0) || 0,
      priceOutPerMillion: Number(process.env[`${prefix}_PRICE_OUT`] ?? 0) || 0,
    });
  }
  return registry;
}

export function getAdapter(config: ProviderConfig): ProviderAdapter {
  switch (config.protocol) {
    case "anthropic":
      return createAnthropicAdapter(config);
    case "nebula":
      return createNebulaAdapter(config);
    default:
      return createOpenAIAdapter(config);
  }
}

function normalizeUsage(payload: unknown): Usage {
  const usage = payload as Record<string, unknown> | undefined;
  return {
    promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  };
}

/** Nebula and Anthropic both report input_tokens / output_tokens. */
function normalizeTokenUsage(payload: unknown): Usage {
  const usage = payload as Record<string, unknown> | undefined;
  return {
    promptTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : 0,
    completionTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : 0,
  };
}

function mapAnthropicErrorType(type: string): DomainErrorCode {
  if (type === "overloaded_error" || type === "rate_limit_error") return "rate_limited";
  if (type === "authentication_error") return "authentication_failed";
  if (type === "timeout_error") return "upstream_timeout";
  return "upstream_error";
}

/** Read an SSE stream as a sequence of `data:` payload strings. */
async function* sseData(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data.length > 0) yield data;
      }
    }
  }
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (data.length > 0) yield data;
  }
}

async function upstreamFetch(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS ?? 30_000) || 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI-compatible wire protocol (OpenAI, DeepSeek, ...). */
function createOpenAIAdapter(config: ProviderConfig): ProviderAdapter {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers = { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` };
  const buildBody = (request: ChatRequest, stream: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = { model: config.model, messages: request.messages };
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
    if (stream) body.stream = true;
    return body;
  };
  return {
    async chat(request) {
      const response = await upstreamFetch(url, { method: "POST", headers, body: JSON.stringify(buildBody(request, false)) });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
      return { content: payload.choices?.[0]?.message?.content ?? "", usage: normalizeUsage(payload.usage) };
    },
    async *stream(request) {
      const response = await upstreamFetch(url, {
        method: "POST",
        headers: { ...headers, accept: "text/event-stream" },
        body: JSON.stringify(buildBody(request, true)),
      });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      for await (const data of sseData(response)) {
        if (data === "[DONE]") {
          yield { type: "done", usage };
          return;
        }
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        const choices = event.choices as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
        if (typeof delta?.content === "string") yield { type: "delta", text: delta.content };
        if (event.usage) usage = normalizeUsage(event.usage);
      }
      yield { type: "done", usage };
    },
  };
}

/** Anthropic wire protocol: /v1/messages with x-api-key + anthropic-version. */
function createAnthropicAdapter(config: ProviderConfig): ProviderAdapter {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const headers = {
    "content-type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
  };
  const buildBody = (request: ChatRequest, stream: boolean): Record<string, unknown> => ({
    model: config.model,
    messages: request.messages,
    max_tokens: request.max_tokens ?? 1024,
    ...(stream ? { stream: true } : {}),
  });
  return {
    async chat(request) {
      const response = await upstreamFetch(url, { method: "POST", headers, body: JSON.stringify(buildBody(request, false)) });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      const payload = (await response.json()) as { content?: Array<{ text?: string }>; usage?: unknown };
      const content = (payload.content ?? []).map((block) => block.text ?? "").join("");
      return { content, usage: normalizeTokenUsage(payload.usage) };
    },
    async *stream(request) {
      const response = await upstreamFetch(url, {
        method: "POST",
        headers: { ...headers, accept: "text/event-stream" },
        body: JSON.stringify(buildBody(request, true)),
      });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      for await (const data of sseData(response)) {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        switch (event.type) {
          case "message_start": {
            const message = event.message as Record<string, unknown> | undefined;
            const usagePayload = message?.usage as Record<string, unknown> | undefined;
            if (usagePayload && typeof usagePayload.input_tokens === "number") {
              usage = { ...usage, promptTokens: usagePayload.input_tokens };
            }
            break;
          }
          case "content_block_delta": {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (typeof delta?.text === "string") yield { type: "delta", text: delta.text };
            break;
          }
          case "message_delta": {
            const usagePayload = event.usage as Record<string, unknown> | undefined;
            if (usagePayload && typeof usagePayload.output_tokens === "number") {
              usage = { ...usage, completionTokens: usagePayload.output_tokens };
            }
            break;
          }
          case "message_stop": {
            yield { type: "done", usage };
            return;
          }
          case "error": {
            const error = event.error as Record<string, unknown> | undefined;
            yield { type: "error", code: mapAnthropicErrorType(typeof error?.type === "string" ? error.type : ""), usage };
            return;
          }
        }
      }
      yield { type: "done", usage };
    },
  };
}

/**
 * Nebula: claims OpenAI compatibility but the wire contract differs — it uses
 * `x-nebula-key` auth, `output_text` for replies, `delta.text` for stream
 * deltas and `input_tokens`/`output_tokens` for usage. Implemented separately
 * from the OpenAI-compatible adapter.
 */
function createNebulaAdapter(config: ProviderConfig): ProviderAdapter {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const headers = { "content-type": "application/json", "x-nebula-key": config.apiKey };
  const buildBody = (request: ChatRequest, stream: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = { model: config.model, messages: request.messages };
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
    if (stream) body.stream = true;
    return body;
  };
  return {
    async chat(request) {
      const response = await upstreamFetch(url, { method: "POST", headers, body: JSON.stringify(buildBody(request, false)) });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      const payload = (await response.json()) as { output_text?: string; usage?: unknown };
      return { content: payload.output_text ?? "", usage: normalizeTokenUsage(payload.usage) };
    },
    async *stream(request) {
      const response = await upstreamFetch(url, {
        method: "POST",
        headers: { ...headers, accept: "text/event-stream" },
        body: JSON.stringify(buildBody(request, true)),
      });
      if (!response.ok) throw new UpstreamError(mapHttpStatus(response.status), response.status, `upstream returned ${response.status}`);
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      for await (const data of sseData(response)) {
        if (data === "[DONE]") {
          yield { type: "done", usage };
          return;
        }
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        const delta = event.delta as Record<string, unknown> | undefined;
        if (typeof delta?.text === "string") yield { type: "delta", text: delta.text };
        if (event.usage) usage = normalizeTokenUsage(event.usage);
      }
      yield { type: "done", usage };
    },
  };
}
