import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createServer } from "../src/server";
import { createStub, type Stub } from "./stubs";

let app: Server;
let baseUrl: string;
let openai: Stub;
let deepseek: Stub;
let anthropic: Stub;

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) resolve(`http://127.0.0.1:${address.port}`);
      else reject(new Error("app server did not yield a port"));
    });
  });
}

async function postChat(payload: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function getUsage(): Promise<{ byModel: Record<string, Record<string, number>> }> {
  const response = await fetch(`${baseUrl}/api/usage`);
  expect(response.status).toBe(200);
  return await response.json() as { byModel: Record<string, Record<string, number>> };
}

beforeAll(async () => {
  openai = await createStub("openai");
  deepseek = await createStub("deepseek");
  anthropic = await createStub("anthropic");
  process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
  process.env.OPENAI_PROTOCOL = "openai";
  process.env.OPENAI_MODEL = "gpt-4o";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_BASE_URL = openai.url;
  process.env.OPENAI_PRICE_IN = "2.5";
  process.env.OPENAI_PRICE_OUT = "10";
  process.env.DEEPSEEK_PROTOCOL = "openai";
  process.env.DEEPSEEK_MODEL = "deepseek-chat";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_BASE_URL = deepseek.url;
  process.env.DEEPSEEK_PRICE_IN = "0.27";
  process.env.DEEPSEEK_PRICE_OUT = "1.1";
  process.env.ANTHROPIC_PROTOCOL = "anthropic";
  process.env.ANTHROPIC_MODEL = "claude-sonnet-4-5";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ANTHROPIC_BASE_URL = anthropic.url;
  process.env.ANTHROPIC_PRICE_IN = "3";
  process.env.ANTHROPIC_PRICE_OUT = "15";
  app = createServer();
  baseUrl = await listen(app);
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => app.close(() => resolveClose()));
  await openai.close();
  await deepseek.close();
  await anthropic.close();
});

describe("多供应商对话", () => {
  test("OpenAI 非流式对话返回内容与用量费用", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }] });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; usage: { promptTokens: number; completionTokens: number }; cost: number };
    expect(payload.content).toContain("openai");
    expect(payload.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(payload.cost).toBeCloseTo(0.000075, 9);
  });

  test("DeepSeek 只改配置即可切换，同一份代码对话成功", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "deepseek";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }] });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string };
    expect(payload.content).toContain("deepseek");
  });

  test("Anthropic 非流式对话成功（协议不同）", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "anthropic";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }] });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; usage: { promptTokens: number; completionTokens: number } };
    expect(payload.content).toContain("anthropic");
    expect(payload.usage).toEqual({ promptTokens: 12, completionTokens: 6 });
  });

  test("OpenAI 流式对话以 SSE 返回完整文本", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const response = await postChat(
      { messages: [{ role: "user", content: "hi" }], stream: true },
      { accept: "text/event-stream" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    const deltas = [...text.matchAll(/^data: (\{.*\})$/gm)].map((match) => JSON.parse(match[1]));
    const content = deltas.filter((event) => event.choices?.[0]?.delta?.content).map((event) => event.choices[0].delta.content).join("");
    expect(content).toContain("openai");
    const final = deltas.at(-1);
    expect(final?.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  test("Anthropic 流式对话以 SSE 返回完整文本", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "anthropic";
    const response = await postChat(
      { messages: [{ role: "user", content: "hi" }], stream: true },
      { accept: "text/event-stream" },
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const deltas = [...text.matchAll(/^data: (\{.*\})$/gm)].map((match) => JSON.parse(match[1]));
    const content = deltas.filter((event) => event.choices?.[0]?.delta?.content).map((event) => event.choices[0].delta.content).join("");
    expect(content).toContain("anthropic");
    const final = deltas.at(-1);
    expect(final?.usage).toEqual({ promptTokens: 12, completionTokens: 6 });
  });
});

describe("用量与费用", () => {
  test("单次请求后按模型聚合的用量与费用精确", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const before = await getUsage();
    const beforeModel = before.byModel["gpt-4o"] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0 };
    const response = await postChat({ messages: [{ role: "user", content: "count me" }] });
    expect(response.status).toBe(200);
    const after = await getUsage();
    const afterModel = after.byModel["gpt-4o"];
    expect(afterModel).toBeDefined();
    expect(afterModel.requests - beforeModel.requests).toBe(1);
    expect(afterModel.promptTokens - beforeModel.promptTokens).toBe(10);
    expect(afterModel.completionTokens - beforeModel.completionTokens).toBe(5);
    expect(afterModel.totalCost - beforeModel.totalCost).toBeCloseTo(0.000075, 9);
    expect(afterModel.maxLatencyMs).toBeGreaterThan(0);
  });

  test("流式请求同样进入用量聚合", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "anthropic";
    const before = await getUsage();
    const beforeModel = before.byModel["claude-sonnet-4-5"] ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalCost: 0 };
    const response = await postChat(
      { messages: [{ role: "user", content: "stream me" }], stream: true },
      { accept: "text/event-stream" },
    );
    expect(response.status).toBe(200);
    await response.text();
    const after = await getUsage();
    const afterModel = after.byModel["claude-sonnet-4-5"];
    expect(afterModel).toBeDefined();
    expect(afterModel.requests - beforeModel.requests).toBe(1);
    expect(afterModel.promptTokens - beforeModel.promptTokens).toBe(12);
    expect(afterModel.completionTokens - beforeModel.completionTokens).toBe(6);
  });

  test("请求日志以 JSONL 记录每请求字段", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const logDir = await mkdtemp(join(tmpdir(), "gateway-log-"));
    const logPath = join(logDir, "requests.jsonl");
    process.env.GATEWAY_LOG_PATH = logPath;
    try {
      const response = await postChat({ messages: [{ role: "user", content: "log me" }] });
      expect(response.status).toBe(200);
      const lines = (await readFile(logPath, "utf-8")).trim().split(/\r?\n/).filter(Boolean);
      expect(lines.length).toBe(1);
      const record = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(record.provider).toBe("openai");
      expect(record.model).toBe("gpt-4o");
      expect(record.promptTokens).toBe(10);
      expect(record.completionTokens).toBe(5);
      expect(record.cost).toBeCloseTo(0.000075, 9);
      expect(record.latencyMs).toBeGreaterThan(0);
      expect(record.status).toBe(200);
    } finally {
      delete process.env.GATEWAY_LOG_PATH;
      await rm(logDir, { recursive: true, force: true });
    }
  });
});

describe("错误翻译", () => {
  test("API Key 无效返回统一认证错误", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "wrong-key";
    try {
      const response = await postChat({ messages: [{ role: "user", content: "hi" }] });
      expect(response.status).toBe(401);
      const payload = await response.json() as { error: string };
      expect(payload.error).toBe("authentication_failed");
    } finally {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  test("上游限流返回统一领域错误", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
    const previous = process.env.OPENAI_MODEL;
    process.env.OPENAI_MODEL = "gpt-4o-ratelimit";
    try {
      const response = await postChat({ messages: [{ role: "user", content: "hi" }] });
      expect(response.status).toBe(429);
      const payload = await response.json() as { error: string };
      expect(payload.error).toBe("rate_limited");
    } finally {
      process.env.OPENAI_MODEL = previous;
    }
  });
});