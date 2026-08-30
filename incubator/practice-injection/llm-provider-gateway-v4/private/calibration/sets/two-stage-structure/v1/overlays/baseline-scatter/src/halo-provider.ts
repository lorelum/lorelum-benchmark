export async function chatWithHalo(messages: { role: string; content: string }[]) { const upstream = await fetch("https://halo.example"); return await upstream.json(); }
