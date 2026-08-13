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
let nebula: Stub;

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

async function getUsage(query = ""): Promise<{
  byModel: Record<string, Record<string, number>>;
  byTenant: Record<string, Record<string, number>>;
}> {
  const response = await fetch(`${baseUrl}/api/usage${query}`);
  expect(response.status).toBe(200);
  return await response.json() as {
    byModel: Record<string, Record<string, number>>;
    byTenant: Record<string, Record<string, number>>;
  };
}

function sseEvents(text: string): Array<Record<string, unknown>> {
  return [...text.matchAll(/^data: (\{.*\})$/gm)].map((match) => JSON.parse(match[1])) as Array<Record<string, unknown>>;
}

function setProvider(name: "openai" | "deepseek" | "anthropic" | "nebula", model = "default"): void {
  process.env.GATEWAY_ACTIVE_PROVIDER = name;
  if (name === "openai") process.env.OPENAI_MODEL = model === "default" ? "gpt-4o" : model;
  if (name === "deepseek") process.env.DEEPSEEK_MODEL = model === "default" ? "deepseek-chat" : model;
  if (name === "anthropic") process.env.ANTHROPIC_MODEL = model === "default" ? "claude-sonnet-4-5" : model;
  if (name === "nebula") process.env.NEBULA_MODEL = model === "default" ? "nebula-default" : model;
  delete process.env.GATEWAY_FALLBACK_PROVIDER;
  process.env.GATEWAY_RETRY_ATTEMPTS = "1";
}

beforeAll(async () => {
  openai = await createStub("openai");
  deepseek = await createStub("deepseek");
  anthropic = await createStub("anthropic");
  nebula = await createStub("nebula");

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

  process.env.NEBULA_PROTOCOL = "nebula";
  process.env.NEBULA_MODEL = "nebula-default";
  process.env.NEBULA_API_KEY = "test-nebula-key";
  process.env.NEBULA_BASE_URL = nebula.url;
  process.env.NEBULA_PRICE_IN = "1";
  process.env.NEBULA_PRICE_OUT = "4";

  process.env.GATEWAY_ACTIVE_PROVIDER = "openai";
  process.env.GATEWAY_RETRY_ATTEMPTS = "1";
  app = createServer();
  baseUrl = await listen(app);
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => app.close(() => resolveClose()));
  await openai.close();
  await deepseek.close();
  await anthropic.close();
  await nebula.close();
});

describe("多供应商对话", () => {
  test("OpenAI 非流式对话返回内容、用量与费用", async () => {
    setProvider("openai");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "acme" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; provider: string; usage: { promptTokens: number; completionTokens: number }; cost: number };
    expect(payload.content).toContain("openai");
    expect(payload.provider).toBe("openai");
    expect(payload.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(payload.cost).toBeCloseTo(0.000075, 9);
  });

  test("DeepSeek 只改配置即可切换，同一份代码对话成功", async () => {
    setProvider("deepseek");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "acme" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; usage: { promptTokens: number; completionTokens: number }; cost: number };
    expect(payload.content).toContain("deepseek");
    expect(payload.usage).toEqual({ promptTokens: 8, completionTokens: 4 });
    expect(payload.cost).toBeCloseTo(0.000007, 9);
  });

  test("Anthropic 非流式对话成功且 usage 字段映射正确", async () => {
    setProvider("anthropic");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "acme" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; usage: { promptTokens: number; completionTokens: number }; cost: number };
    expect(payload.content).toContain("anthropic");
    expect(payload.usage).toEqual({ promptTokens: 12, completionTokens: 6 });
    expect(payload.cost).toBeCloseTo(0.000126, 9);
  });

  test("Nebula 伪兼容供应商非流式对话成功且字段映射正确", async () => {
    setProvider("nebula");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "acme" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; provider: string; usage: { promptTokens: number; completionTokens: number }; cost: number };
    expect(payload.content).toContain("nebula");
    expect(payload.provider).toBe("nebula");
    expect(payload.usage).toEqual({ promptTokens: 14, completionTokens: 7 });
    expect(payload.cost).toBeCloseTo(0.000042, 9);
  });

  test("OpenAI 流式对话以 SSE 返回完整文本与归一化 usage", async () => {
    setProvider("openai");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20, stream: true }, { "x-tenant-id": "acme", accept: "text/event-stream" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = sseEvents(await response.text());
    const content = events.filter((event) => (event.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta?.content)
      .map((event) => (event.choices as Array<{ delta?: { content?: string } }>)[0].delta!.content!).join("");
    expect(content).toContain("openai");
    const final = events.at(-1);
    expect(final?.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(final?.provider).toBe("openai");
  });

  test("Anthropic 流式对话成功", async () => {
    setProvider("anthropic");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20, stream: true }, { "x-tenant-id": "acme", accept: "text/event-stream" });
    expect(response.status).toBe(200);
    const events = sseEvents(await response.text());
    const content = events.filter((event) => (event.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta?.content)
      .map((event) => (event.choices as Array<{ delta?: { content?: string } }>)[0].delta!.content!).join("");
    expect(content).toContain("anthropic");
    expect(events.at(-1)?.usage).toEqual({ promptTokens: 12, completionTokens: 6 });
  });

  test("Nebula 流式对话使用自身 delta.text 与 usage 字段", async () => {
    setProvider("nebula");
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20, stream: true }, { "x-tenant-id": "acme", accept: "text/event-stream" });
    expect(response.status).toBe(200);
    const events = sseEvents(await response.text());
    const content = events.filter((event) => (event.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta?.content)
      .map((event) => (event.choices as Array<{ delta?: { content?: string } }>)[0].delta!.content!).join("");
    expect(content).toContain("nebula");
    expect(events.at(-1)?.usage).toEqual({ promptTokens: 14, completionTokens: 7 });
    expect(events.at(-1)?.provider).toBe("nebula");
  });
});

