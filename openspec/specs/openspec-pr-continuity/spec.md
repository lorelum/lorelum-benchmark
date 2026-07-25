# openspec-pr-continuity Specification

## Purpose
TBD - created by archiving change practice-login-page-oracle-probe. Update Purpose after archive.
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
MUST：OpenSpec strict validation 通过且初始 PR 创建后，在开始任何候选 fixture 或 benchmark
代码实现前，维护者必须向需求方确认并记录：被测的可观察行为与 Practice 行为、预期
baseline 缺陷和区分度、相关 Practice 与等长无关对照、私有语义/质量验收、starter 与不可变
源码提交、模型/提示/预算和盲评边界。回答必须写回 issue 与 OpenSpec design/tasks。

#### Scenario: 关键实验问题尚未确认
- **当** 未确认的问题会改变题面、oracle、对照、评测、treatment、environment 或结论解释时
- **则** 必须暂停实现并向需求方询问，且不得创建候选 fixture 或执行模型

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

