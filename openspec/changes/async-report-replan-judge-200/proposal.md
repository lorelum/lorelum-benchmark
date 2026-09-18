## Why

Issue #200（https://github.com/lorelum/lorelum-benchmark/issues/200）需要为异步报表时机 MVP 提供任务专用、对 condition 和投放时点盲化的 JudgeAgent 软评分。现有 `judge-agent/generic/v2` 只接收 task、最终 candidate diff/source 和 rubric，无法可靠观察 Agent 在约束补充后是否重审假设、计划、实施范围和验证证据；直接使用 Pi raw transcript 又会暴露 System prompt、thinking、Practice 内容、condition 和 private provenance。

本 change 同时是 Issue #209（https://github.com/lorelum/lorelum-benchmark/issues/209）的第一个版本化实例。它只实现本任务固定的 `llm-subjective` 方法、evidence、rubric、calibration 和结果边界，不实现通用评估规划、方法选择或工具代码起草；后续 #209 应通过显式 adapter 消费本 change 的 artifact，而不是重写其评分语义。

## What Changes

- 新增任务专用 `async-report-replan-judge` capability，定义固定 evaluation plan、评分目标、盲化、校准、失败和预算边界。
- 新增确定性的 `replan-evidence/v1` 投影，只从公开任务、用户约束、assistant 可见输出、脱敏工具行为和最终 candidate diff 生成 Judge 可读证据；不直接读取 Pi raw transcript，不包含 System prompt、thinking/reasoning、raw tool result、Practice 正文、condition、delivery node、Pack provenance、Practice ID、session id 或私有路径。
- 使用稳定 `blind_case_id` 对 Judge 隐藏 condition/timing 映射；真实映射只由评分后的确定性编排层 join。
- 新增固定 rubric 和任务专用 Judge provider，评价旧假设失效、计划修订、实施范围/兼容策略调整、验证证据更新及未覆盖风险；不重新判断异步报表语义正确性。
- 新增 Judge 专用 reference / equivalent / surface-only anti-pattern calibration，验证判别力并避免偏好 reference 的叙述结构或文件布局。
- 新增任务专用结果/provenance envelope，记录 plan、evidence、rubric、prompt、input hash、provider/model、calibration identity、失败状态与独立成本；不静默扩展 `judge-result/v1`。
- 保留 mock/CI 与显式 opt-in 真实 Judge 路径，CI 不调用真实模型；Agent 运行、hard evaluator、Judge calibration 与 Judge scoring 成本分账。
- 在 design 中记录 #209 兼容和迁移映射：本 change 的固定 plan、evidence、rubric、calibration 和结果边界预计保留，未来由 #209 选择或组合。

## Capabilities

### New Capabilities

- `async-report-replan-judge`: 定义异步报表重审质量的固定 LLM 软评分、公开安全 evidence projection、盲化、校准、provenance 和独立预算契约。

### Modified Capabilities

无。现有 `judgeagent-soft-scoring` 的 public-only allowlist、软信号隔离、fail-closed、mock/CI 和 provenance 规则继续适用；本 change 只复用这些规则增加任务专用实现，不改写 `judge-agent/generic/v1`、`generic/v2` 或 `judge-result/v1`。

## Impact

- 预计新增 `src/benchmark/judge/async-report-replan/v1/` 下的 evaluation plan、evidence projection、rubric/provider、calibration、result/accounting 和 focused tests。
- 预计新增 `schemas/async-report-replan-evidence-v1.schema.json` 与任务专用结果/provenance schema；不会修改共享 `judge-result-v1.schema.json`。
- 预计新增 sibling private calibration package（例如 `incubator/practice-injection/async-report-replan-judge-v1/private/`）及其 snapshot，避免修改 #196 candidate 的冻结文件集合或 #197 anchor。
- #196 public task/starter、#197 staged runner、#199 treatment、#202 deterministic evaluator、suite revision、正式 record 和模型运行均不在本 change 内修改或创建。
- 初始 PR 仅包含本 OpenSpec change artifacts；strict validation 和初始 PR 完成后，按仓库流程先进行实现前规划确认，再开始任何非 OpenSpec 实现。
