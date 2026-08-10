# oracle vs baseline 具体差异（llm-provider-gateway-v1，flash 档）

## 背景

flash 档三条件诊断（deepseek-v4-flash，每条件 3 次）中：oracle-practice 3/3 joint-pass（探针 observed，judge 96/100/100），baseline 仅 rep1 joint-pass（judge 90），rep2/rep3 not-observed（judge 82 / judge-unavailable）。关键点：**baseline 与 oracle 的语义全部通过**（功能都做对了），差异在"组织方式"——oracle 把供应商可变点收进"统一契约 + 适配器 + 边界"，baseline 把供应商逻辑直接铺在服务层。这正是被测 Practice（统一模型客户端契约 + 适配器 + 配置驱动选择 + 边界集中记账/观测）要区分的。

代码来源：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-flash-2026-08-10/llm-provider-gateway-v1/{oracle-practice,baseline}/attempt-*/workspace/app/src/`（gitignored，仅本机）。探针：`private/evaluator/verify-provider-gateway.ts`；judge：`judge-agent/generic/v1`（flash 轮 rubric_hash `2cfe8719…`，维度权重见第 6 节）。

## 差异 1：服务层怎么选供应商（探针 R6 + judge `provider-adapter-boundary`/`provider-abstraction`）

**oracle（observed，judge 96）—— server.ts 对供应商零感知：**

```ts
// src/server.ts
import { createClient } from "./client";
const client = createClient(config);                        // 统一工厂
const result = await client.chat(request.messages, { signal });
for await (const chunk of client.stream(request.messages, { signal })) { ... }

// src/client.ts —— 唯一一处按协议分发，OpenAI 兼容共用同一适配器
export function createClient(config: ProviderConfig): ProviderClient {
  if (config.protocol === "anthropic") return createAnthropicClient(config);
  return createOpenAICompatibleClient(config);              // OpenAI、DeepSeek 都走这个
}
```

**baseline（not-observed，judge 82）—— server.ts 自己 import 两家并三元分支：**

```ts
// src/server.ts
import { chatWithAnthropic, streamWithAnthropic } from "./anthropic";
import { chatWithOpenAI, streamWithOpenAI } from "./openai";

function chat(provider, messages) {
  return provider.protocol === "anthropic" ? chatWithAnthropic(provider, messages) : chatWithOpenAI(provider, messages);
}
function streamChat(provider, messages) {
  return provider.protocol === "anthropic" ? streamWithAnthropic(provider, messages) : streamWithOpenAI(provider, messages);
}
```

**为什么**：加第三个非 OpenAI 兼容协议时，oracle 只需在 `createClient` 加一行；baseline 要改 `chat` 和 `streamChat` 两个函数。对应探针 R6（服务层不按供应商名分支）与 practice 卡第 3 条（选择走配置/注册表）。judge `provider-abstraction` 一档 15/15、一档 4/15。

## 差异 2：错误在哪翻译、message 会不会泄漏（探针 R5 + judge `raw-error-containment` 20/20 vs 13/20）

**oracle——边界只抛 `GatewayError`，message 用固定安全文案，超时归一化为 504：**

```ts
// src/errors.ts
export function errorFromUpstream(status: number): GatewayError {
  switch (status) {
    case 401: case 403: return new GatewayError("authentication_failed", 401, "upstream rejected the API key (HTTP 401)");
    case 429:            return new GatewayError("rate_limited", 429, "upstream rate limit exceeded");
    case 408: case 504:  return new GatewayError("upstream_timeout", 504, "upstream request timed out");
    default:             return new GatewayError("upstream_error", 502, "upstream request failed");
  }
}
export function toDomainError(error) {
  if (error instanceof Error && error.name === "AbortError")
    return new GatewayError("upstream_timeout", 504, "upstream request timed out");
  // ...
}
```

**baseline——其他状态全塌成 `upstream_error`（没有 504），并把 `error.message` 原样塞进响应：**

```ts
// src/errors.ts —— 只有 401/429，default 全变 502 upstream_error
export function mapUpstreamError(status, detail?) {
  switch (status) {
    case 401: return new DomainError(401, "authentication_failed", detail ?? "upstream authentication failed");
    case 429: return new DomainError(429, "rate_limited", detail ?? "upstream rate limited");
    default:  return new DomainError(502, "upstream_error", detail ?? `upstream error (${status})`);
  }
}
// src/server.ts catch —— 把上游异常文本转发给客户端
const domain = error instanceof DomainError ? error
  : new DomainError(502, "upstream_error", error instanceof Error ? error.message : String(error));
