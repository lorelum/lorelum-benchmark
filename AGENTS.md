# Benchmark Workspace Rules

- Keep reusable contracts in `schemas/`, benchmark fixtures in `suites/`, and
  runner or validation code in `src/benchmark/`.
- A task revision lives at `suites/<suite>/tasks/<task-slug>/v<version>/`.
  Do not modify a revision after it has recorded results; create the next
  revision instead.
- Keep the formal source and snapshot of every revision in the repository.
  Retire historical revisions by removing them from the default active set;
  do not create a second mutable archive copy.
- Shared evaluator helpers are versioned under `src/benchmark/`; never rewrite a
  helper version used by a frozen task.
- Agent-visible files belong in `public/`. Evaluators, oracle material, and
  scoring configuration belong in `private/` and must never be copied into an
  agent workspace.
- Never commit `node_modules/`, run workspaces, logs, or generated diffs.
  Commit dependency manifests and lockfiles needed to reconstruct a starter.
- Run `bun run validate` after changing a suite, task, schema, or benchmark code.

## OpenSpec 与 PR 流程

- 对 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或记录的
  新增与修改，必须先确认已有可追溯 GitHub issue；没有时先创建一个只收敛单一问题、边界、
  依赖、验收口径与验证要求的 issue。
- issue 创建或确认后，必须在 `openspec/changes/<change-name>/` 创建并严格验证 OpenSpec
  change，并在 proposal 与 PR 正文中引用 issue 编号。
- 在开始实现前，必须从最新主线创建 `codex/<change-name>` 分支并创建一个仅包含 OpenSpec
  artifacts 和必要流程约束的 PR；该初始 PR 不得包含候选 fixture、任务、runner、模型运行或
  结果记录。
- 此后的实现、验证、任务清单勾选和修订必须持续提交到该同一分支和同一 PR。不得为同一
  change 另开实现 PR、迁移到另一分支，或在未关闭/合并原 PR 的情况下拆分其证据链。
- 实现按 `tasks.md` 的依赖顺序推进。完成每项任务后立即勾选；触及 suite、任务、schema 或
  benchmark 代码时运行 `bun run validate`，并在 PR 中保留验证证据和未执行原因。
- OpenSpec 的 strict validation、public/private 泄露审计及生命周期门禁未通过前，不得执行
  模型调用、创建正式 record，或将 candidate 升级为 suite revision。
