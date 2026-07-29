## MODIFIED Requirements

### Requirement: 硬门槛与 Practice 质量信号分开报告

系统 MUST 将公开任务的语义结果、Practice 相关质量观测和 evaluator/execution health 分开记录和解释。语义失败、公开接口不兼容、public/private 泄露或生命周期违规 MUST 使尝试无效或任务失败。Practice 质量观测不得改写语义结果、任务完成或 evaluator health。质量观测必须映射到 Practice 的建议或 anti-pattern，并接受职责等价实现。

本 requirement 适用于所有当前与未来 Practice-injection candidate。新增或修改 Practice 卡、probe、evaluator、calibration 或结果汇总时，维护者 MUST 在其关联 issue 与 OpenSpec 中声明如何满足本 requirement；已冻结 candidate 只能通过新的版本或独立 change 迁移，绝不得回写历史输入或记录。

Practice 观测 MUST 表示为 `observed`、`not-observed`、`indeterminate` 或 `not-run`。`not-observed` 只能基于校准过的、适用于该 candidate 的反模式或缺失职责证据。解析失败、未支持的代码形态、依赖缺失或无法可靠分类时 MUST 使用 `indeterminate` 并保留审计原因，不得把它们表述为 Agent 未遵循 Practice。有效结构化 evaluator 结果的健康状态不得因语义或 Practice 观测而变为 `evaluation-failed`。

#### Scenario: 功能正确但质量信号缺失
- **WHEN** 候选通过所有公开语义测试但未观察到一个 Practice 质量信号
- **THEN** 结果 MUST 记录语义通过、Practice `not-observed` 和已完成 evaluator，并且不得将该次尝试表述为任务功能失败或评测失败

#### Scenario: 新 Practice candidate 进入设计
- **WHEN** 维护者创建或修改一个 Practice-injection candidate
- **THEN** 其 issue、OpenSpec、私有 probe 和校准设计 MUST 采用独立的语义、Practice 观测及 evaluator/execution health 契约，并且不得修改任何冻结 candidate 的历史输入

#### Scenario: 质量观测无法可靠分类
- **WHEN** probe 无法在其已声明能力范围内解析或分类相关实现
- **THEN** 结果 MUST 记录 Practice `indeterminate` 及审计原因，而不得将其记录为质量信号失败

#### Scenario: 仅有命名差异的实现
- **WHEN** 两个候选在任务行为和被测职责上等价，但使用不同的内部命名、helper 拆分、局部目录布局或等价相对 import
- **THEN** 质量 probe MUST 对两者给出相同的职责判断，除非该差异已作为公开接口合同声明

### Requirement: 质量 probe 必须在模型运行前校准

每个 Practice candidate 的私有质量 probe MUST 在任何模型调用前，以固定样例证明能够接受 reference、接受职责等价实现并拒绝至少一个已声明 anti-pattern 或绕过实现。校准样例、probe 和断言 MUST 保持 private；候选源、probe 或 Practice 修改后，维护者 MUST 重新运行校准并更新对应 candidate snapshot。无法构造职责等价通过样例的断言不得作为质量失败条件，除非其已升级为公开接口合同。

校准必须断言完整的独立结果：公开 starter 与已注册 anti-pattern 为语义 `pass` 且 Practice `not-observed`；reference 与职责等价实现为语义 `pass` 且 Practice `observed`。若 probe 遇到其不支持的实现形式，校准必须证明其报告 `indeterminate` 而不是把该形式误判为 `not-observed`。

#### Scenario: 等价实现校准
- **WHEN** 维护者为一个质量 probe 提交校准样例
- **THEN** reference 与使用不同内部结构、目录或相对 import 的职责等价样例 MUST 语义通过且 Practice `observed`，已声明 anti-pattern 或绕过样例 MUST 语义通过且 Practice `not-observed`

#### Scenario: 校准未通过
- **WHEN** probe 拒绝职责等价样例、接受已声明绕过，或把不支持的分析误报为 `not-observed`
- **THEN** 系统 MUST 阻止该 candidate 进入模型比较，直到 probe 或断言被修正并重新校准

### Requirement: 候选结果以人可读原始维度呈现

Practice-injection candidate 的结果 MUST 按条件单独列出注入内容、运行次数、语义通过次数、Practice `observed` 次数、Practice `not-observed` 次数、Practice `indeterminate` 次数、evaluator/execution health 和语义与 Practice 均通过次数。每个 `x/y` 值 MUST 解释分子、分母和通过含义。结论 MUST 限定在已执行的 candidate、Practice、模型与条件上，不得将小样本本地对照表述为 retrieval 有效性、正式 benchmark、产品效果或普遍模型能力。

`joint_pass` MUST 仅由语义 `pass` 与 Practice `observed` 派生；它不得替代任务完成或 evaluator health，也不得与其他维度合并为加权总分。

#### Scenario: 本地三条件结果
- **WHEN** 维护者在 PR、issue 或验证文档中报告三条件候选结果
- **THEN** 报告 MUST 使用人可读字段解释每个条件的语义、每种 Practice 观测和 evaluator health 次数，并明确该结果是否只构成方向性信号

#### Scenario: 相关 Practice 严格领先
- **WHEN** 预先声明的相关 Practice 条件在派生“语义与 Practice 均通过”原始次数上严格领先 baseline 和无关对照
- **THEN** 报告 MAY 称其为该 candidate 的方向性信号，但 MUST 同时呈现语义、所有 Practice 观测、health 维度，并声明未验证的任务、模型、retrieval 或正式 record 边界