sendJson(res, domain.status, { error: domain.code, message: domain.message });   // 响应带未文档化 message
```

**为什么**：judge 对 baseline 的原话是 "leaking raw exception text rather than a fixed safe message"。oracle 的 `message` 是写死的安全文案；baseline 把 `error.message`（可能含上游原始报文）返回，还多带一个未写进 API 文档的 `message` 字段（judge `contract-and-test-compliance` 14/15 也为此扣 1 分）。对应探针 R5（原始 usage/错误不外泄）。

## 差异 3：流式错误能不能被正确报告（judge `streaming-sse-correctness` 20/20 vs 15/20）

**oracle——有超时 + 头前先取第一个 chunk，初始失败能返回 JSON：**

```ts
// src/server.ts（oracle rep1）
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);   // 60s 超时
for await (const chunk of client.stream(request.messages, { signal: controller.signal })) {
  res.writeHead(200, SSE_HEADERS);   // 先迭代成功再写头，初始失败可返回 JSON 错误
  // ...
}
```

**baseline——先写头再迭代，头已发之后的错误只能空 `res.end()`：**

```ts
const { events } = await streamChat(provider, request.messages);
res.writeHead(200, SSE_HEADERS);           // 先写 200 头
for await (const event of events) { ... }  // 中途 401/429 已无法返回错误状态码
// catch: if (res.headersSent) { res.end(); return; }   // 不输出归一化错误事件
```

**为什么**：流式请求若上游在第一个 chunk 前返回 401/429，baseline 因 200 头已发出只能空结束（客户端拿到空 200，误以为成功）；oracle 先取第一个 chunk 成功再写头，初始失败能返回标准 JSON 错误。judge 扣分原话："mid-stream failures after headersSent are not logged and no normalized error"。

## 差异 4：每个请求（含失败）都记账吗（judge `usage-metering` 20/20 vs 15/20）

**oracle——成功和失败都记：**

```ts
// oracle rep1 server.ts：三处 recordUsage（非流式成功 / 流式成功 / catch 失败）
await recordUsage({ provider, model, stream: false, latencyMs, promptTokens, completionTokens, cost, status: 200, ... });
// ... 流式成功后 recordUsage(...)
catch (error) { ... await recordUsage({ ... status: domain.status }); }   // 失败也记
```

**baseline——流式中途失败不记（headersSent 后直接 return），聚合只在内存、不重建 JSONL：**

```ts
catch (error) {
  if (res.headersSent) { res.end(); return; }   // 流式失败这里直接 return，跳过 logRequest
  // ...
  if (provider) { await logRequest(makeRecord(provider, false, { promptTokens: 0, completionTokens: 0 }, 0, ..., domain.status)); }
}
// usage.ts：聚合只在内存；GATEWAY_LOG_PATH 仅写入时 append，不重建
```

**为什么**：practice 卡第 4 条要求"用量/耗时观测集中在边界统一做，不在各供应商路径里重复"；judge `usage-metering` 要求 "every request (including failures)" 都被记录并可用于聚合。oracle 失败也进账，baseline 流式失败丢账。

## 差异 5：有没有"统一客户端契约"类型（探针 R1）

- **oracle**：`src/types.ts` 声明 `ProviderClient` interface，含 `chat()` 和 `stream()` 两个方法 → 探针 R1（至少两个方法的统一契约）命中。
- **baseline**：无此类接口，服务层直接调用两个裸函数集 → 探针 R1 不命中（baseline not-observed 的硬性原因之一）。

## 这些差异怎么变成分数（flash 轮 rubric，总分 100）

| 维度（max） | oracle（96/100 那次的理由） | baseline（82 那次的扣分） |
| --- | --- | --- |
| provider-adapter-boundary (25) | 25/25：HTTP/解析全在适配器，server 只调统一契约 | 25/25（该 baseline 适配器也隔离了） |
| raw-error-containment (20) | 20/20：固定文案，不透传 body/message | 13/20：`error.message` 原样进响应 |
| streaming-sse-correctness (20) | 20/20：头前先 next、中途失败归一化 | 15/20：先写头、中途失败空 end |
| usage-metering (20) | 20/20：成功+失败全记账+JSONL | 15/20：流式失败不记账、仅内存聚合 |
| contract-and-test-compliance (15) | 15/15 | 14/15：未文档化 `message` 字段 |

**注意**：judge 分数只能看"同轮内条件间相对差异 + rationale"（v4-pro 与 flash 两轮 rubric 不同，跨轮不可直接比）；探针（observed/not-observed）才是 joint-pass 的判定者——baseline rep2 即使 judge 82、功能全过，探针仍判 not-observed → joint=false。即：**功能对 ≠ 按团队规范做**，这正是 Practice 注入要测的增量。

## 数据来源

- 逐条 judge rationale：`scratch/judge-criteria-dump.txt`（15 个 attempt 全量）。
- 每次 attempt 原始依据：`judge.sidecar.json`、`evaluator.stdout.log`、workspace `src/`。
- 关联结果表：`verification/diagnostic-results-flash.md`。