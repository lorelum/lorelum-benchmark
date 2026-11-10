import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { startModelProxy, UsageCollector } from "./model-proxy";
import { auditUsageStream, UsageCapture } from "./provider-usage";

test("model proxy refuses alternate targets before making an upstream request", async () => {
  const server = startModelProxy({ baseUrl: "https://example.invalid/v1", apiKey: "test-only", model: "allowed", hostname: "127.0.0.1", port: 0, maxRequests: 1 });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    expect((await fetch(`${base}/v1/models`)).status).toBe(404);
    expect((await fetch(`${base}/v1/chat/completions?other=1`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "other" }) })).status).toBe(403);
    expect((await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status).toBe(400);
  } finally {
    server.stop(true);
  }
});

test("model proxy rejects insecure and credential-bearing upstream endpoints", () => {
  const config = { apiKey: "test-only", model: "allowed", hostname: "127.0.0.1", port: 0, maxRequests: 1 };
  expect(() => startModelProxy({ ...config, baseUrl: "http://example.invalid/v1" })).toThrow();
  expect(() => startModelProxy({ ...config, baseUrl: "https://user:pass@example.invalid/v1" })).toThrow();
  expect(() => startModelProxy({ ...config, baseUrl: "https://example.invalid/v1?next=other" })).toThrow();
});

test("failed upstream requests consume the independent request budget", async () => {
  const upstream = createServer(socket => socket.destroy());
  const listening = Promise.withResolvers<void>();
  upstream.once("error", listening.reject);
  upstream.listen(0, "127.0.0.1", listening.resolve);
  await listening.promise;
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Local fixture did not bind");
  const server = startModelProxy({ baseUrl: `https://127.0.0.1:${address.port}/v1`, apiKey: "test-only", model: "allowed", hostname: "127.0.0.1", port: 0, maxRequests: 1 });
  try {
    const url = `http://127.0.0.1:${server.port}/v1/chat/completions`;
    const request = () => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "allowed" }) });
    expect((await request()).status).toBe(502);
    expect((await request()).status).toBe(429);
  } finally {
    server.stop(true);
    upstream.close();
  }
});

test("SSE duplicates, interruption and malformed usage cannot inflate totals", () => {
  const collector = new UsageCollector();
  const encoder = new TextEncoder();
  const event = 'data: {"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n';
  const consume = (text: string) => {
    const capture = collector.begin();
    for (const byte of encoder.encode(text)) capture.push(new Uint8Array([byte]), true);
    capture.end(true);
  };
  consume(`${event}${event}data: [DONE]\n\n`);
  consume(event);
  consume(`${event}data: {"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\ndata: [DONE]\n\n`);
  consume('data: {"usage":{"prompt_tokens":0,"completion_tokens":0}}\n\ndata: [DONE]\n\n');
  consume('data: {"choices":[]}\n\ndata: [DONE]\n\n');
  const pending = collector.begin();
  pending.finish("error");
  expect(collector.snapshot().records.map(record => record.status)).toEqual(["complete", "interrupted", "invalid", "invalid", "missing", "error"]);
  expect(collector.snapshot().totals).toBeNull();
});

test("non-streaming usage preserves complete counts and does not convert absence to zero", () => {
  const collector = new UsageCollector();
  const encoder = new TextEncoder();
  const first = collector.begin();
  for (const byte of encoder.encode('{"usage":{"prompt_tokens":2,"completion_tokens":4,"total_tokens":6}}')) first.push(new Uint8Array([byte]), false);
  first.end(false);
  expect(collector.snapshot().totals).toEqual({ promptTokens: 2, completionTokens: 4, totalTokens: 6 });
  const second = collector.begin();
  second.push(encoder.encode('{"choices":[]}'), false);
  second.end(false);
  expect(collector.snapshot().records.map(record => record.status)).toEqual(["complete", "missing"]);
  expect(collector.snapshot().totals).toBeNull();
});

test("capture preserves pending and marks explicit stream cancellation interrupted", () => {
  const collector = new UsageCollector();
  const capture: UsageCapture = collector.begin();
  expect(collector.snapshot().complete).toBe(false);
  capture.finish("interrupted");
  capture.finish("complete");
  expect(collector.snapshot().records[0].status).toBe("interrupted");
});

test("usage totals require paired events, terminal agreement and a clean complete stream", () => {
  const events: string[] = [];
  const collector = new UsageCollector(record => events.push(`model-proxy-usage:${JSON.stringify(record)}`));
  const capture = collector.begin();
  capture.push(new TextEncoder().encode('{"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}'), false);
  capture.end(false);
  const finish = `model-proxy-stopped:${JSON.stringify(collector.snapshot())}`;
  const stream = (parts: string[]) => `model-proxy-ready:8080\n${parts.join("\n")}\n`;
  expect(auditUsageStream(stream([...events, finish]), true)).toEqual({ complete: true, totals: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } });
  expect(auditUsageStream(stream([...events, finish]), false).totals).toBeNull();
  expect(auditUsageStream(stream([events[1], finish]), true).totals).toBeNull();
  expect(auditUsageStream(stream([events[0], events[1], events[1], finish]), true).totals).toBeNull();
  expect(auditUsageStream(stream(events), true).totals).toBeNull();
  expect(auditUsageStream(stream([...events, finish]).slice(0, -1), true).totals).toBeNull();
});

test("only explicit complete USD costs are summed independently of token counts", () => {
  const events: string[] = [];
  const collector = new UsageCollector(record => events.push(`model-proxy-usage:${JSON.stringify(record)}`));
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const first = collector.begin();
  first.push(encode({ usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost_usd: 0.02 } }), false);
  first.end(false);
  const complete = collector.snapshot();
  expect(complete.totals).toEqual({ promptTokens: 2, completionTokens: 3, totalTokens: 5, costUsd: 0.02 });
  const log = `model-proxy-ready:8080\n${events.join("\n")}\nmodel-proxy-stopped:${JSON.stringify(complete)}\n`;
  expect(auditUsageStream(log, true).totals?.costUsd).toBe(0.02);
  const second = collector.begin();
  second.push(encode({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.01 } }), false);
  second.end(false);
  expect(collector.snapshot().totals).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: 7 });
  const conflicting = new UsageCollector();
  const streamed = conflicting.begin();
  const usage = (cost: number) => `data: ${JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: cost } })}\n\n`;
  streamed.push(new TextEncoder().encode(`${usage(0.01)}${usage(0.02)}data: [DONE]\n\n`), true);
  streamed.end(true);
  expect(conflicting.snapshot().totals).toEqual({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
});

