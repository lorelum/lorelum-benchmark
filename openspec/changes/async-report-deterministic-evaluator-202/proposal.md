## Why

异步报表 Practice 时机实验目前只有公开 starter 与公开测试，不能在不依赖 LLM 的前提下稳定判定候选是否真正满足生命周期、检查点恢复、旧新并行和回退安全语义。Issue #202 需要一个独立于 Pack 来源、Practice 投放节点和 JudgeAgent 的确定性 hard gate，避免把 Agent 自述或软评分当作任务完成证据。

## What Changes

- 为 `incubator/practice-injection/async-report-lifecycle-v1/` 增加版本化 private deterministic evaluator、稳定检查标识和机器可读结果。
- 建立 private reference、equivalent 与 negative/mutation 行为夹具及 provenance manifest，证明 evaluator 判定的是外部可观察语义，而不是目录、类名、模块布局或参考实现偏好。
- 覆盖 queued/processing/completed/failed、进度持久化、检查点暂停/继续、旧新 API/worker 并行、未知字段保留、回退 fail-closed 和损坏/不可兼容状态不覆盖原数据等硬语义。
- 固定 evaluator 与 #196 candidate commit、snapshot id 和私有 evaluator source identity 的绑定；同一 hard gate 必须在全部 timing condition 下复用，且不读取 Practice provenance、delivery node 或 Judge 材料。
- 增加 public/private 泄露审计、negative/mutation calibration 和 deterministic validation 入口；不调用模型、不创建正式 record、不冻结 suite revision。

## Capabilities

### New Capabilities

- `async-report-deterministic-evaluation`: 定义异步报表 candidate 的 private 确定性 hard gate、行为夹具校准、结果契约、身份绑定、条件盲化和失败/不确定语义。

### Modified Capabilities

- 无。本 change 不改写 `async-report-lifecycle-candidate` 已冻结的公开 starter 行为；它只在 candidate 的 private 边界内增加 evaluator 与行为证据。

## Impact

- 主要影响 `incubator/practice-injection/async-report-lifecycle-v1/private/`。
- 可复用 evaluator 机制如确需变更，只在 `src/benchmark/` 下新增版本化 helper；不得改写既有冻结 helper。
- 不修改 public task/starter、#197 staged runner、#199 treatment、#200 JudgeAgent 或 active suite manifest。
- 不产生模型调用、正式 record、正式 suite revision 或 timing 效果结论。
