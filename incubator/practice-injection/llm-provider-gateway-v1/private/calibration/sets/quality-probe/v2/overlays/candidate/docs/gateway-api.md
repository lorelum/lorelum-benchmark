# 网关接口说明

客服网关对外暴露两个接口：对话与用量查询。供应商接入通过环境变量配置，见下文「供应商配置」。

## POST /api/chat

请求体：

```json
{
  "messages": [{ "role": "user", "content": "你好" }],
  "stream": false
}
```

- `messages`：消息列表，角色为 system / user / assistant。
- `stream`：可选，默认 `false`。为 `true` 且请求头 `Accept: text/event-stream` 时，返回 SSE 流。

非流式响应（200）：

```json
{
  "content": "回复文本",
  "usage": { "promptTokens": 10, "completionTokens": 5 },
  "cost": 0.000075
}
```

SSE 流式响应：`content-type: text/event-stream`，每个 `data:` 块携带一段增量文本，最后一条 `data:` 块携带 `{"usage": {...}, "cost": ...}` 并结束。

## GET /api/usage

返回按模型聚合的用量与费用：

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
| 供应商未配置 | 400 | `unsupported_provider` |
| 请求体不合法 | 422 | invalid_request |
| 其他上游错误 | 502 | upstream_error |

## 供应商配置

全部通过环境变量配置，注册表是开放的：任意 `NAME_MODEL / NAME_API_KEY / NAME_BASE_URL / NAME_PRICE_IN / NAME_PRICE_OUT` 一组变量即注册一个供应商；当前生效的供应商由 `GATEWAY_ACTIVE_PROVIDER` 指定。

| 变量 | 说明 |
| --- | --- |
| `GATEWAY_ACTIVE_PROVIDER` | 当前生效供应商名，默认 `openai` |
| `<NAME>_PROTOCOL` | 协议：`openai`（OpenAI 兼容，默认）或 `anthropic` |
| `<NAME>_MODEL` | 模型名 |
| `<NAME>_API_KEY` | API Key |
| `<NAME>_BASE_URL` | 供应商 API 根地址 |
| `<NAME>_PRICE_IN` | 每百万输入 token 的美元单价 |
| `<NAME>_PRICE_OUT` | 每百万输出 token 的美元单价 |

示例价目表（测试环境用同一套）：openai gpt-4o 输入 $2.5/1M、输出 $10/1M；deepseek-chat 输入 $0.27/1M、输出 $1.1/1M；anthropic claude-sonnet 输入 $3/1M、输出 $15/1M。

## 费用计算

费用 = 输入 tokens / 1_000_000 × 输入单价 + 输出 tokens / 1_000_000 × 输出单价，结果保留 6 位小数（四舍五入）。每个请求的用量、耗时、费用与状态写入结构化请求日志（`GATEWAY_LOG_PATH` 指向 JSONL 文件时落盘），并可用于 `/api/usage` 聚合。