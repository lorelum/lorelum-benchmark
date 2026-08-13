export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatRequest = { messages: ChatMessage[]; max_tokens?: number; stream?: boolean };

export type Usage = { promptTokens: number; completionTokens: number };

export type ChatResult = { content: string; usage: Usage };

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: Usage };

export type ProviderProtocol = "openai" | "anthropic" | "nebula";

export type ProviderConfig = {
  name: string;
  protocol: ProviderProtocol;
  model: string;
  apiKey: string;
  baseUrl: string;
  priceInPerMillion: number;
  priceOutPerMillion: number;
};

export type UsageRecord = {
  tenant: string;
  provider: string;
  model: string;
  stream: boolean;
  traceId: string;
  retryCount: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  status: number;
  timestamp: string;
};

export type ModelAggregate = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
};

export type TenantAggregate = {
  requests: number;
  totalCost: number;
  budget: number;
  remainingBudget: number;
};

export type DomainErrorCode =
  | "authentication_failed"
  | "rate_limited"
  | "upstream_timeout"
  | "budget_exceeded"
  | "idempotency_conflict"
  | "unsupported_provider"
  | "invalid_request"
  | "upstream_error";
