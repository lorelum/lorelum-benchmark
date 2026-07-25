## ADDED Requirements

### Requirement: Issue 先于 OpenSpec change
MUST：仓库在创建 benchmark OpenSpec change 前必须确认已有可追溯的 GitHub issue；若没有，
必须先创建一张只收敛单一问题、边界、依赖、验收口径与验证要求的 issue。proposal 与 PR 正文
必须引用该 issue 编号。

#### Scenario: 尚无对应 issue
- **当** 维护者准备为 benchmark 工作创建 OpenSpec change，且未找到对应 issue 时
- **则** 必须先创建 issue，随后才可创建 OpenSpec artifacts 或实现分支

### Requirement: OpenSpec change 保持单一 PR 证据链
MUST：仓库对 benchmark change 必须先创建仅含 OpenSpec artifacts 和必要流程约束的 PR。在该
change 完成、归档、关闭或合并前，后续实现、验证、任务清单勾选和修订必须提交到同一分支与
同一 PR。该 PR 正文必须引用 change 对应的 issue。

#### Scenario: OpenSpec change 准备开始实现
- **当** 一个已严格验证的 OpenSpec change 准备开始任务实现时
- **则** 实现提交必须追加到创建该 change 的同一 PR，且不得创建独立实现 PR

#### Scenario: 变更需要新的能力范围
- **当** 实现发现需要扩展候选池、修改 runner/schema 或创建正式运行记录时
- **则** 必须为该新范围创建独立 OpenSpec change，并为其建立自己的仅含 OpenSpec 的 PR