describe("fallback 与 retry", () => {
  test("主供应商失败后降级到 fallback，归属与费用为 fallback", async () => {
    setProvider("openai", "gpt-4o-down");
    process.env.GATEWAY_FALLBACK_PROVIDER = "deepseek";
    process.env.GATEWAY_RETRY_ATTEMPTS = "0";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "fallback" });
    expect(response.status).toBe(200);
    const payload = await response.json() as { content: string; provider: string; model: string; cost: number };
    expect(payload.content).toContain("deepseek");
    expect(payload.provider).toBe("deepseek");
    expect(payload.model).toBe("deepseek-chat");
    expect(payload.cost).toBeCloseTo(0.000007, 9);
    const usage = await getUsage();
    expect(usage.byModel["gpt-4o-down"]).toBeUndefined();
    expect(usage.byModel["deepseek-chat"]).toBeDefined();
  });

  test("重试后成功只计一次，retry_count 进入日志", async () => {
    setProvider("openai", "gpt-4o-flaky");
    process.env.GATEWAY_RETRY_ATTEMPTS = "1";
    const logDir = await mkdtemp(join(tmpdir(), "gateway-retry-"));
    const logPath = join(logDir, "requests.jsonl");
    process.env.GATEWAY_LOG_PATH = logPath;
    const before = openai.requestCount();
    try {
      const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "retry" });
      expect(response.status).toBe(200);
      expect(openai.requestCount() - before).toBe(2);
      const payload = await response.json() as { usage: { promptTokens: number; completionTokens: number }; cost: number };
      expect(payload.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
      expect(payload.cost).toBeCloseTo(0.000075, 9);
      const lines = (await readFile(logPath, "utf-8")).trim().split(/\r?\n/).filter(Boolean);
      expect(lines.length).toBe(1);
      const record = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(record.retryCount).toBe(1);
      expect(record.provider).toBe("openai");
      expect(record.status).toBe(200);
    } finally {
      delete process.env.GATEWAY_LOG_PATH;
      await rm(logDir, { recursive: true, force: true });
    }
  });

  test("主备都失败返回统一领域错误且不计费用", async () => {
    setProvider("openai", "gpt-4o-down");
    process.env.GATEWAY_FALLBACK_PROVIDER = "deepseek";
    process.env.DEEPSEEK_MODEL = "deepseek-ratelimit";
    process.env.GATEWAY_RETRY_ATTEMPTS = "0";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "allfail" });
    expect(response.status).toBe(429);
    const payload = await response.json() as { error: string };
    expect(payload.error).toBe("rate_limited");
    setProvider("deepseek");
  });
});

