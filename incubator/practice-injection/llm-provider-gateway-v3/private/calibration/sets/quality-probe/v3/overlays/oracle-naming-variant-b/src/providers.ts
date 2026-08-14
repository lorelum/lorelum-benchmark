import type { ChatMessage, ProviderConfig, ProviderProtocol, Usage } from "./types";

export type ChatCall = { messages: ChatMessage[]; max_tokens?: number };

export type ProviderErrorCode = "authentication_failed" | "rate_limited" | "upstream_timeout" | "upstream_error";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  /** Usage reported by the upstream before a mid-stream failure (never fabricated). */
  partialUsage?: Usage;

  constructor(code: ProviderErrorCode, httpStatus: number, retryable: boolean, message?: string) {
    super(message ?? code);
    this.name = "ProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export type StreamSink = { onDelta: (text: string) => void };

export type ProviderResult = { content: string; usage: Usage };

/**
 * Open registry: any NAME_MODEL / NAME_API_KEY / NAME_BASE_URL / NAME_PRICE_IN /
 * NAME_PRICE_OUT set of env vars registers provider "name". Protocol defaults
 * to "openai" but the wire contract is driven by <NAME>_PROTOCOL.
 */
export function readProviderRegistry(): Map<string, ProviderConfig> {
  const names = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const match = /^([A-Z][A-Z0-9_]*)_MODEL$/.exec(key);
    if (match) names.add(match[1]);
  }
  const registry = new Map<string, ProviderConfig>();
  for (const name of names) {
    const model = process.env[`${name}_MODEL`];
    const apiKey = process.env[`${name}_API_KEY`];
    const baseUrl = process.env[`${name}_BASE_URL`];
    const priceIn = process.env[`${name}_PRICE_IN`];
    const priceOut = process.env[`${name}_PRICE_OUT`];
    if (!model || !apiKey || !baseUrl || priceIn === undefined || priceOut === undefined) continue;
    const protocol = (process.env[`${name}_PROTOCOL`] ?? "openai") as ProviderProtocol;
    registry.set(name.toLowerCase(), {
      name: name.toLowerCase(),
      protocol,
      model,
      apiKey,
      baseUrl,
      priceInPerMillion: Number(priceIn),
      priceOutPerMillion: Number(priceOut),
    });
  }
  return registry;
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ProviderError("upstream_timeout", 504, true, "upstream request timed out");
  }
  return new ProviderError("upstream_error", 502, true, error instanceof Error ? error.message : String(error));
}

function mapHttpError(status: number): ProviderError {
  if (status === 401) return new ProviderError("authentication_failed", 401, false, `upstream rejected credentials (${status})`);
  if (status === 429) return new ProviderError("rate_limited", 429, true, `upstream rate limited (${status})`);
  if (status === 504) return new ProviderError("upstream_timeout", 504, true, `upstream timed out (${status})`);
  if (status >= 500) return new ProviderError("upstream_error", status, true, `upstream error (${status})`);
  return new ProviderError("upstream_error", status, false, `upstream error (${status})`);
}

function makeStreamError(type: string, usage: Usage): ProviderError {
  let code: ProviderErrorCode;
  let status: number;
  if (/overload|rate|limit/i.test(type)) {
    code = "rate_limited";
    status = 429;
  } else if (/timeout/i.test(type)) {
    code = "upstream_timeout";
    status = 504;
  } else {
    code = "upstream_error";
    status = 502;
  }
  const error = new ProviderError(code, status, false, `upstream stream error: ${type}`);
  error.partialUsage = { ...usage };
  return error;
}

type WireRequest = { url: string; init: RequestInit };

function buildWireRequest(provider: ProviderConfig, call: ChatCall, stream: boolean): WireRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const body: Record<string, unknown> = { model: provider.model, messages: call.messages };
  let url: string;

  if (provider.protocol === "anthropic") {
    url = `${provider.baseUrl}/v1/messages`;
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body.max_tokens = call.max_tokens ?? 1024;
  } else if (provider.protocol === "nebula") {
    // Nebula claims OpenAI compatibility but uses its own auth header and wire
    // field names; implement its real contract instead of reusing the openai adapter.
    url = `${provider.baseUrl}/v1/chat/completions`;
    headers["x-nebula-key"] = provider.apiKey;
  } else {
    url = `${provider.baseUrl}/chat/completions`;
    headers.authorization = `Bearer ${provider.apiKey}`;
    if (call.max_tokens !== undefined) body.max_tokens = call.max_tokens;
  }

  if (stream) {
    body.stream = true;
    headers.accept = "text/event-stream";
  }
  return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
}

