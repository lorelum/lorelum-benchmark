# practice-benchmark-boundaries Specification

## Purpose
TBD - created by archiving change practice-design-quality-gates. Update Purpose after archive.
## Requirements
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

### Requirement: 质量 probe 必须在模型运行前校准

每个 Practice candidate 的私有质量 probe MUST 在任何模型调用前，以固定样例证明能够接受 reference、接受职责等价实现并拒绝至少一个已声明 anti-pattern 或绕过实现。校准样例、probe 和断言 MUST 保持 private；候选源、probe 或 Practice 修改后，维护者 MUST 重新运行校准并更新对应 candidate snapshot。无法构造职责等价通过样例的断言不得作为质量失败条件，除非其已升级为公开接口合同。

#### Scenario: 等价实现校准
- **WHEN** 维护者为一个质量 probe 提交校准样例
- **THEN** reference 与使用不同内部结构的职责等价样例 MUST 通过，已声明 anti-pattern 或绕过样例 MUST 失败

#### Scenario: 校准未通过
- **WHEN** probe 拒绝职责等价样例或接受已声明绕过
- **THEN** 系统 MUST 阻止该 candidate 进入模型比较，直到 probe 或断言被修正并重新校准

### Requirement: 候选结果以人可读原始维度呈现

Practice-injection candidate 的结果 MUST 按条件单独列出注入内容、计划运行次数、`evaluated` 次数、每种 execution health 状态（现有诊断枚举 `execution-failed`、`invalid-output`、`not-executable`；以 outcome 契约表达的结果另含 `indeterminate`）的次数、语义通过次数、质量 `observed`/`not-observed`/`indeterminate`/`not-run`/`judge-unavailable` 次数和派生 `joint_pass` 次数。每个 `x/y` 值 MUST 解释分子、分母和通过含义，分母 MUST 保留计划运行次数。结论 MUST 限定在已执行的 candidate、Practice、模型与条件上，不得将小样本本地对照表述为 retrieval 有效性、正式 benchmark、产品效果或普遍模型能力。

#### Scenario: 本地三条件结果
- **WHEN** 维护者在 PR、issue 或验证文档中报告三条件候选结果
- **THEN** 报告 MUST 使用人可读字段解释每个条件的计划次数、execution health、语义、每种质量状态和派生 joint-pass 次数，并明确该结果是否只构成方向性信号

#### Scenario: 相关 Practice 严格领先
- **WHEN** 所有条件完成预先声明的重复次数且全部为 `evaluated`，probe 校准通过，相关 Practice 条件的语义通过次数不低于 baseline 和无关对照，并在派生“语义与质量均通过”原始次数上严格领先二者
- **THEN** 报告 MAY 称其为该 candidate 的方向性信号，但 MUST 同时呈现计划次数、execution health、语义、所有质量状态与派生 joint-pass 计数，并声明未验证的任务、模型、retrieval 或正式 record 边界

### Requirement: Realistic task statements do not hard-code fixture paths

For real-development-style candidates, the public task statement MUST describe
the product goal in natural language and MUST NOT hard-code API documentation
paths, test fixture paths, or benchmark-specific language. API contract and
test entry points are determined by the starter's actual content. Private
evaluators MUST verify only the observable behavior declared by the task
statement; layering, UI/UX, and form-quality dimensions are soft quality
signals and MUST NOT become semantic hard gates.

#### Scenario: Agent inspects real project content
- **WHEN** a candidate task says to inspect the existing login API and wire up
  the login page
- **THEN** the agent finds the API contract and tests in the starter, and the
  evaluator verifies only the declared observable behavior

#### Scenario: Reference layout is not a hard gate
- **WHEN** a candidate uses different file paths, helper names, or directory
  layout from the reference
- **THEN** the quality probe accepts responsibility-equivalent implementations
  and does not mark the task incomplete

### Requirement: 候选环境不得暴露测试痕迹
The agent-visible workspace and prompt of a real-development-style candidate MUST NOT contain benchmark artifacts such as scoring, rubric, hash, condition, or evaluation wording, and the run MUST NOT ask the agent about the test environment or reveal test intent.

#### Scenario: Workspace is free of benchmark artifacts
- **WHEN** a reviewer inspects the candidate workspace and prompt from the
  agent's perspective
- **THEN** no scoring/rubric/hash/condition/evaluation wording is present and no
  prompt asks about the test

### Requirement: Practice 注入须条件化并以项目内规范呈现
Practice content MUST be delivered as a project-internal convention through the
treatment channel and MUST be condition-scoped: the baseline condition receives
no convention, the irrelevant control receives only its declared control
convention, and the oracle condition receives the layering convention. It MUST
NOT be part of the shared public starter, and public traces MUST record only
the convention version and hash.

#### Scenario: Condition-scoped convention injection
- **WHEN** a Practice is injected for the oracle condition
- **THEN** it appears as project documentation there, the baseline workspace
  contains no convention, and the irrelevant control only ever contains its own
  declared control convention (never the oracle one)

### Requirement: 真实性检测为事后被动审计
Detecting whether the agent recognized the test environment MUST be a post-hoc
passive audit by the benchmark operators reading the run trace; it MUST NOT
involve asking the agent, revealing the test, or affecting the run's score.

#### Scenario: Passive authenticity audit
- **WHEN** the run finishes
- **THEN** operators read the trace for spontaneous test/benchmark/evaluation
  language and record it as an interpretation signal without changing the run
  outcome

### Requirement: 任务须声明被测 Practice 的基本行为要求，评分须可解释（评分公平性）

Practice-injection candidate 的公开任务 MUST 以自然语言声明被测 Practice 的基本行为要求
（例如分层方向），使 baseline 条件预期可产出该行为；细化约定（响应翻译、原始响应隔离、
命名与目录偏好等）由 Practice 注入提供，MUST NOT 全部隐藏于 Practice。candidate design
MUST 记录预期基线符合水平与 Practice 的增量贡献。任意低于参考的 judge 分数（含 0 分）
MUST 能从候选代码追溯到具体缺失的 rubric 维度（如组件持有 transport、原始 status/body
流入页面状态），并归类为「task 要求但未产出」或「Practice 专属细化未满足」；MUST NOT
解释为模型识破测试环境（真实性识别为事后被动审计）。

#### Scenario: 基线按要求产出基本行为
- **WHEN** task 声明了分层要求但未注入 Practice
- **THEN** 基线仍可能部分或完全符合，judge 分数如实反映，design 记录了预期基线水平

#### Scenario: 0 分可解释
- **WHEN** 某条件 judge 0 分
- **THEN** 维护者可从代码定位缺失维度，并区分「task 未要求」与「task 要求但模型未做」

