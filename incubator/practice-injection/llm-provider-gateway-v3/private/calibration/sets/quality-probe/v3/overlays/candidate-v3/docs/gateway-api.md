# 网关接口说明

客服网关对外暴露两个接口：对话与用量查询。供应商接入通过环境变量配置，见下文「供应商配置」。

## POST /api/chat

请求体：

```json
{
  "messages": [{ "role": "user", "content": "你好" }],
  "max_tokens": 256,
  "stream": false
}
```

- `messages`：消息列表，角色为 system / user / assistant。
- `max_tokens`：预算控制时必填；网关按它预占额度，完成后按实际费用结算。
- `stream`：可选，默认 `false`。为 `true` 且请求头 `Accept: text/event-stream` 时，返回 SSE 流。

请求头：

- `x-tenant-id`：租户 id，默认 `default`。
- `idempotency-key`：可选。相同租户内，相同 key 且请求体相同返回首次结果；相同 key 但请求体不同返回 409。

非流式响应（200）：

```json
{
  "content": "回复文本",
  "provider": "openai",
  "model": "gpt-4o",
  "usage": { "promptTokens": 10, "completionTokens": 5 },
  "cost": 0.000075
}
```

SSE 流式响应：`content-type: text/event-stream`。每个文本增量是一个 `data:` 事件：

```
data: {"choices":[{"delta":{"content":"你"}}]}
data: {"choices":[{"delta":{"content":"好"}}]}
```

流结束时，最后一条 `data:` 事件携带归一化用量、费用与实际供应商：

```
data: {"usage":{"promptTokens":10,"completionTokens":5},"cost":0.000075,"provider":"openai","model":"gpt-4o"}
```

如果流已经发送部分内容后才失败，最后发送终止错误事件并结束：

```
data: {"error":{"code":"rate_limited"}}
```

## GET /api/usage

可选查询参数：`tenant`、`model`、`status`。返回：

```json
{
  "byModel": {
    "gpt-4o": {
      "requests": 2,
      "promptTokens": 20,
      "completionTokens": 10,
      "totalCost": 0.00015,
      "avgLatencyMs": 312,
      "maxLatencyMs": 400
    }
  },
  "byTenant": {
    "acme": {
      "requests": 2,
      "totalCost": 0.00015,
      "budget": 0.01,
      "remainingBudget": 0.00985
    }
  }
}
```

## 错误

接口统一返回领域错误，不直接透传上游原始报文：

| 场景 | HTTP 状态 | error |
| --- | --- | --- |
| API Key 无效 | 401 | `authentication_failed` |
| 上游限流 | 429 | `rate_limited` |
| 上游超时 | 504 | `upstream_timeout` |
| 租户预算不足 | 402 | `budget_exceeded` |
| 幂等 key 与不同请求体冲突 | 409 | `idempotency_conflict` |
| 供应商未配置 | 400 | `unsupported_provider` |
| 请求体不合法 | 422 | `invalid_request` |
| 其他上游错误 | 502 | `upstream_error` |

## 供应商配置

全部通过环境变量配置，注册表是开放的：任意 `NAME_MODEL / NAME_API_KEY / NAME_BASE_URL / NAME_PRICE_IN / NAME_PRICE_OUT` 一组变量即注册一个供应商；当前生效的供应商由 `GATEWAY_ACTIVE_PROVIDER` 指定。

| 变量 | 说明 |
| --- | --- |
| `GATEWAY_ACTIVE_PROVIDER` | 当前生效供应商名，默认 `openai` |
| `GATEWAY_FALLBACK_PROVIDER` | 可选；主供应商 429/5xx/超时失败后使用的供应商名 |
| `GATEWAY_RETRY_ATTEMPTS` | 同供应商可重试次数，默认 1 |
| `BUDGET_<TENANT>` | 该租户的 USD 总预算 |
| `<NAME>_PROTOCOL` | 协议：`openai`（OpenAI 兼容，默认）、`anthropic`、`nebula` |
| `<NAME>_MODEL` | 模型名 |
| `<NAME>_API_KEY` | API Key |
| `<NAME>_BASE_URL` | 供应商 API 根地址 |
| `<NAME>_PRICE_IN` | 每百万输入 token 的美元单价 |
| `<NAME>_PRICE_OUT` | 每百万输出 token 的美元单价 |

示例价目表（测试环境用同一套）：openai gpt-4o 输入 $2.5/1M、输出 $10/1M；deepseek-chat 输入 $0.27/1M、输出 $1.1/1M；anthropic claude-sonnet 输入 $3/1M、输出 $15/1M；nebula 输入 $1/1M、输出 $4/1M。

## 费用与预算

费用 = 输入 tokens / 1_000_000 × 输入单价 + 输出 tokens / 1_000_000 × 输出单价，结果保留 6 位小数（四舍五入）。

启用租户预算后，`max_tokens` 按注册表中最高输出单价预占；预占不足时返回 402。请求完成后用实际费用结算，并释放预占差额。一个逻辑请求（含重试/降级的所有传输尝试）只产生一条账本记录；失败尝试不计费用，但重试次数会记录在日志里。

每个逻辑请求的用量、耗时、费用与状态写入结构化请求日志（`GATEWAY_LOG_PATH` 指向 JSONL 文件时落盘），字段包含 `tenant / provider / model / trace_id / retry_count / status / cost / latency_ms`，并可用于 `/api/usage` 聚合。
