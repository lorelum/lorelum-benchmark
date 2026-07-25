## ADDED Requirements

### Requirement: OpenSpec change 保持单一 PR 证据链
MUST：仓库对 benchmark change 必须先创建仅含 OpenSpec artifacts 和必要流程约束的 PR。在该
change 完成、归档、关闭或合并前，后续实现、验证、任务清单勾选和修订必须提交到同一分支与
同一 PR。

#### Scenario: OpenSpec change 准备开始实现
- **当** 一个已严格验证的 OpenSpec change 准备开始任务实现时
- **则** 实现提交必须追加到创建该 change 的同一 PR，且不得创建独立实现 PR

#### Scenario: 变更需要新的能力范围
- **当** 实现发现需要扩展候选池、修改 runner/schema 或创建正式运行记录时
- **则** 必须为该新范围创建独立 OpenSpec change，并为其建立自己的仅含 OpenSpec 的 PR
