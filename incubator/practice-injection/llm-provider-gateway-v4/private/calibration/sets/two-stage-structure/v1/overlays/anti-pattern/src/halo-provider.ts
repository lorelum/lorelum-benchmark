export async function chatWithHalo(messages: { role: string; content: string }[]): Promise<{ content: string }> {
  const upstream = await fetch("https://halo.example/v2/message");
  return { content: (await upstream.json()).text };
}
