import type { ChatMessage, DomainErrorCode, ProviderConfig, ProviderProtocol, Usage } from "./types";

/**
 * Failure from a single upstream transmission attempt. `http` is an HTTP error
 * status returned by the upstream, `stream` is an error event observed inside
 * an SSE stream, `network` is a transport level failure (fetch threw).
 */
export type ProviderFailure =
  | { kind: "http"; status: number }
  | { kind: "network"; message: string }
  | { kind: "stream"; code: DomainErrorCode; message: string };

export type NonStreamOutcome =
  | { ok: true; content: string; usage: Usage; headersSent: false }
  | { ok: false; failure: ProviderFailure; retryable: boolean; headersSent: false };

export type StreamOutcome =
  | { ok: true; usage: Usage; headersSent: true }
  | { ok: false; failure: ProviderFailure; retryable: boolean; headersSent: boolean; usage: Usage };

export interface StreamCallbacks {
  /** Called once the upstream accepted the request and the gateway may start writing SSE to the client. */
  start(): void;
  /** Called for each text delta received from the upstream stream. */
  delta(text: string): void;
  /** Called when the upstream stream reports a terminal error event. */
  error(code: DomainErrorCode, message: string): void;
  /** Internal: merge partially reported upstream usage (e.g. anthropic splits input/output). */
  usagePartial?(usage: Partial<Usage>): void;
}

export class MidStreamError extends Error {
  constructor(readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = "MidStreamError";
  }
}

const CODE_STATUS: Record<DomainErrorCode, number> = {
  authentication_failed: 401,
  rate_limited: 429,
  upstream_timeout: 504,
  budget_exceeded: 402,
  idempotency_conflict: 409,
  unsupported_provider: 400,
  invalid_request: 422,
  upstream_error: 502,
};

/**
 * Registry is open: any `NAME_MODEL / NAME_API_KEY / NAME_BASE_URL` triple
 * registers a provider, with optional `NAME_PROTOCOL / NAME_PRICE_IN /
 * NAME_PRICE_OUT`. Names are normalized to lowercase.
 */
export function loadRegistry(): Map<string, ProviderConfig> {
  const registry = new Map<string, ProviderConfig>();
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^[A-Z][A-Z0-9_]*_MODEL$/.test(key)) continue;
    if (!value) continue;
    const prefix = key.slice(0, -"_MODEL".length);
    const apiKey = process.env[`${prefix}_API_KEY`];
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    if (apiKey === undefined || baseUrl === undefined) continue;
    const protocolRaw = process.env[`${prefix}_PROTOCOL`] ?? "openai";
    const protocol: ProviderProtocol = protocolRaw === "anthropic" || protocolRaw === "nebula" ? protocolRaw : "openai";
    registry.set(prefix.toLowerCase(), {
      name: prefix.toLowerCase(),
      protocol,
      model: value,
      apiKey,
      baseUrl,
      priceInPerMillion: parsePrice(process.env[`${prefix}_PRICE_IN`]),
      priceOutPerMillion: parsePrice(process.env[`${prefix}_PRICE_OUT`]),
    });
  }
  return registry;
}

function parsePrice(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pathForProtocol(protocol: ProviderProtocol): string {
  if (protocol === "anthropic") return "/v1/messages";
  if (protocol === "nebula") return "/v1/chat/completions";
  return "/chat/completions";
}

function buildHeaders(provider: ProviderConfig): Record<string, string> {
  if (provider.protocol === "anthropic") {
    return {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  if (provider.protocol === "nebula") {
    return { "content-type": "application/json", "x-nebula-key": provider.apiKey };
  }
  return { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` };
}

export function classifyHttpStatus(status: number): { code: DomainErrorCode; status: number; retryable: boolean } {
  if (status === 401) return { code: "authentication_failed", status: 401, retryable: false };
  if (status === 429) return { code: "rate_limited", status: 429, retryable: true };
  if (status === 504) return { code: "upstream_timeout", status: 504, retryable: true };
  if (status >= 500) return { code: "upstream_error", status: 502, retryable: true };
  return { code: "upstream_error", status: 502, retryable: false };
}

export function classifyFailure(failure: ProviderFailure): { code: DomainErrorCode; status: number } {
  if (failure.kind === "http") {
    const classified = classifyHttpStatus(failure.status);
    return { code: classified.code, status: classified.status };
  }
  if (failure.kind === "stream") return { code: failure.code, status: CODE_STATUS[failure.code] };
  // Transport level failure: treat as an upstream timeout.
  return { code: "upstream_timeout", status: 504 };
}

function mapAnthropicErrorType(type: string): DomainErrorCode {
  switch (type) {
    case "overloaded_error":
    case "rate_limit_error":
      return "rate_limited";
    case "authentication_error":
      return "authentication_failed";
    case "invalid_request_error":
      return "invalid_request";
    default:
      return "upstream_error";
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Non-streaming chat completion call, one provider protocol at a time. */
export async function callNonStream(provider: ProviderConfig, messages: ChatMessage[], maxTokens: number): Promise<NonStreamOutcome> {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}${pathForProtocol(provider.protocol)}`, {
      method: "POST",
      headers: buildHeaders(provider),
      body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, stream: false }),
    });
  } catch (error) {
    return { ok: false, failure: { kind: "network", message: String(error) }, retryable: true, headersSent: false };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: { kind: "http", status: response.status },
      retryable: classifyHttpStatus(response.status).retryable,
      headersSent: false,
    };
  }
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return parseNonStream(provider.protocol, payload);
  } catch (error) {
    return { ok: false, failure: { kind: "network", message: String(error) }, retryable: true, headersSent: false };
  }
}

