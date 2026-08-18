import type { ChatMessage, DomainErrorCode, ProviderConfig, ProviderProtocol, StreamEvent, Usage } from "./types";

/**
 * Uniform client contract. The API layer only depends on this shape; each
 * provider adapter is responsible for its own wire protocol and normalizes
 * response text and token usage into the same form.
 */
export type ProviderRequest = {
  messages: ChatMessage[];
  maxTokens: number;
  stream: boolean;
};

export type ProviderResponse =
  | { stream: false; content: string; usage: Usage }
  | { stream: true; events: AsyncIterable<StreamEvent> };

export interface ChatProvider {
  readonly config: ProviderConfig;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
}

/**
 * Typed domain error. `retryable` decides whether the boundary policy may
 * retry the same provider or fall back to another one. `usage`, when set,
 * carries the usage the upstream already reported before failing (used for
 * partial-billing of interrupted streams).
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly usage?: Usage;

  constructor(code: DomainErrorCode, status: number, options: { retryable?: boolean; usage?: Usage } = {}) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? (status === 429 || status === 408 || status >= 500);
    this.usage = options.usage;
  }
}

export function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new DomainError("upstream_timeout", 504);
  }
  return new DomainError("upstream_error", 502);
}

/** Translate an upstream HTTP status into a domain error (raw payloads are never forwarded). */
export function mapHttpStatus(status: number): DomainError {
  if (status === 401 || status === 403) return new DomainError("authentication_failed", 401, { retryable: false });
  if (status === 429) return new DomainError("rate_limited", 429);
  if (status === 408 || status === 504) return new DomainError("upstream_timeout", 504);
  return new DomainError("upstream_error", 502, { retryable: status >= 500 });
}

/**
 * Config-driven registry. Any NAME_MODEL / NAME_API_KEY / NAME_BASE_URL /
 * NAME_PRICE_IN / NAME_PRICE_OUT group registers a provider; NAME_PROTOCOL
 * is optional and defaults to "openai".
 */
export function loadRegistry(): Map<string, ProviderConfig> {
  const registry = new Map<string, ProviderConfig>();
  const env = process.env;
  for (const key of Object.keys(env)) {
    const match = /^([A-Z0-9_]+)_MODEL$/.exec(key);
    if (!match) continue;
    const prefix = match[1];
    const name = prefix.toLowerCase();
    const model = env[key];
    const apiKey = env[`${prefix}_API_KEY`];
    const baseUrl = env[`${prefix}_BASE_URL`];
    const priceIn = Number(env[`${prefix}_PRICE_IN`]);
    const priceOut = Number(env[`${prefix}_PRICE_OUT`]);
    if (!model || apiKey === undefined || baseUrl === undefined || !Number.isFinite(priceIn) || !Number.isFinite(priceOut)) {
      continue;
    }
    const protocol = (env[`${prefix}_PROTOCOL`] ?? "openai") as ProviderProtocol;
    registry.set(name, { name, protocol, model, apiKey, baseUrl, priceInPerMillion: priceIn, priceOutPerMillion: priceOut });
  }
  return registry;
}

export function createProvider(config: ProviderConfig | undefined): ChatProvider {
  if (!config) throw new DomainError("unsupported_provider", 400);
  switch (config.protocol) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "nebula":
      return new NebulaProvider(config);
    case "openai":
      return new OpenAIChatProvider(config);
    default:
      throw new DomainError("unsupported_provider", 400);
  }
}

/** Minimal line-based SSE reader yielding the payload of every `data:` line. */
async function* sseData(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trimStart();
          if (data) yield data;
        }
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trimStart();
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new DomainError("upstream_error", 502);
  }
}