async function executeFetch(provider: ProviderConfig, call: ChatCall, stream: boolean, signal?: AbortSignal): Promise<Response> {
  const wire = buildWireRequest(provider, call, stream);
  let response: Response;
  try {
    response = await fetch(wire.url, { ...wire.init, signal });
  } catch (error) {
    throw toProviderError(error);
  }
  if (!response.ok) throw mapHttpError(response.status);
  return response;
}

function parseNonStreamResponse(provider: ProviderConfig, payload: Record<string, any>): ProviderResult {
  if (provider.protocol === "anthropic") {
    const blocks = Array.isArray(payload.content) ? payload.content : [];
    const content = blocks.filter((block: any) => block?.type === "text").map((block: any) => block.text ?? "").join("");
    const usage = payload.usage ?? {};
    return { content, usage: { promptTokens: usage.input_tokens ?? 0, completionTokens: usage.output_tokens ?? 0 } };
  }
  if (provider.protocol === "nebula") {
    const usage = payload.usage ?? {};
    return {
      content: typeof payload.output_text === "string" ? payload.output_text : "",
      usage: { promptTokens: usage.input_tokens ?? 0, completionTokens: usage.output_tokens ?? 0 },
    };
  }
  const usage = payload.usage ?? {};
  return {
    content: payload.choices?.[0]?.message?.content ?? "",
    usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 },
  };
}

export async function callProvider(provider: ProviderConfig, call: ChatCall, signal?: AbortSignal): Promise<ProviderResult> {
  const response = await executeFetch(provider, call, false, signal);
  let payload: Record<string, any>;
  try {
    payload = (await response.json()) as Record<string, any>;
  } catch {
    throw new ProviderError("upstream_error", 502, true, "upstream returned a non-JSON response");
  }
  return parseNonStreamResponse(provider, payload);
}

/** Establish an upstream SSE stream. Fails (typed) before any bytes are sent downstream. */
export async function openProviderStream(provider: ProviderConfig, call: ChatCall, signal?: AbortSignal): Promise<Response> {
  return executeFetch(provider, call, true, signal);
}

async function* readSSEData(response: Response): AsyncGenerator<string, void, void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator: number;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      for (const raw of block.split("\n")) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) yield data;
        }
      }
    }
  }
  for (const raw of buffer.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data) yield data;
    }
  }
}

/**
 * Consume an established SSE stream, forwarding deltas through the sink and
 * accumulating only usage the upstream actually reported. Throws a typed
 * ProviderError with partialUsage attached if the upstream errors mid-stream.
 */
export async function consumeProviderStream(provider: ProviderConfig, response: Response, sink: StreamSink): Promise<{ usage: Usage }> {
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  for await (const data of readSSEData(response)) {
    if (data === "[DONE]") break;
    let event: Record<string, any>;
    try {
      event = JSON.parse(data) as Record<string, any>;
    } catch {
      continue;
    }
    if (provider.protocol === "anthropic") {
      if (event.type === "message_start") {
        const reported = event.message?.usage;
        if (typeof reported?.input_tokens === "number") usage.promptTokens = reported.input_tokens;
      } else if (event.type === "content_block_delta") {
        if (typeof event.delta?.text === "string") sink.onDelta(event.delta.text);
      } else if (event.type === "message_delta") {
        const reported = event.usage;
        if (typeof reported?.output_tokens === "number") usage.completionTokens = Math.max(usage.completionTokens, reported.output_tokens);
      } else if (event.type === "error") {
        throw makeStreamError(typeof event.error?.type === "string" ? event.error.type : "", usage);
      }
    } else if (provider.protocol === "nebula") {
      if (typeof event.delta?.text === "string") sink.onDelta(event.delta.text);
      if (event.usage) {
        if (typeof event.usage.input_tokens === "number") usage.promptTokens = event.usage.input_tokens;
        if (typeof event.usage.output_tokens === "number") usage.completionTokens = event.usage.output_tokens;
      }
    } else {
      if (typeof event.choices?.[0]?.delta?.content === "string") sink.onDelta(event.choices[0].delta.content);
      if (event.usage) {
        if (typeof event.usage.prompt_tokens === "number") usage.promptTokens = event.usage.prompt_tokens;
        if (typeof event.usage.completion_tokens === "number") usage.completionTokens = event.usage.completion_tokens;
      }
    }
  }
  return { usage };
}
