## ADDED Requirements

### Requirement: 新 candidate 必须通过规划澄清门禁
MUST：在创建任何 #89 candidate 的 public、private、starter、evaluator、Practice、calibration
或 snapshot 文件前，维护者必须在 issue #89 与本 change 的 design/tasks 中记录并确认 candidate
数量与技术栈、可观察任务行为、相关及无关 Practice、预期 baseline 缺陷、私有语义与质量验收、
calibration、模型/提示/预算和盲评边界。任何会改变题面、oracle、对照、评测、treatment、
environment 或结论解释的未决项必须阻止实现。

#### Scenario: 规划问题未确认
- **当** candidate 的技术栈或 Practice/验收设计仍存在未确认问题时
- **则** 维护者只能提交 OpenSpec 规划材料，不得创建 candidate fixture 或调用模型

### Requirement: 每个扩展 candidate 保持隔离且可校准
MUST：每个获批的 candidate 必须位于独立的 `incubator/practice-injection/<candidate-id>/`，并具有
仅含任务与 starter 的 public 材料、私有相关/无关 Practice、私有语义验收、仅报告的质量 probe、
reference/职责等价/anti-pattern calibration 和已验证 snapshot。Practice 与质量 probe 不得把
reference 路径、命名或 helper 作为达标条件。

#### Scenario: 职责等价实现接受质量 probe
- **当** 校准实现以不同的目录、命名或领域结果形式承担同一职责边界时
- **则** 私有质量 probe 必须通过，而已登记 anti-pattern 在公开语义通过时必须失败质量 probe

### Requirement: 扩展 candidate 不得产生执行结论
MUST：#89 的 candidate 定义与 calibration 不得调用 Pi 或其他模型、创建正式 record、运行 manifest、
retrieval 条件、盲评材料或正式 suite revision。后续本地执行必须由独立 change 承接，并在 #94
模型可达 preflight 成功后进行。

#### Scenario: candidate 校准完成
- **当** candidate 的 reference、职责等价和 anti-pattern calibration 均通过
- **则** 维护者可以将其作为后续执行 change 的输入，但不得仅据此宣称 Practice 有效