function parseNonStream(protocol: ProviderProtocol, payload: Record<string, unknown>): NonStreamOutcome {
  if (protocol === "openai") {
    const choices = payload.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const content = typeof choices?.[0]?.message?.content === "string" ? choices[0].message.content : "";
    const usage = payload.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
    return {
      ok: true,
      content,
      usage: { promptTokens: toNumber(usage?.prompt_tokens), completionTokens: toNumber(usage?.completion_tokens) },
      headersSent: false,
    };
  }
  if (protocol === "anthropic") {
    const blocks = Array.isArray(payload.content) ? (payload.content as Array<{ type?: unknown; text?: unknown }>) : [];
    const content = blocks.map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : "")).join("");
    const usage = payload.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
    return {
      ok: true,
      content,
      usage: { promptTokens: toNumber(usage?.input_tokens), completionTokens: toNumber(usage?.output_tokens) },
      headersSent: false,
    };
  }
  // nebula: fake "OpenAI compatible" — different auth header, path and field names.
  const content = typeof payload.output_text === "string" ? payload.output_text : "";
  const usage = payload.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
  return {
    ok: true,
    content,
    usage: { promptTokens: toNumber(usage?.input_tokens), completionTokens: toNumber(usage?.output_tokens) },
    headersSent: false,
  };
}

async function* sseLines(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      yield line;
    }
  }
  if (buffer.length > 0) yield buffer;
}

function consumeStreamEvent(protocol: ProviderProtocol, event: Record<string, unknown>, callbacks: StreamCallbacks): void {
  if (protocol === "openai") {
    const choices = event.choices as Array<{ delta?: { content?: unknown } }> | undefined;
    const delta = choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) callbacks.delta(delta);
    const usage = event.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
    if (usage !== undefined) {
      callbacks.usagePartial?.({ promptTokens: toNumber(usage.prompt_tokens), completionTokens: toNumber(usage.completion_tokens) });
    }
    return;
  }
  if (protocol === "nebula") {
    const delta = (event.delta as { text?: unknown } | undefined)?.text;
    if (typeof delta === "string" && delta.length > 0) callbacks.delta(delta);
    const usage = event.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
    if (usage !== undefined) {
      callbacks.usagePartial?.({ promptTokens: toNumber(usage.input_tokens), completionTokens: toNumber(usage.output_tokens) });
    }
    return;
  }
  // anthropic
  const type = event.type;
  if (type === "message_start") {
    const message = (event.message ?? {}) as { usage?: { input_tokens?: unknown; output_tokens?: unknown } };
    callbacks.usagePartial?.({
      promptTokens: toNumber(message.usage?.input_tokens),
      completionTokens: toNumber(message.usage?.output_tokens),
    });
  } else if (type === "content_block_delta") {
    const delta = event.delta as { type?: unknown; text?: unknown } | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) callbacks.delta(delta.text);
  } else if (type === "message_delta") {
    const usage = (event.usage ?? {}) as { output_tokens?: unknown };
    callbacks.usagePartial?.({ completionTokens: toNumber(usage.output_tokens) });
  } else if (type === "error") {
    const err = (event.error ?? {}) as { type?: unknown };
    const code = mapAnthropicErrorType(String(err.type ?? "api_error"));
    callbacks.error(code, String(err.type ?? ""));
  }
}

/** Streaming chat completion call. Deltas are delivered via `callbacks`. */
export async function callStream(provider: ProviderConfig, messages: ChatMessage[], maxTokens: number, callbacks: StreamCallbacks): Promise<StreamOutcome> {
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}${pathForProtocol(provider.protocol)}`, {
      method: "POST",
      headers: { ...buildHeaders(provider), accept: "text/event-stream" },
      body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, stream: true }),
    });
  } catch (error) {
    return { ok: false, failure: { kind: "network", message: String(error) }, retryable: true, headersSent: false, usage };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: { kind: "http", status: response.status },
      retryable: classifyHttpStatus(response.status).retryable,
      headersSent: false,
      usage,
    };
  }
  callbacks.start();
  const mergedCallbacks: StreamCallbacks = {
    start: callbacks.start,
    delta: callbacks.delta,
    error: (code, message) => callbacks.error(code, message),
    usagePartial(partial) {
      if (partial.promptTokens !== undefined) usage.promptTokens = partial.promptTokens;
      if (partial.completionTokens !== undefined) usage.completionTokens = partial.completionTokens;
    },
  };
  try {
    for await (const line of sseLines(response)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }
      consumeStreamEvent(provider.protocol, event, mergedCallbacks);
    }
    return { ok: true, usage, headersSent: true };
  } catch (error) {
    if (error instanceof MidStreamError) {
      return { ok: false, failure: { kind: "stream", code: error.code, message: error.message }, retryable: false, headersSent: true, usage };
    }
    return { ok: false, failure: { kind: "network", message: String(error) }, retryable: false, headersSent: true, usage };
  }
}
