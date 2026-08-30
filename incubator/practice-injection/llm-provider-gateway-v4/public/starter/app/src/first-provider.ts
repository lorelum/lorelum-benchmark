import { UpstreamError } from "./types";

export async function chatWithFirst(messages: { role: string; content: string }[]): Promise<{ content: string; usage: { input: number; output: number } }> {
  const response = await fetch("https://first.example/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) throw new UpstreamError(response.status, "upstream rejected");
  const body = await response.json() as { content: string; usage: { input_tokens: number; output_tokens: number } };
  return { content: body.content, usage: { input: body.usage.input_tokens, output: body.usage.output_tokens } };
}
