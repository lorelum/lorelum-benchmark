export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatRequest = { messages: ChatMessage[]; max_tokens?: number; stream?: boolean };