describe("租户预算", () => {
  test("预占与结算后余额精确", async () => {
    setProvider("openai");
    process.env.BUDGET_BUDGETSERIAL = "0.0003";
    try {
      const first = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "budgetserial" });
      expect(first.status).toBe(200);
      const usage = await getUsage("?tenant=budgetserial");
      expect(usage.byTenant.budgetserial.remainingBudget).toBeCloseTo(0.000225, 9);
      const second = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "budgetserial" });
      expect(second.status).toBe(402);
      const payload = await second.json() as { error: string };
      expect(payload.error).toBe("budget_exceeded");
    } finally {
      delete process.env.BUDGET_BUDGETSERIAL;
    }
  });

  test("并发请求不超支", async () => {
    setProvider("openai");
    process.env.BUDGET_BUDGETCONCURRENT = "0.0003";
    try {
      const responses = await Promise.all([
        postChat({ messages: [{ role: "user", content: "one" }], max_tokens: 20 }, { "x-tenant-id": "budgetconcurrent" }),
        postChat({ messages: [{ role: "user", content: "two" }], max_tokens: 20 }, { "x-tenant-id": "budgetconcurrent" }),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 402]);
      const usage = await getUsage("?tenant=budgetconcurrent");
      expect(usage.byTenant.budgetconcurrent.remainingBudget).toBeCloseTo(0.000225, 9);
    } finally {
      delete process.env.BUDGET_BUDGETCONCURRENT;
    }
  });
});

describe("幂等", () => {
  test("相同 key 与请求体返回缓存结果且只调用一次", async () => {
    setProvider("openai");
    const beforeRequests = openai.requestCount();
    const payload = { messages: [{ role: "user", content: "once" }], max_tokens: 20 };
    const first = await postChat(payload, { "x-tenant-id": "idempotent", "idempotency-key": "repeat-key" });
    const second = await postChat(payload, { "x-tenant-id": "idempotent", "idempotency-key": "repeat-key" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(openai.requestCount() - beforeRequests).toBe(1);
  });

  test("同 key 不同请求体返回冲突且不调用供应商", async () => {
    setProvider("openai");
    const beforeRequests = openai.requestCount();
    const first = await postChat({ messages: [{ role: "user", content: "body-a" }], max_tokens: 20 }, { "x-tenant-id": "idempotent", "idempotency-key": "conflict-key" });
    const second = await postChat({ messages: [{ role: "user", content: "body-b" }], max_tokens: 20 }, { "x-tenant-id": "idempotent", "idempotency-key": "conflict-key" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect((await second.json() as { error: string }).error).toBe("idempotency_conflict");
    expect(openai.requestCount() - beforeRequests).toBe(1);
  });
});

describe("流式失败与错误翻译", () => {
  test("无效 Key 返回统一认证错误", async () => {
    setProvider("openai");
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "wrong-key";
    try {
      const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "err" });
      expect(response.status).toBe(401);
      expect((await response.json() as { error: string }).error).toBe("authentication_failed");
    } finally {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  test("上游限流返回统一领域错误", async () => {
    setProvider("openai", "gpt-4o-ratelimit");
    process.env.GATEWAY_RETRY_ATTEMPTS = "0";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "err" });
    expect(response.status).toBe(429);
    expect((await response.json() as { error: string }).error).toBe("rate_limited");
    setProvider("openai");
  });

  test("上游超时返回统一领域错误", async () => {
    setProvider("openai", "gpt-4o-timeout");
    process.env.GATEWAY_RETRY_ATTEMPTS = "0";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "err" });
    expect(response.status).toBe(504);
    expect((await response.json() as { error: string }).error).toBe("upstream_timeout");
    setProvider("openai");
  });

  test("供应商未配置与非法请求体返回领域错误", async () => {
    process.env.GATEWAY_ACTIVE_PROVIDER = "missing-provider";
    const missing = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20 }, { "x-tenant-id": "err" });
    expect(missing.status).toBe(400);
    expect((await missing.json() as { error: string }).error).toBe("unsupported_provider");
    setProvider("openai");
    const invalid = await postChat({}, { "x-tenant-id": "err" });
    expect(invalid.status).toBe(422);
    expect((await invalid.json() as { error: string }).error).toBe("invalid_request");
  });

  test("首 chunk 前失败返回 JSON 领域错误", async () => {
    setProvider("openai", "gpt-4o-ratelimit");
    process.env.GATEWAY_RETRY_ATTEMPTS = "0";
    const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20, stream: true }, { "x-tenant-id": "err", accept: "text/event-stream" });
    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json() as { error: string }).error).toBe("rate_limited");
    setProvider("openai");
  });

  test("流中途失败发送终止 SSE 错误事件且不伪造成功 usage", async () => {
    setProvider("anthropic", "claude-midstream");
    const logDir = await mkdtemp(join(tmpdir(), "gateway-streamfail-"));
    const logPath = join(logDir, "requests.jsonl");
    process.env.GATEWAY_LOG_PATH = logPath;
    try {
      const response = await postChat({ messages: [{ role: "user", content: "hi" }], max_tokens: 20, stream: true }, { "x-tenant-id": "streamfail", accept: "text/event-stream" });
      expect(response.status).toBe(200);
      const events = sseEvents(await response.text());
      expect(events.some((event) => (event.error as { code?: string } | undefined)?.code === "rate_limited")).toBe(true);
      expect(events.some((event) => "usage" in event)).toBe(false);
      const lines = (await readFile(logPath, "utf-8")).trim().split(/\r?\n/).filter(Boolean);
      expect(lines.length).toBe(1);
      const record = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(record.provider).toBe("anthropic");
      expect(record.status).toBe(429);
      expect(record.promptTokens).toBe(12);
      expect(record.completionTokens).toBe(0);
      expect(record.cost).toBeCloseTo(0.000036, 9);
    } finally {
      delete process.env.GATEWAY_LOG_PATH;
      await rm(logDir, { recursive: true, force: true });
    }
  });
});

