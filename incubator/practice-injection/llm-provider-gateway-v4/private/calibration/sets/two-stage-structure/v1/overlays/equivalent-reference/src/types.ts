export type ChatRequest = { tenant: string; message: string };
export type ChatResponse = { content: string };
export class UpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
