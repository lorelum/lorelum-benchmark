## Why

#178 三条件 pilot 已判定 `diagnostic-only`：judge 主判据下 oracle 100/100/100、irrelevant 100/100/100、baseline 0/100/indeterminate，oracle 与 irrelevant 无差异。根因两条叠加：

1. **任务没有 headroom**：v3 公开 starter 已含 `openai.ts/server.ts/types.ts` + 22 条测试，`task.md` 写清全部行为，25 分钟内 flash 模型可完成到满分；baseline（无注入）也有 attempt 写出 100 分完整实现 → practice 增量无从体现。
2. **judge rubric 对 Practice 盲**：`judge-agent/generic/v2` 的 rubric 只从 `task.md` 生成（`rubricUserPrompt(taskMd)`），看不到注入的 Practice 内容；criterion 全部是"功能是否完整"，没有一条度量"是否按 Practice 结构纪律实现" → 只要功能做完就全 100。

需求方确认采用方式 B：扩展 judge provider 输入，把注入的 Practice 文本一并喂给 rubric 生成（需另立版本号，不改冻结 `generic/v2`）。

## What Changes

- 新建 `judge-agent/practice-aware/v1`：在 `generic/v2` 基础上增加可选 `practice_text` 输入，rubric 生成 prompt 同时包含 `task.md` 与 Practice 文本，使 rubric criterion 显式度量 Practice 结构遵循度。不修改冻结 `judge-agent/generic/v1/v2`。
- 重做 `incubator/practice-injection/llm-provider-gateway-v3/`（直接在现有目录上改，保留 candidate lifecycle，不创建第二份可变归档副本）：
  - `task.md` 只声明被测 Practice 的基本行为要求，细化结构约定由 Practice 提供（`project-convention/v1` 条件化注入）。
  - `public/starter` 故意留结构缺口：保留传输 adapter 与 API 文档，移除预置领域翻译/策略/账本边界，baseline 能过基本功能但拿不到结构分，oracle 按 Practice 补上缺口拿高分。
  - 公开测试经 stub 拦截，不依赖产品内埋点。
  - candidate `conditions.yaml` 的 judge 声明改为 `judge-agent/practice-aware/v1`。
- 更新 private calibration matrix、probe、snapshot 与验证证据，确保 reference/equivalent 高分、anti-pattern/docs-present 低分且有判别差距。
- 不创建正式 record、不升级 suite revision、不修改 v1/v2 candidate 与历史结果。

## Capabilities

### New Capabilities

- `judge-agent-practice-aware-rubric`: 定义 Practice-aware rubric 生成 judge provider 的通用要求——可选 Practice 输入、rubric 同时覆盖任务行为与 Practice 结构纪律、三条件同尺子、不改变语义判定。
- `llm-provider-gateway-v3-practice-judge`: 定义重做后 v3 candidate 的公开/私有边界、结构缺口设计、Practice-aware judge 校准与判别力验证要求。

### Modified Capabilities

无。`judge-agent-rubric-scoring`、`practice-structure-probe-calibration`、`practice-injection-candidate-v2` 等 stable specs 保持不变。

## Impact

- 新增 `src/benchmark/judge/judge-agent/practice-aware/v1/`（provider/rubric/score/llm）与单元测试。
- 重做 `incubator/practice-injection/llm-provider-gateway-v3/` 的 public/private 内容与 snapshot。
- 不影响 `llm-provider-gateway-v1/v2`、其 snapshot、已有 pilot 结果或 suite/treatment/record。
- 不调用模型、不创建正式 record、不进入默认 suite。
