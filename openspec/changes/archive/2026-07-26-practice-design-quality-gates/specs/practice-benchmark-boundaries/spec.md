## ADDED Requirements

### Requirement: Practice、任务和验收具有明确的信息边界

系统 MUST 为 Practice-injection benchmark candidate 区分公开任务行为、注入 Practice、私有语义验收、私有质量信号和实现偏好。公开任务 MUST 完整声明用户可观察行为与任何不可替代的公共接口；Practice MUST 作为版本化的私有 treatment 仅经声明运行时通道注入，且不得补充未公开的单题 reference 结构。私有材料不得进入 agent workspace、公开题面或公开 trace。

#### Scenario: baseline 接收公开任务
- **WHEN** 执行 baseline 条件
- **THEN** agent 只接收公开任务与 starter，不接收源自 Practice、私有 evaluator 或 reference 的规则

#### Scenario: Practice 避免补全 reference
- **WHEN** 一张 Practice 仅通过私有 reference 才能得出特定文件路径、helper 或命名
- **THEN** 维护者 MUST 将该信息归类为实现偏好，不得将其作为 Practice 遵循或任务完成的必要条件

#### Scenario: 公共接口需要固定位置
- **WHEN** 任务要求兼容已声明的外部模块路径、导出或协议
- **THEN** 该接口 MUST 在公开任务或稳定外部合同中声明，并可以作为语义验收条件，而非由 Practice 隐式补充

#### Scenario: 维护者分类候选断言
- **WHEN** 维护者编写或审阅 Practice benchmark 指南
- **THEN** 指南 MUST 为五类信息各提供至少一个正例和反例，并用分类矩阵列出相关 candidate probe 断言及其归属；矩阵不得把未公开的 reference 路径、helper 或命名列为硬门槛

### Requirement: 硬门槛与 Practice 质量信号分开报告

系统 MUST 将公开任务的语义结果与 Practice 相关质量信号分开记录和解释。语义失败、公开接口不兼容、public/private 泄露或生命周期违规 MUST 使尝试无效或任务失败。质量信号失败 MUST 在语义通过时报告为未观察到对应质量，不得改写为功能失败。质量信号必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

#### Scenario: 功能正确但质量信号缺失
- **WHEN** 候选通过所有公开语义测试但未满足一个 Practice 质量 probe
- **THEN** 结果 MUST 记录语义通过和质量信号失败，并且不得将该次尝试表述为任务功能失败

#### Scenario: 仅有命名差异的实现
- **WHEN** 两个候选在任务行为和被测职责上等价，但使用不同的内部命名、helper 拆分或局部目录布局
- **THEN** 质量 probe MUST 对两者给出相同的职责判断，除非该差异已作为公开接口合同声明

### Requirement: 质量 probe 必须在模型运行前校准

每个 Practice candidate 的私有质量 probe MUST 在任何模型调用前，以固定样例证明能够接受 reference、接受职责等价实现并拒绝至少一个已声明 anti-pattern 或绕过实现。校准样例、probe 和断言 MUST 保持 private；候选源、probe 或 Practice 修改后，维护者 MUST 重新运行校准并更新对应 candidate snapshot。无法构造职责等价通过样例的断言不得作为质量失败条件，除非其已升级为公开接口合同。

#### Scenario: 等价实现校准
- **WHEN** 维护者为一个质量 probe 提交校准样例
- **THEN** reference 与使用不同内部结构的职责等价样例 MUST 通过，已声明 anti-pattern 或绕过样例 MUST 失败

#### Scenario: 校准未通过
- **WHEN** probe 拒绝职责等价样例或接受已声明绕过
- **THEN** 系统 MUST 阻止该 candidate 进入模型比较，直到 probe 或断言被修正并重新校准

### Requirement: 候选结果以人可读原始维度呈现

Practice-injection candidate 的结果 MUST 按条件单独列出注入内容、运行次数、语义通过次数、质量信号通过次数和两者同时通过次数。每个 `x/y` 值 MUST 解释分子、分母和通过含义。结论 MUST 限定在已执行的 candidate、Practice、模型与条件上，不得将小样本本地对照表述为 retrieval 有效性、正式 benchmark、产品效果或普遍模型能力。

#### Scenario: 本地三条件结果
- **WHEN** 维护者在 PR、issue 或验证文档中报告三条件候选结果
- **THEN** 报告 MUST 使用人可读字段解释每个条件的语义和质量次数，并明确该结果是否只构成方向性信号

#### Scenario: 相关 Practice 严格领先
- **WHEN** 预先声明的相关 Practice 条件在“语义与质量均通过”的原始次数上严格领先 baseline 和无关对照
- **THEN** 报告 MAY 称其为该 candidate 的方向性信号，但 MUST 同时声明未验证的任务、模型、retrieval 或正式 record 边界
