## Why

Issue #133：仓库缺少可复用的 JudgeAgent 软质量评分能力。目前只有 candidate 私有
probe 和确定性 quality probe，没有统一的 judge 输入、输出、脱敏和 provenance
契约。JudgeAgent 不能绑定登录页，也不能把某个 Practice 的私有断言硬编码进
基础设施。前置依赖 #132 已建立 `judge-result/v1` sidecar 基础与 outcome 契约，
本 change 在其上提供 provider、输入构造、结构化输出和失败分类。

## What Changes

- 完善版本化 `judge-result/v1` 契约为完整软评分结果：记录 judge model/version、
  prompt hash、rubric hash、input hash、状态、维度分数、理由和 confidence。
- 新增 `src/benchmark/judge/`：provider 接口、输入构造、脱敏、结构化输出校验与
  失败分类；提供 mock provider，CI 默认不调用外部模型。
- 输入 allowlist：只允许公开 task、candidate diff/source 与声明的公开运行材料；
  去除 condition、Practice、Oracle、私有 evaluator 和私有路径。
- 允许新任务把 judge 结果作为可选 quality artifact 引用（独立、版本化 sidecar）。
- JudgeAgent 只产生软质量信号，不得改变语义硬门槛；`evaluator-result/v2` 不改写。
- **BREAKING（契约完善，仅对未消费的 v1）**：`judge-result/v1` 增加 provenance
  必填字段；若按确认口径选择新版本则改为 `judge-result/v2`，v1 冻结。

## Capabilities

### New Capabilities

- `judgeagent-soft-scoring`: 定义 JudgeAgent 的输入 allowlist、脱敏、provider 契约、
  结构化输出、provenance 与失败分类，以及 mock 提供方式。

### Modified Capabilities

- `benchmark-outcome-contract`: 扩展 `judge-result/v1`（或新增 v2）契约为完整
  软评分能力，明确 provenance 必填与 sidecar 引用方式。

## Impact

- Schema：`schemas/judge-result-v1.schema.json`（扩展或新增 v2，按规划确认）。
- 代码：新增 `src/benchmark/judge/`（provider、输入构造、mock、脱敏、失败分类）与
  聚焦测试；不改写 `evaluator-result/v2`、冻结 helper 或现有 runner 行为。
- 文档：`docs/BENCHMARK_PROTOCOL.md`、`docs/PI_RUNNER.md` 补充 judge 能力说明。
- 范围：#133，依赖 #132。不产生 candidate、snapshot、模型运行或正式 record；
  不实现登录页专用 rubric；不在 CI 执行真实外部模型评分。
