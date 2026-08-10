# 网关加个 Anthropic

把 Anthropic 接进来，OpenAI 和 Anthropic 两家都得能对话，流式（SSE）也要支持。
每个请求记下 token 用量和费用，能按模型查汇总。

DeepSeek 之后也要加，是 OpenAI 兼容的。
Key 不对、限流这种，报错给个正常提示，别把上游的原始报错原样抛出去。

接口契约按仓库里的接口文档来，别自己改规则。改完跑下测试。