## Why

Issue #132: 仓库已有 Practice benchmark 的局部约定（`evaluator-result/v2`、profile diagnostic summary、run record），但没有统一契约区分运行是否健康、任务功能是否完成和代码质量是否达标。登录页 candidate 已暴露这些维度容易混用的问题。需要一份仓库级 outcome 契约，把 execution health、语义硬门槛、JudgeAgent/Practice 质量软信号和派生 joint_pass 的关系与表达位置一次说清。

## What Changes

- 定义仓库级 outcome 契约：execution health（成功/失败/不确定）、公开产品语义硬门槛、JudgeAgent/Practice 质量软信号、派生 `joint_pass`，并规定它们在 evaluator result、summary、record 中的表达方式。
- 规定 `joint_pass` 只能是派生报告字段，不得作为任务完成、evaluator health 或加权总分。
- 保留原始分数、probe 分值、计划分母和失败原因；禁止引入隐藏加权总分。
- JudgeAgent 结果采用新版本 schema 或独立 sidecar，不静默扩展 `evaluator-result/v2`（推荐 sidecar，待规划确认）。
- 更新 `docs/` 与对应 OpenSpec capability，作为所有当前与未来 candidate 的强制契约。
- **BREAKING（仅契约层）**：任何无法用 `evaluator-result/v2` 表达的新状态必须显式采用新版本或 sidecar；现有 v2 消费方保持可解释。

## Capabilities

### New Capabilities

- `benchmark-outcome-contract`: 定义仓库级 outcome 契约——execution health、语义硬门槛、质量软信号、派生 `joint_pass` 的独立状态与 schema 表达规则。

### Modified Capabilities

- `practice-benchmark-boundaries`: 强化"硬门槛与质量信号分开报告"，纳入 JudgeAgent 软评分与 `judge-unavailable` 状态，并把该分离升级为仓库级强制契约。

## Impact

- 契约/文档：`docs/BENCHMARK_PROTOCOL.md`、`docs/PRACTICE_BENCHMARK_GUIDE.md`、`docs/PI_RUNNER.md` 与相关 schema 说明。
- Schema：新增 JudgeAgent 结果 schema（新版本或 sidecar，按规划确认）；不改写 `evaluator-result/v2` 的既有行为。
- 代码：仅当需要表达新状态时，在 `src/benchmark/` 增加断言与聚焦测试；不触碰冻结 evaluator helper 或 runner 行为。
- 范围：#132。不产生 candidate、snapshot、模型运行或 record；不修改登录 candidate 或 #91/#125 结果；不规定 reference 文件路径、helper 名称或布局。
