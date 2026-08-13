## Why

#170 承接 #168 的共享 judge 判别力缺口：`judge-agent/generic/v1` 的自动 rubric 对“功能全对但结构反模式”的跨请求/后端政策类实现缺乏区分度（v2 gateway 校准中 anti-pattern 72 > reference 66），且对 LLM 输出的 `confidence` 等数值字段过严，导致真实校准不稳定。该优化应通用化，而不只修补 v2 样例。

## What Changes

- 扩展 `judge-agent/generic/v1` 的 rubric quality guideline，纳入跨请求/后端政策维度（fallback 归属、retry 单次计费、租户预算原子性、幂等、流式失败记账、集中账本/观测、伪兼容协议映射），并保留现有前端分层维度。
- 增强 judge 输出解析：对 `confidence` 与 criterion `points` 做稳健的有限数值归一（数字/数字字符串、round、0-100 约束），非关键格式抖动不再触发 fail-closed，仍拒绝缺失/非法结构化字段。
- 支持固定 rubric 复用：`judge-agent/generic/v1` 在 `LORELUM_JUDGE_RUBRIC_TEXT` 提供时优先使用该 rubric 文本（校验并记录 hash），否则仍按任务生成；默认行为不变。
- 增加 gateway-style judge 校准/回归测试，覆盖 anti-pattern 低于 reference、equivalent 接近 reference，以及 confidence 归一化用例。
- 不改变 `judge-result/v1` 契约、语义判定规则与 `.env` 安全边界。

## Capabilities

### New Capabilities

- `judge-agent-rubric-optimization`: 定义 `judge-agent/generic/v1` 的 rubric 生成、结果解析与固定 rubric 复用优化要求，覆盖跨请求/后端政策判别力与真实 LLM 输出稳定性。

### Modified Capabilities

- `judge-agent-rubric-scoring`: 扩展 rubric 生成判据与输出解析规则，增加跨请求/后端政策维度、数值归一与固定 rubric 输入，保持既有向后兼容。

## Impact

- `src/benchmark/judge/judge-agent/generic/v1/`（rubric / score / provider / llm）与相关测试。
- 可能影响所有声明 `judge-agent/generic/v1` 的 candidate；需用现有前端 candidate + `llm-provider-gateway-v2` 做回归校准。
- 不改变语义完成判定、不创建 record、不升级 suite。
