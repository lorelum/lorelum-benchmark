# openspec-pr-continuity Specification

## Purpose
Keep benchmark changes traceable from a focused GitHub issue through OpenSpec, planning confirmation, implementation, verification, and the same PR evidence chain.
## Requirements
### Requirement: Issue 先于后续 OpenSpec change
MUST：除 `practice-login-page-oracle-probe` 作为本规则落库时的一次性引导例外外，仓库在创建
benchmark OpenSpec change 前必须确认已有可追溯的 GitHub issue；若没有，必须先创建一张只收敛
单一问题、边界、依赖、验收口径与验证要求的 issue。proposal 与 PR 正文必须引用该 issue 编号。
该例外必须在 proposal、design、tasks 和 `AGENTS.md` 中明确标注，且不得作为后续 change 的先例。

#### Scenario: 尚无对应 issue
- **当** 维护者准备创建非引导例外的 benchmark OpenSpec change，且未找到对应 issue 时
- **则** 必须先创建 issue，随后才可创建 OpenSpec artifacts 或实现分支

### Requirement: 实现前完成规划澄清
MUST：OpenSpec strict validation 通过且初始 PR 创建后，维护者在创建或改变 benchmark 的可观察任务行为、Practice/treatment 或对照、私有语义/质量验收、starter 或不可变源码身份、模型/提示/预算/盲评计划，或结论解释前，必须向需求方确认并记录相关决定。记录必须写回 issue 与 OpenSpec design/tasks。仅实施同一 change 中已经记录且未改变的决定时，维护者必须引用该决定，但不必重新确认不受本次工作影响的选择；其余验证、public/private、生命周期和执行门禁仍然适用。

#### Scenario: 关键实验问题尚未确认
- **当** 未确认的问题会改变题面、oracle、对照、评测、treatment、environment 或结论解释时
- **则** 必须暂停受该问题影响的实现或模型执行并向需求方询问；不得用未记录的假设创建候选 fixture 或执行模型

#### Scenario: 实施已确认的实验决定
- **当** 工作只实现同一 change 已在 issue 和 OpenSpec design/tasks 中确认、且本次未改变的实验决定
- **则** 维护者引用已有决定并继续相关实施与验证，无需重新打开无关的设计问题

### Requirement: OpenSpec change 保持单一 PR 证据链
MUST：仓库对 benchmark change 必须先创建仅含 OpenSpec artifacts 和必要流程约束的 PR。后续
实现、验证、任务清单勾选和修订必须提交到同一分支与同一 PR。该 PR 在 change 的所有任务完成
或 change 被正式归档为放弃前不得关闭或合并；关闭或合并后发现的新范围必须使用独立 OpenSpec
change。该 PR 正文必须引用 change 对应的 issue。

#### Scenario: OpenSpec change 准备开始实现
- **当** 一个已严格验证的 OpenSpec change 准备开始任务实现时
- **则** 实现提交必须追加到创建该 change 的同一 PR，且不得创建独立实现 PR

#### Scenario: 初始 PR 尚有未完成任务
- **当** change 的 `tasks.md` 仍有未完成项
- **则** 维护者不得关闭或合并初始 PR，也不得将未完成实现迁移到另一 PR

#### Scenario: 变更需要新的能力范围
- **当** 实现发现需要扩展候选池、修改 runner/schema 或创建正式运行记录时
- **则** 必须为该新范围创建独立 OpenSpec change，并为其建立自己的仅含 OpenSpec 的 PR

### Requirement: 现行仓库规则可被轻量复核和反馈
仓库 MUST 在根 `AGENTS.md` 显示 `规则最近核对` 的 ISO 日期。该日期表示已对已提交的仓库规则和流程进行实际复核，而非本文件的普通编辑时间；它不会自动使任何规则失效。涉及共享规则或流程的工作在结束时 MUST 在其现有 Issue、PR 或 OpenSpec 记录一个简短结果：无需更新、已更新的文件，或后续 Issue。未发现规则问题的普通工作不需要创建额外记录或日志。

#### Scenario: 规则相关工作确认无需修订
- **WHEN** 一项工作审查或验证了共享规则/流程，但未发现需要改动的现行要求
- **THEN** 该工作的现有 Issue、PR 或 OpenSpec 记录“无需更新”，且不创建独立规则日志

#### Scenario: 复核改变现行规则
- **WHEN** 规则相关工作确认需要修订现行规则或流程
- **THEN** 它更新相应的现行文本、在现有工作记录中列出修改文件或后续 Issue，并在实际复核后更新 `规则最近核对` 日期
