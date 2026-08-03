## MODIFIED Requirements

### Requirement: 硬门槛与 Practice 质量信号分开报告

系统 MUST 将公开任务的语义结果、Practice/JudgeAgent 质量信号与 evaluator/execution health 分开记录和解释。语义失败、公开接口不兼容、public/private 泄露或生命周期违规 MUST 使尝试无效或任务失败。质量信号失败或 `judge-unavailable` MUST 在语义通过时报告为未观察到对应质量或判分不可用，不得改写为功能失败。质量信号必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

本 requirement 适用所有当前与未来 candidate，并受仓库级 `benchmark-outcome-contract` 约束：任务完成仅由 `semantic=pass` 决定；`joint_pass` 仅为 `semantic=pass` 且质量 `observed` 的派生报告字段，不得作为任务完成、evaluator health 或加权总分。原始分数、probe 分值、计划分母与失败原因 MUST 保留；不得引入隐藏加权总分。

Practice-injection diagnostic 中的 `evaluated` 还 MUST 表示 evaluator 进程已成功完成并输出完整结构化结果。若 evaluator 无法启动、超时或以非零退出码结束，尝试 MUST 记录为非健康；完成状态无法可靠判定时 MUST 记录为 `indeterminate`。非健康与 `indeterminate` 尝试不得静默从条件分母剔除、改记为质量信号缺失或计作任何通过分子。

#### Scenario: 功能正确但质量信号缺失
- **WHEN** 候选通过所有公开语义测试但未满足一个 Practice 质量 probe
- **THEN** 结果 MUST 记录语义通过和质量信号失败，并且不得将该次尝试表述为任务功能失败

#### Scenario: JudgeAgent 不可用
- **WHEN** 一次健康运行中 JudgeAgent provider 未产出质量信号
- **THEN** 结果 MUST 记录质量状态为 `judge-unavailable`，任务完成仍由语义硬门槛决定，且不得把 `judge-unavailable` 表述为候选质量缺失

#### Scenario: evaluator 非零退出
- **WHEN** evaluator 在输出部分或完整结构化文本后以非零退出码结束
- **THEN** 结果 MUST 记录为非健康评测，不得将文本中的语义或质量字段用于条件比较

#### Scenario: 完成状态不确定
- **WHEN** evaluator 或 replay 无法可靠判定运行是否完成
- **THEN** 结果 MUST 记录 execution health 为 `indeterminate` 并保留审计原因，且不得计入任何通过/观测分子

#### Scenario: 仅有命名差异的实现
- **WHEN** 两个候选在任务行为和被测职责上等价，但使用不同的内部命名、helper 拆分或局部目录布局
- **THEN** 质量 probe MUST 对两者给出相同的职责判断，除非该差异已作为公开接口合同声明

### Requirement: 候选结果以人可读原始维度呈现

Practice-injection candidate 的结果 MUST 按条件单独列出注入内容、计划运行次数、`evaluated` 次数、每种 execution health 状态（含 `execution-failed`、`invalid-output`、`not-executable`、`indeterminate`）的次数、语义通过次数、质量 `observed`/`not-observed`/`indeterminate`/`not-run`/`judge-unavailable` 次数和派生 `joint_pass` 次数。每个 `x/y` 值 MUST 解释分子、分母和通过含义，分母 MUST 保留计划运行次数。结论 MUST 限定在已执行的 candidate、Practice、模型与条件上，不得将小样本本地对照表述为 retrieval 有效性、正式 benchmark、产品效果或普遍模型能力。

#### Scenario: 本地三条件结果
- **WHEN** 维护者在 PR、issue 或验证文档中报告三条件候选结果
- **THEN** 报告 MUST 使用人可读字段解释每个条件的计划次数、execution health、语义、每种质量状态和派生 joint-pass 次数，并明确该结果是否只构成方向性信号

#### Scenario: 相关 Practice 严格领先
- **WHEN** 所有条件完成预先声明的重复次数且全部为 `evaluated`，probe 校准通过，相关 Practice 条件的语义通过次数不低于 baseline 和无关对照，并在派生“语义与质量均通过”原始次数上严格领先二者
- **THEN** 报告 MAY 称其为该 candidate 的方向性信号，但 MUST 同时呈现计划次数、execution health、语义、所有质量状态与派生 joint-pass 计数，并声明未验证的任务、模型、retrieval 或正式 record 边界
