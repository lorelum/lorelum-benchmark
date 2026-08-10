# 给客服网关接入 Anthropic，并补上用量和费用统计

客服网关现在只接了 OpenAI。Ops 那边要把成本打下来，还要做容灾，所以要求接入 Anthropic；
另外 DeepSeek 这类和 OpenAI 协议兼容的服务，以后希望能只改配置就切过去，不用动代码。

具体希望：

- 接好 Anthropic 后，OpenAI 和 Anthropic 都能正常对话，流式（SSE）也要支持
- 通过配置切换供应商 / 模型 / Key，OpenAI 兼容的（比如 DeepSeek）不改代码
- 每个请求能记录 token 用量、耗时和估算费用，并能按模型查汇总
- 调用上游出错（Key 无效、限流）时，接口返回统一的、人能看懂的领域错误

接口契约见 `docs/gateway-api.md`。改完跑一下测试确认没坏。