# practice-candidate-expansion Specification

## Purpose
TBD - created by archiving change practice-candidate-expansion. Update Purpose after archive.
## Requirements
### Requirement: 新 candidate 必须通过规划澄清门禁
MUST：在创建任何 #89 candidate 的 public、private、starter、evaluator、Practice、calibration
或 snapshot 文件前，维护者必须在 issue #89 与本 change 的 design/tasks 中记录并确认 candidate
数量与技术栈、可观察任务行为、baseline/oracle-practice/irrelevant-practice 三条件、相关及按固定
计量方式等长的无关 Practice、预期 baseline 缺陷、私有语义与质量验收、calibration、模型/提示/
工具/预算/重复次数和盲评边界。任何会改变题面、oracle、对照、评测、treatment、environment 或
结论解释的未决项必须阻止实现。

#### Scenario: 规划问题未确认
- **当** candidate 的技术栈或 Practice/验收设计仍存在未确认问题时
- **则** 维护者只能提交 OpenSpec 规划材料，不得创建 candidate fixture 或调用模型

### Requirement: 每个扩展 candidate 保持隔离且可校准
MUST：每个获批的 candidate 必须位于独立的 `incubator/practice-injection/<candidate-id>/`，并声明
`kernel.core: v1`、`kernel.profile: injection-calibration/v1` 与 `kernel.materializer_kind: react-vite`，并具有
仅含任务与 starter 的 public 材料、私有相关/无关 Practice、私有语义验收、仅报告的质量 probe、
reference/职责等价/anti-pattern calibration 和已验证 snapshot。其 conditions 必须声明
`baseline`（无 Practice）、`oracle-practice`（相关 Practice）和 `irrelevant-practice`（按已声明
固定计量方式等长的无关 Practice）。conditions 和 Practice metadata 必须通过 profile v1 校验，
并以 resolved `profile_input_hash` 绑定私有输入；Practice 文本和私有 Practice 路径不得进入完整
snapshot manifest、workspace、public trace 或汇总。三条件必须固定相同的 public snapshot、模型、系统提示、工具
策略、预算、重复次数和干净工作区策略，唯一差异是注入内容。Practice 与质量 probe 不得把
reference 路径、命名或 helper 作为达标条件。

#### Scenario: 职责等价实现接受质量 probe
- **当** 校准实现以不同的目录、命名或领域结果形式承担同一职责边界时
- **则** 私有质量 probe 必须通过；public starter 与已登记 anti-pattern 均须在公开语义通过时失败
  质量 probe

#### Scenario: 三条件输入可比
- **当** 维护者为 candidate 生成本地执行请求
- **则** 必须生成 baseline、oracle-practice 和 irrelevant-practice 三个条件；除无 Practice、相关
  Practice 或等长无关 Practice 的注入内容外，其余声明的执行输入必须相同

### Requirement: 扩展 candidate 不得产生执行结论
MUST：#89 的 candidate 定义与 calibration 不得调用 Pi 或其他模型、创建正式 record、运行 manifest、
retrieval 条件、盲评材料或正式 suite revision。后续本地执行必须由独立 change 承接；该 change
必须在任一 candidate 执行循环前复用或抽取 #94 的 Pi/模型可达 preflight 语义，并验证 preflight
失败时不创建 candidate 工作区或执行请求。#94 的登录页 `run-local.ts` preflight 本身不能替代该
集成。

#### Scenario: candidate 校准完成
- **当** candidate 的 reference、职责等价、public starter 和 anti-pattern calibration 均符合预期
- **则** 维护者可以将其作为后续执行 change 的输入，但不得仅据此宣称 Practice 有效