describe("观测", () => {
  test("JSONL 每逻辑请求一条并包含租户、trace、retry 字段", async () => {
    setProvider("openai");
    const logDir = await mkdtemp(join(tmpdir(), "gateway-log-"));
    const logPath = join(logDir, "requests.jsonl");
    process.env.GATEWAY_LOG_PATH = logPath;
    try {
      const response = await postChat({ messages: [{ role: "user", content: "log me" }], max_tokens: 20 }, { "x-tenant-id": "logtenant", "idempotency-key": "log-key" });
      expect(response.status).toBe(200);
      const lines = (await readFile(logPath, "utf-8")).trim().split(/\r?\n/).filter(Boolean);
      expect(lines.length).toBe(1);
      const record = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(record.tenant).toBe("logtenant");
      expect(record.provider).toBe("openai");
      expect(record.model).toBe("gpt-4o");
      expect(record.traceId).toBeTypeOf("string");
      expect(record.retryCount).toBe(0);
      expect(record.latencyMs).toBeTypeOf("number");
      expect(record.status).toBe(200);
      expect(record.cost).toBeCloseTo(0.000075, 9);
    } finally {
      delete process.env.GATEWAY_LOG_PATH;
      await rm(logDir, { recursive: true, force: true });
    }
  });

  test("usage 支持 tenant/model/status 过滤与聚合", async () => {
    setProvider("deepseek");
    const before = await getUsage("?tenant=usagefilter&model=deepseek-chat&status=200");
    const beforeRequests = before.byModel["deepseek-chat"]?.requests ?? 0;
    const response = await postChat({ messages: [{ role: "user", content: "filter me" }], max_tokens: 20 }, { "x-tenant-id": "usagefilter" });
    expect(response.status).toBe(200);
    const after = await getUsage("?tenant=usagefilter&model=deepseek-chat&status=200");
    expect((after.byModel["deepseek-chat"]?.requests ?? 0) - beforeRequests).toBe(1);
    expect(after.byTenant.usagefilter).toBeDefined();
    expect(after.byTenant.usagefilter.requests).toBeGreaterThan(0);
  });
});
