import type { ChatRequest, ProviderConfig, StreamEvent, Usage } from "./types";
import { DomainError, errorFromStreamErrorType, errorFromUpstreamStatus } from "./errors";

export type NormalizedResult =
  | { stream: false; content: string; usage: Usage }
  | { stream: true; events: AsyncGenerator<StreamEvent> };

export function callProvider(
  provider: ProviderConfig,
  request: ChatRequest,
  wantStream: boolean,
): Promise<NormalizedResult> {
  switch (provider.protocol) {
    case "anthropic":
      return callAnthropic(provider, request, wantStream);
    case "nebula":
      return callNebula(provider, request, wantStream);
    default:
      return callOpenAI(provider, request, wantStream);
  }
}

async function fetchUpstream(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS ?? 60_000) || 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DomainError("upstream_timeout", 504, "upstream request timed out");
    }
    throw new DomainError("upstream_error", 502, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

/** Yield the payload of every `data:` line of an SSE response body. */
async function* sseData(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) yield data;
        }
      }
    }
    const tail = buffer.replace(/\r$/, "");
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data) yield data;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // stream already closed
    }
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible wire protocol                                     */
/* ------------------------------------------------------------------ */

async function callOpenAI(
  provider: ProviderConfig,
  request: ChatRequest,
  wantStream: boolean,
): Promise<NormalizedResult> {
  const response = await fetchUpstream(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
      ...(wantStream ? { accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: request.messages,
      ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
      ...(wantStream ? { stream: true } : {}),
    }),
  });
  if (!response.ok) throw errorFromUpstreamStatus(response.status);
  if (!wantStream) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      stream: false,
      content: payload.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: Number(payload.usage?.prompt_tokens ?? 0),
        completionTokens: Number(payload.usage?.completion_tokens ?? 0),
      },
    };
  }
  return { stream: true, events: streamOpenAI(response.body) };
}

async function* streamOpenAI(body: ReadableStream<Uint8Array> | null): AsyncGenerator<StreamEvent> {
  let usage: Usage | undefined;
  for await (const data of sseData(body)) {
    if (data === "[DONE]") break;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.error) throw errorFromStreamErrorType((event.error as { type?: string })?.type);
    const choices = event.choices as Array<{ delta?: { content?: string } }> | undefined;
    const delta = choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) yield { type: "delta", text: delta };
    const usageEvent = event.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (usageEvent) {
      usage = {
        promptTokens: Number(usageEvent.prompt_tokens ?? 0),
        completionTokens: Number(usageEvent.completion_tokens ?? 0),
      };
    }
  }
  yield { type: "done", usage: usage ?? { promptTokens: 0, completionTokens: 0 } };
}

/* ------------------------------------------------------------------ */
/* Anthropic wire protocol                                             */
/* ------------------------------------------------------------------ */

async function callAnthropic(
  provider: ProviderConfig,
  request: ChatRequest,
  wantStream: boolean,
): Promise<NormalizedResult> {
  const response = await fetchUpstream(`${provider.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      ...(wantStream ? { accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: request.messages,
      max_tokens: request.max_tokens ?? 1024,
      ...(wantStream ? { stream: true } : {}),
    }),
  });
  if (!response.ok) throw errorFromUpstreamStatus(response.status);
  if (!wantStream) {
    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return {
      stream: false,
      content: text,
      usage: {
        promptTokens: Number(payload.usage?.input_tokens ?? 0),
        completionTokens: Number(payload.usage?.output_tokens ?? 0),
      },
    };
  }
  return { stream: true, events: streamAnthropic(response.body) };
}

async function* streamAnthropic(body: ReadableStream<Uint8Array> | null): AsyncGenerator<StreamEvent> {
  let promptTokens = 0;
  let completionTokens = 0;
  for await (const data of sseData(body)) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(data) as Record<string, any>;
    } catch {
      continue;
    }
    if (event.type === "error") {
      // Only report usage the upstream actually told us about.
      throw errorFromStreamErrorType(event.error?.type, { promptTokens, completionTokens });
    }
    if (event.type === "message_start") {
      promptTokens = Number(event.message?.usage?.input_tokens ?? 0);
    } else if (event.type === "content_block_delta") {
      const text = event.delta?.text;
      if (typeof text === "string" && text.length > 0) yield { type: "delta", text };
    } else if (event.type === "message_delta") {
      completionTokens = Number(event.usage?.output_tokens ?? 0);
    } else if (event.type === "message_stop") {
      yield { type: "done", usage: { promptTokens, completionTokens } };
      return;
    }
  }
  yield { type: "done", usage: { promptTokens, completionTokens } };
}

/* ------------------------------------------------------------------ */
/* Nebula wire protocol (OpenAI-ish path, but different auth + fields) */
/* ------------------------------------------------------------------ */

async function callNebula(
  provider: ProviderConfig,
  request: ChatRequest,
  wantStream: boolean,
): Promise<NormalizedResult> {
  const response = await fetchUpstream(`${provider.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nebula-key": provider.apiKey,
      ...(wantStream ? { accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: request.messages,
      ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
      ...(wantStream ? { stream: true } : {}),
    }),
  });
  if (!response.ok) throw errorFromUpstreamStatus(response.status);
  if (!wantStream) {
    const payload = (await response.json()) as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      stream: false,
      content: payload.output_text ?? "",
      usage: {
        promptTokens: Number(payload.usage?.input_tokens ?? 0),
        completionTokens: Number(payload.usage?.output_tokens ?? 0),
      },
    };
  }
  return { stream: true, events: streamNebula(response.body) };
}

async function* streamNebula(body: ReadableStream<Uint8Array> | null): AsyncGenerator<StreamEvent> {
  let usage: Usage | undefined;
  for await (const data of sseData(body)) {
    if (data === "[DONE]") break;
    let event: Record<string, any>;
    try {
      event = JSON.parse(data) as Record<string, any>;
    } catch {
      continue;
    }
    if (event.error) throw errorFromStreamErrorType(event.error?.type);
    const text = event.delta?.text;
    if (typeof text === "string" && text.length > 0) yield { type: "delta", text };
    if (event.usage) {
      usage = {
        promptTokens: Number(event.usage.input_tokens ?? 0),
        completionTokens: Number(event.usage.output_tokens ?? 0),
      };
    }
  }
  yield { type: "done", usage: usage ?? { promptTokens: 0, completionTokens: 0 } };
}
