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
  agent workspace or model input. A versioned Practice card that is itself the
  declared treatment may be injected through a condition-scoped private runtime
  channel, but must not be materialized in the workspace or public task prompt;
  public traces and logs record only its version and hash.
- Never commit `node_modules/`, run workspaces, logs, or generated diffs.
  Commit dependency manifests and lockfiles needed to reconstruct a starter.
- Run `bun run validate` after changing a suite, task, schema, or benchmark code.

## OpenSpec 与 PR 流程

- `practice-login-page-oracle-probe` 是本规则落库时唯一的引导例外：#74 在其首个
  OpenSpec commit 和 PR 创建后才建立。该顺序不得作为合规先例；本规则对其后的新
  benchmark change 严格生效。
- 对 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或记录的
  新增与修改，必须先确认已有可追溯 GitHub issue；没有时先创建一个只收敛单一问题、边界、
  依赖、验收口径与验证要求的 issue。
- issue 创建或确认后，必须在 `openspec/changes/<change-name>/` 创建并严格验证 OpenSpec
  change，并在 proposal 与 PR 正文中引用 issue 编号。
- 每个 PR 必须保持单一声明范围。涉及 suite、任务、schema、evaluator、runner、treatment、
  environment、实验协议或 record 的改动，其每个提交与最终 diff 都必须能追溯到关联 issue 和
  OpenSpec；不触及这些契约的小型流程或文档修正可直接创建 PR，但 PR 正文必须说明范围。发现
  无关改动时，必须从当前 PR 移除并以独立分支和 PR 交付；范围不清时暂停并向需求方澄清。
- 在开始实现前，必须从最新主线创建 `codex/<change-name>` 分支并创建一个仅包含 OpenSpec
  artifacts 和必要流程约束的 PR；该初始 PR 不得包含候选 fixture、任务、runner、模型运行或
  结果记录。
- 此后的实现、验证、任务清单勾选和修订必须持续提交到该同一分支和同一 PR。不得为同一
  change 另开实现 PR、迁移到另一分支，或拆分其证据链。未完成或未归档的 change 不得关闭
  或合并其初始 PR；关闭或合并后发现的新范围必须创建独立 OpenSpec change。
- OpenSpec strict validation 通过且初始 PR 创建后、开始任何候选 fixture 或 benchmark 代码
  实现前，必须先进入规划澄清阶段并向需求方确认：被测的可观察行为与 Practice 行为、预期
  baseline 缺陷及区分度、相关 Practice 与等长无关对照、私有语义/质量验收、starter 与
  不可变源码提交，以及模型、提示、预算和盲评边界。
- 规划澄清的回答必须写回 issue 与 OpenSpec design/tasks，再开始实现。任何会改变题面、
  oracle、对照、评测、treatment、environment 或结论解释的未决问题，均构成实现门禁；
  信息不足时必须暂停并询问，不得自行假设。
- 实现按 `tasks.md` 的依赖顺序推进。完成每项任务后立即勾选；触及 suite、任务、schema 或
  benchmark 代码时运行 `bun run validate`，并在 PR 中保留验证证据和未执行原因。
- OpenSpec 的 strict validation、public/private 泄露审计及生命周期门禁未通过前，不得执行
  模型调用、创建正式 record，或将 candidate 升级为 suite revision。
