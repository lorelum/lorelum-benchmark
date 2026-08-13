import { failure, UpstreamFailure } from "./openai";
import type { ChatMessage, ChatResult, ProviderConfig, StreamEvent, Usage } from "./types";

export function anthropicCost(provider: ProviderConfig, usage: Usage): number {
  const raw = (usage.promptTokens / 1_000_000) * provider.priceInPerMillion + (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export async function chatAnthropic(provider: ProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const response = await fetch(`${provider.baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: 1024 }),
  });
  if (!response.ok) throw failure(response.status);
  const payload = await response.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  return {
    content: (payload.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join(""),
    usage: { promptTokens: payload.usage?.input_tokens ?? 0, completionTokens: payload.usage?.output_tokens ?? 0 },
  };
}

export async function* streamAnthropic(provider: ProviderConfig, messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${provider.baseUrl}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01", accept: "text/event-stream" },
    body: JSON.stringify({ model: provider.model, messages, max_tokens: 1024, stream: true }),
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
        if (!data) continue;
        const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; usage?: { output_tokens?: number }; message?: { usage?: { input_tokens?: number } }; error?: { type?: string } };
        if (event.type === "error") throw new UpstreamFailure("rate_limited", true, usage);
        if (event.type === "message_start" && event.message?.usage) usage = { ...usage, promptTokens: event.message.usage.input_tokens ?? 0 };
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield { type: "delta", text: event.delta.text };
        if (event.type === "message_delta" && event.usage) usage = { ...usage, completionTokens: event.usage.output_tokens ?? 0 };
      }
    }
  }
  yield { type: "done", usage };
}