class OpenAIChatProvider implements ChatProvider {
  readonly config: ProviderConfig;
  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const { baseUrl, apiKey, model } = this.config;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: request.messages, max_tokens: request.maxTokens, stream: request.stream }),
    });
    if (!response.ok) throw mapHttpStatus(response.status);
    if (!request.stream) {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        stream: false,
        content: payload.choices?.[0]?.message?.content ?? "",
        usage: { promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 },
      };
    }
    return { stream: true, events: this.streamEvents(response) };
  }

  private async *streamEvents(response: Response): AsyncGenerator<StreamEvent> {
    for await (const data of sseData(response.body)) {
      if (data === "[DONE]") break;
      const payload = parseSseEvent(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const delta = payload.choices?.[0]?.delta?.content;
      if (typeof delta === "string") yield { type: "delta", text: delta };
      if (payload.usage) {
        yield { type: "done", usage: { promptTokens: payload.usage.prompt_tokens ?? 0, completionTokens: payload.usage.completion_tokens ?? 0 } };
      }
    }
  }
}

function mapAnthropicError(error: { type?: string } | undefined, usage: Usage): DomainError {
  if (error?.type === "overloaded_error") return new DomainError("rate_limited", 429, { usage });
  return new DomainError("upstream_error", 502, { usage });
}

class AnthropicProvider implements ChatProvider {
  readonly config: ProviderConfig;
  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const { baseUrl, apiKey, model } = this.config;
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, messages: request.messages, max_tokens: request.maxTokens, stream: request.stream }),
    });
    if (!response.ok) throw mapHttpStatus(response.status);
    if (!request.stream) {
      const payload = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const content = (payload.content ?? []).map((block) => block.text ?? "").join("");
      return {
        stream: false,
        content,
        usage: { promptTokens: payload.usage?.input_tokens ?? 0, completionTokens: payload.usage?.output_tokens ?? 0 },
      };
    }
    return { stream: true, events: this.streamEvents(response) };
  }

  private async *streamEvents(response: Response): AsyncGenerator<StreamEvent> {
    let promptTokens = 0;
    let completionTokens = 0;
    for await (const data of sseData(response.body)) {
      const payload = parseSseEvent(data) as {
        type?: string;
        message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        delta?: { type?: string; text?: string };
        usage?: { output_tokens?: number };
        error?: { type?: string };
      };
      switch (payload.type) {
        case "message_start":
          promptTokens = payload.message?.usage?.input_tokens ?? promptTokens;
          break;
        case "content_block_delta": {
          const text = payload.delta?.text;
          if (typeof text === "string") yield { type: "delta", text };
          break;
        }
        case "message_delta":
          completionTokens = payload.usage?.output_tokens ?? completionTokens;
          break;
        case "message_stop":
          yield { type: "done", usage: { promptTokens, completionTokens } };
          break;
        case "error":
          throw mapAnthropicError(payload.error, { promptTokens, completionTokens });
      }
    }
    // Stream ended without a message_stop: report only what the upstream gave us.
    if (promptTokens > 0 || completionTokens > 0) {
      yield { type: "done", usage: { promptTokens, completionTokens } };
    }
  }
}

/**
 * Nebula claims OpenAI compatibility but its wire contract differs: the auth
 * header is x-nebula-key, responses carry output_text and usage uses
 * input_tokens/output_tokens, and stream events use delta.text. It must be
 * implemented against its actual protocol, not the OpenAI adapter.
 */
class NebulaProvider implements ChatProvider {
  readonly config: ProviderConfig;
  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const { baseUrl, apiKey, model } = this.config;
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nebula-key": apiKey },
      body: JSON.stringify({ model, messages: request.messages, max_tokens: request.maxTokens, stream: request.stream }),
    });
    if (!response.ok) throw mapHttpStatus(response.status);
    if (!request.stream) {
      const payload = (await response.json()) as {
        output_text?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        stream: false,
        content: payload.output_text ?? "",
        usage: { promptTokens: payload.usage?.input_tokens ?? 0, completionTokens: payload.usage?.output_tokens ?? 0 },
      };
    }
    return { stream: true, events: this.streamEvents(response) };
  }

  private async *streamEvents(response: Response): AsyncGenerator<StreamEvent> {
    for await (const data of sseData(response.body)) {
      if (data === "[DONE]") break;
      const payload = parseSseEvent(data) as {
        delta?: { text?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = payload.delta?.text;
      if (typeof text === "string") yield { type: "delta", text };
      if (payload.usage) {
        yield {
          type: "done",
          usage: { promptTokens: payload.usage.input_tokens ?? 0, completionTokens: payload.usage.output_tokens ?? 0 },
        };
      }
    }
  }
}
