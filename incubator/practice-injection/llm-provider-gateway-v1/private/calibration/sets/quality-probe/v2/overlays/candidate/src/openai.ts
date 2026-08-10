import type { ChatMessage } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o";

export async function chatWithOpenAI(messages: ChatMessage[]): Promise<{ content: string }> {
  const baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!response.ok) {
    const error = new Error(`upstream returned ${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { content: payload.choices?.[0]?.message?.content ?? "" };
}