export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatRequest = { messages: ChatMessage[]; stream?: boolean };

export type Usage = { promptTokens: number; completionTokens: number };

export type ChatResult = { content: string; usage: Usage };

export type UsageRecord = {
  provider: string;
  model: string;
  stream: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  status: number;
  timestamp: string;
};

export type UsageAggregate = {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
};

export type ProviderProtocol = "openai" | "anthropic";

export type ProviderConfig = {
  name: string;
  protocol: ProviderProtocol;
  model: string;
  apiKey: string;
  baseUrl: string;
  priceInPerMillion: number;
  priceOutPerMillion: number;
};

export type DomainErrorCode =
  | "authentication_failed"
  | "rate_limited"
  | "upstream_timeout"
  | "unsupported_provider"
  | "invalid_request";