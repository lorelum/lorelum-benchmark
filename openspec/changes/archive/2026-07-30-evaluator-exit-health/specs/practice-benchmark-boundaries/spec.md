## MODIFIED Requirements

### Requirement: 硬门槛与 Practice 质量信号分开报告

系统 MUST 将公开任务的语义结果与 Practice 相关质量信号分开记录和解释。语义失败、公开接口不兼容、public/private 泄露或生命周期违规 MUST 使尝试无效或任务失败。质量信号失败 MUST 在语义通过时报告为未观察到对应质量，不得改写为功能失败。质量信号必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

Practice-injection diagnostic 中的 `evaluated` 还 MUST 表示 evaluator 进程已成功完成并输出完整结构化结果。若 evaluator 无法启动、超时或以非零退出码结束，尝试 MUST 记录为非健康，且不得从其 stdout 推导语义、Practice 质量信号或 joint pass。非健康尝试不得静默从条件分母剔除、改记为质量信号缺失或计作任何通过分子。

#### Scenario: 功能正确但质量信号缺失
- **WHEN** 候选通过所有公开语义测试但未满足一个 Practice 质量 probe
- **THEN** 结果 MUST 记录语义通过和质量信号失败，并且不得将该次尝试表述为任务功能失败

#### Scenario: evaluator 非零退出
- **WHEN** evaluator 在输出部分或完整结构化文本后以非零退出码结束
- **THEN** 结果 MUST 记录为非健康评测，不得将文本中的语义或质量字段用于条件比较

#### Scenario: 仅有命名差异的实现
- **WHEN** 两个候选在任务行为和被测职责上等价，但使用不同的内部命名、helper 拆分或局部目录布局
- **THEN** 质量 probe MUST 对两者给出相同的职责判断，除非该差异已作为公开接口合同声明
