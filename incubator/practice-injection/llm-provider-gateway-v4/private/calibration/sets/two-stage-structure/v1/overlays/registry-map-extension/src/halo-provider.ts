const HALO_URL = "https://halo.example/v2/message";

export async function chatWithHalo(messages: { role: string; content: string }[]): Promise<{ content: string; usage: { input: number; output: number } }> {
  const upstream = await fetch(HALO_URL, { method: "POST", headers: { "x-halo-key": "k" }, body: JSON.stringify({ turns: messages }) });
  const body = await upstream.json();
  return { content: body.text, usage: { input: body.input_events, output: body.output_events } };
}
