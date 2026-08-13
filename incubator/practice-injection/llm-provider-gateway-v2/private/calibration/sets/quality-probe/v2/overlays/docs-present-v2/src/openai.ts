import type { ChatMessage, ChatResult, ProviderConfig, StreamEvent, Usage } from "./types";

export class UpstreamFailure extends Error {
  constructor(readonly code: "authentication_failed" | "rate_limited" | "upstream_timeout" | "upstream_error", readonly retryable: boolean) {
    super(code);
  }
}

export function failure(status: number): UpstreamFailure {
  if (status === 401 || status === 403) return new UpstreamFailure("authentication_failed", false);
  if (status === 429) return new UpstreamFailure("rate_limited", true);
  if (status === 408 || status === 504) return new UpstreamFailure("upstream_timeout", true);
  return new UpstreamFailure("upstream_error", status >= 500);
}

export function openAiCost(provider: ProviderConfig, usage: Usage): number {
  const raw = (usage.promptTokens / 1_000_000) * provider.priceInPerMillion + (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export async function chatOpenAi(provider: ProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: provider.model, messages }),
  });
  if (!response.ok) throw failure(response.status);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return {
    content: payload.choices?.[0]?.message?.content ?? "",
    usage: { promptTokens: payload.usage?.prompt_tokens ?? 0, completionTokens: payload.usage?.completion_tokens ?? 0 },
  };
}

export async function* streamOpenAi(provider: ProviderConfig, messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}`, accept: "text/event-stream" },
    body: JSON.stringify({ model: provider.model, messages, stream: true }),
  });
  if (!response.ok) throw failure(response.status);
  if (!response.body) throw new UpstreamFailure("upstream_error", false);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: Usage = { promptTokens: 0, completionTokens: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (event.choices?.[0]?.delta?.content) yield { type: "delta", text: event.choices[0].delta.content };
        if (event.usage) usage = { promptTokens: event.usage.prompt_tokens ?? 0, completionTokens: event.usage.completion_tokens ?? 0 };
      }
    }
  }
  yield { type: "done", usage };
}
