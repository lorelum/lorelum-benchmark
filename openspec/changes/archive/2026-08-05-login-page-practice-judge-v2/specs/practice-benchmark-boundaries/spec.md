## MODIFIED Requirements

### Requirement: 硬门槛与 Practice 质量信号分开报告
系统 MUST 将公开任务的语义结果、Practice/JudgeAgent 质量信号与 evaluator/execution health 分开记录和解释。语义失败、公开接口不兼容、public/private 泄露或生命周期违规 MUST 使尝试无效或任务失败。质量信号失败或 `judge-unavailable` MUST 在语义通过时报告为未观察到对应质量或判分不可用，不得改写为功能失败。质量信号必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

本 requirement 适用所有当前与未来 candidate，并受仓库级 `benchmark-outcome-contract` 约束：任务完成仅由 `semantic=pass` 决定；`joint_pass` 仅为 `semantic=pass` 且质量 `observed` 的派生报告字段，不得作为任务完成、 evaluator health 或加权总分。原始分数、probe 分值、计划分母与失败原因 MUST 保留；不得引入隐藏加权总分。Practice-effect 的连续分数（如 JudgeAgent sidecar）MUST 只包含与被测 Practice 直接对应的职责证据；功能、UI、表单和其他无关质量 MUST 作为独立字段报告，不得混入该分数。

Practice-injection diagnostic 中的 `evaluated` 还 MUST 表示 evaluator 进程已成功完成并输出完整结构化结果。若 evaluator 无法启动、超时或以非零退出码结束，尝试 MUST 记录为非健康评测，不得用于条件比较。以 outcome 契约表达的结果中，完成状态无法可靠判定时 MUST 记录为 `indeterminate` 并保留审计原因；非健康与 `indeterminate` 尝试不得静默从条件分母剔除、改记为质量信号缺失或计作任何通过/观测分子。Practice 质量 probe 或 Judge 分析无法解析相关导入或数据流时 MUST 记录 `indeterminate`，不得默认判为通过或 `not-observed`。

#### Scenario: 功能正确但质量信号缺失
- **WHEN** 候选通过所有公开语义测试但未满足一个 Practice 质量 probe
- **THEN** 结果 MUST 记录语义通过和质量信号失败，并且不得将该次尝试表述为任务功能失败

#### Scenario: Judge unavailable
- **WHEN** 一次健康运行中 JudgeAgent provider 未产出质量信号
- **THEN** 结果 MUST 记录质量状态为 `judge-unavailable`，任务完成仍由语义硬门槛决定，且不得把 `judge-unavailable` 表述为候选质量缺失

#### Scenario: 无关质量不进入 Practice 分数
- **WHEN** 候选的 UI、表单或通用可访问性信号发生变化但 API 分层职责不变
- **THEN** Practice-effect 分数 MUST 保持不变，并在独立质量字段中报告变化

#### Scenario: 等价实现或分析不确定
- **WHEN** 两个候选在被测职责上等价但使用不同语法，或 probe 无法解析相关模块图
- **THEN** 等价实现 MUST 得到相同职责判断；无法可靠分类时 MUST 记录 `indeterminate` 及稳定原因，不得伪造通过或负面证据
