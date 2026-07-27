## ADDED Requirements

### Requirement: dry-run 在实跑前验证工作区干净
MUST：Practice 候选本地执行器的 `--dry-run` 在输出计划 JSON 前，必须复制一次干净公开工作区、
列出实际工作区文件清单，并断言清单不含任何 `private/` 或 `practices/` 材料。dry-run 不得
调用模型、运行 evaluator、创建正式 record 或写入 run manifest。

#### Scenario: dry-run 复制工作区并验证无 private 材料
- **当** 维护者对 Practice 候选执行 `--dry-run` 时
- **则** 执行器必须复制 `public/starter` 与 `public/task.md` 到临时工作区，列出实际文件清单，
  且清单不得包含任何路径含 `private/` 或 `practices/` 的文件；验证通过后输出计划 JSON 并
  以退出码 0 结束

#### Scenario: dry-run 发现 private 材料进入工作区
- **当** dry-run 复制的工作区文件清单包含 `private/` 或 `practices/` 路径时
- **则** 执行器必须以退出码 1 失败，并在 stderr 报告泄露的文件路径，不输出计划 JSON

#### Scenario: dry-run 不消耗模型预算
- **当** dry-run 完成时
- **则** 不得产生 Pi 调用记录、evaluator 输出或 candidate diff；临时工作区在 dry-run 结束
  后被清理，只保留计划 JSON 输出

### Requirement: dry-run 计划 JSON 包含实际工作区文件清单
MUST：dry-run 输出的计划 JSON（schema `login-practice-local-plan/v1`）必须包含
`workspace_files` 字段，记录实际复制到工作区的文件相对路径清单，且必须包含 `dry_run: true`
标记，以区分实跑摘要。

#### Scenario: 计划 JSON 含文件清单与 dry_run 标记
- **当** dry-run 成功完成时
- **则** 输出的 JSON 必须包含 `planned_runs`、`workspace_template`、`output`、
  `workspace_files`（非空文件清单）和 `dry_run: true`，且 `workspace_files` 不得包含
  `private/` 或 `practices/` 路径
