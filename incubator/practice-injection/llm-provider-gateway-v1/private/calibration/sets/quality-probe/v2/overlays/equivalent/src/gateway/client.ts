import type { ChatMessage } from "../types";

export type TokenCounts = { in: number; out: number };

export type GatewayResult = { text: string; tokens: TokenCounts };

export type StreamSignal = { kind: "text"; value: string } | { kind: "finish"; tokens: TokenCounts };

export interface GatewayClient {
  complete(messages: ChatMessage[]): Promise<GatewayResult>;
  stream(messages: ChatMessage[]): AsyncGenerator<StreamSignal, void, unknown>;
}