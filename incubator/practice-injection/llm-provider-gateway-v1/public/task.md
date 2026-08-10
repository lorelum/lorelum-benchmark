# 网关加个 Anthropic

把 Anthropic 接进来，OpenAI 和 Anthropic 两家都得能对话，流式（SSE）也要支持。
每个请求记下 token 用量和费用，能按模型查汇总。
之后 DeepSeek 也要加，希望到时候不用改代码。
Key 不对、限流这种，报错给个正常提示。
接口契约看 docs/gateway-api.md。改完跑下测试。