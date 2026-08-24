## Why

Implements #182.

#178 三条件 pilot 已判定 `diagnostic-only`：judge 主判据下 oracle 100/100/100、irrelevant 100/100/100、baseline 0/100/indeterminate，oracle 与 irrelevant 无差异。根因两条叠加：

1. **任务没有 headroom**：v3 公开 starter 已含 `openai.ts/server.ts/types.ts` + 22 条测试，task.md 写清全部行为，25 分钟内 flash 模型可完成到满分；baseline（无任何注入）也有 attempt 写出 100 分完整实现 → practice 增量无从体现。
2. **judge rubric 对 Practice 盲**：`judge-agent/generic/v2` 的 rubric 只从 `task.md` 生成，看不到注入的 Practice 内容；criterion 全部是"功能是否完整"，没有一条度量"是否按 Practice 结构纪律实现" → 只要功能做完就全 100。

需求方确认采用方式 B：扩展 judge provider 输入，把注入的 oracle Practice 文本喂给 rubric 生成（另立版本号，不改冻结 `generic/v2`），并把通过校准的 rubric 固化为 candidate 私有版本化 scoring artifact。

## What Changes

- 新建 `judge-agent/practice-aware/v1`：支持声明绑定的 `practice_text` 输入，rubric 生成 prompt 同时包含 `task.md` 与 oracle Practice 文本；支持 candidate 声明的固定 rubric 与 SHA-256 绑定；Practice dimensions 使用 full/partial/zero scoring anchors；模型只输出逐 anchor 结论与证据，provider 机械推导 partial/zero 上限约束下的 criterion 分数。不修改冻结 `judge-agent/generic/v1/v2`。
- 修改 stable `judge-agent-rubric-scoring` 输入契约：保留默认 public-only fail-closed 规则，新增仅限 practice-aware v1 的 oracle Practice / fixed rubric 窄例外；路径与 hash 必须与 `private/conditions.yaml` 一致。
- 重做 `incubator/practice-injection/llm-provider-gateway-v3/`：公开题面只声明基本行为；starter 保留结构缺口；public starter 作为 semantic-fail/indeterminate 诊断样本，judge 判别使用 semantic-pass 的 `baseline-policy-scatter` fixture。
- 校准输出保留 sample state、criterion 分数、anchor 证据与 rationale，不把 indeterminate 合成 0 分；固定 rubric artifact 与 hash 用于未来运行绑定。
- 不调用 candidate 模型、不创建正式 record、不升级 suite revision、不修改 v1/v2 candidate 与历史结果；显式 opt-in 的真实 judge 校准是唯一模型调用例外。

## Capabilities

### New Capabilities

- `judge-agent-practice-aware-rubric`: 定义 Practice-aware rubric provider 的声明绑定、同尺子、criterion 级校准证据与 fail-closed 要求。
- `llm-provider-gateway-v3-practice-judge`: 定义重做后 v3 candidate 的公开/私有边界、scaffold/baseline fixture 职责、判别力验证与当前决策规则边界。

### Modified Capabilities

- `judge-agent-rubric-scoring`: 修改“输入只含公开材料”要求，窄化授权 practice-aware v1 读取 candidate 声明的 oracle Practice 与固定 rubric，并保持其他 judge public-only。

## Impact

- 新增 `src/benchmark/judge/judge-agent/practice-aware/v1/` provider、声明解析、校准聚合与测试。
- 重做 `incubator/practice-injection/llm-provider-gateway-v3/` 的 public/private 内容与 snapshot。
- 更新 `docs/BENCHMARK_PROTOCOL.md` 与 `docs/PI_RUNNER.md` 的 JudgeAgent 输入例外。
- 不影响 `llm-provider-gateway-v1/v2`、其 snapshot、已有 pilot 结果或 suite/treatment/record。\n