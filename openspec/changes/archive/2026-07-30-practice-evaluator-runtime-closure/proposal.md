## Why

#117 的 evaluator-only 重放确认两个 `injection-calibration/v1` candidate 的当前
private calibration 无法在各自 materialized runtime 中解析 TypeScript。解析器隐式
来自仓库根目录或宿主环境时，runtime 故障会被观察为 Practice 结果不确定，阻断 #91 的
独立准入检查。

本变更为 #122 固定 evaluator/calibration runtime 的可复现依赖闭包，使健康结果只由
candidate 的版本化、完整性受保护的输入决定。

## What Changes

- 为 Practice candidate 的 evaluator/calibration runtime 定义版本化依赖闭包、解析根和
  离线可重建要求。
- 要求 runtime 在 clean materialized 环境中拒绝缺失、篡改、版本不匹配或越界的依赖，且
  不向上搜索宿主仓库依赖或采用全局 Bun/Node 状态。
- 将 runtime 执行失败与 evaluator 正常完成后的 semantic/probe 结果继续分开报告。
- 增加对两个现有 candidate 的隔离校准及 public/private 边界回归覆盖。

## Capabilities

### New Capabilities

- `practice-evaluator-runtime-closure`: 定义 Practice candidate evaluator/calibration
  runtime 的可重现依赖闭包、完整性校验和 clean-environment 行为。

### Modified Capabilities

- `practice-benchmark-boundaries`: 将 evaluator runtime 输入纳入 Practice candidate 的
  私有边界，禁止宿主依赖回退与私有材料泄露。
- `profile-diagnostic-evaluator-health`: 明确 runtime 执行失败不得成为 `evaluated` 或
  覆盖正常 evaluator 的 semantic/probe 维度。

## Impact

- `incubator/practice-injection` 中两个 `injection-calibration/v1` candidate 的 private
  calibration runtime 声明与可重建输入。
- `src/benchmark/kernel` 与 `src/benchmark/runner/pi/v2` 的 runtime 解析、校准和健康测试。
- 范围仅为 #122。不会修改公开题面、starter 的可观察行为、Practice、条件、oracle、评分
  语义、历史 workspace 或 #117 的历史解释；不会调用 Pi、模型或 retrieval，也不会创建
  正式 record 或 suite revision。
