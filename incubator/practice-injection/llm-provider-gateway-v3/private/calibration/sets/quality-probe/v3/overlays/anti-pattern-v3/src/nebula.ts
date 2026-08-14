import { failure, UpstreamFailure } from "./openai";
import type { ChatMessage, ChatResult, ProviderConfig, StreamEvent, Usage } from "./types";

export function nebulaCost(provider: ProviderConfig, usage: Usage): number {
  const raw = (usage.promptTokens / 1_000_000) * provider.priceInPerMillion + (usage.completionTokens / 1_000_000) * provider.priceOutPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export async function chatNebula(provider: ProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nebula-key": provider.apiKey },
    body: JSON.stringify({ model: provider.model, messages }),
  });
  if (!response.ok) throw failure(response.status);
  const payload = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  return {
    content: payload.output_text ?? "",
    usage: { promptTokens: payload.usage?.input_tokens ?? 0, completionTokens: payload.usage?.output_tokens ?? 0 },
  };
}

export async function* streamNebula(provider: ProviderConfig, messages: ChatMessage[]): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nebula-key": provider.apiKey, accept: "text/event-stream" },
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
        const event = JSON.parse(data) as { delta?: { text?: string }; usage?: { input_tokens?: number; output_tokens?: number } };
        if (event.delta?.text) yield { type: "delta", text: event.delta.text };
        if (event.usage) usage = { promptTokens: event.usage.input_tokens ?? 0, completionTokens: event.usage.output_tokens ?? 0 };
      }
    }
  }
  yield { type: "done", usage };
}
