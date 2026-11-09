import { expect, test } from "bun:test";
import { startModelProxy } from "./model-proxy";

test("model proxy refuses alternate targets before making an upstream request", async () => {
  const server = startModelProxy({ baseUrl: "https://example.invalid/v1", apiKey: "test-only", model: "allowed", hostname: "127.0.0.1", port: 0 });
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
  const config = { apiKey: "test-only", model: "allowed", hostname: "127.0.0.1", port: 0 };
  expect(() => startModelProxy({ ...config, baseUrl: "http://example.invalid/v1" })).toThrow();
  expect(() => startModelProxy({ ...config, baseUrl: "https://user:pass@example.invalid/v1" })).toThrow();
  expect(() => startModelProxy({ ...config, baseUrl: "https://example.invalid/v1?next=other" })).toThrow();
});
