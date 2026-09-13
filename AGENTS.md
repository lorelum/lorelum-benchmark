# Benchmark Workspace Rules

规则最近核对：2026-09-13（仅表示根规则已在该日期完成实际范围复核；不是普通编辑日期，也不会自动使规则失效。）

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
  agent workspace or model input. A declared treatment may be agent-visible
  only through its versioned, condition-scoped treatment contract; its delivery
  forms and isolation details are maintained in `treatments/README.md`.
- Never commit `node_modules/`, run workspaces, logs, or generated diffs.
  Commit dependency manifests and lockfiles needed to reconstruct a starter.
- Run `bun run validate` after changing a suite, task, schema, or benchmark code.
- Use `docs/README.md` as a reading map for maintainer documents; it is navigation,
  not a second normative source.

## OpenSpec 与 PR 流程

- 修改 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或 record 前，
  必须先确认关联 Issue 和经 strict validation 的 OpenSpec；非契约类流程/文档缺陷可走直接 PR 例外。
- 按需读取 [`docs/CHANGE_WORKFLOW.md`](docs/CHANGE_WORKFLOW.md) 执行 Issue/OpenSpec、分支/PR、
  规划确认、稳定契约、验证与正式运行门禁；信息不足或范围与用户目标冲突时先澄清，不自行扩大。

- 纠错先用于修正当前理解与交付；**单次纠正不自动新增全局规则，也不建立逐条纠错日志**。
- 只有同一错误模式在至少两个独立任务复现、一次高风险事件暴露规范缺口/冲突，
  或用户明确要求固化时，才触发“是否沉淀”的评估；触发评估不等于必然新增规则。
- 评估、范围判定与防止规则堆叠的步骤见
  [`docs/AGENT_GUIDANCE_MAINTENANCE.md`](docs/AGENT_GUIDANCE_MAINTENANCE.md)。只在触发时读取，
  不作为每个任务的额外清单。

## PR Review 双轮规范

- 触及 benchmark contract 的 PR 必须执行 [`docs/PR_REVIEW.md`](docs/PR_REVIEW.md) 所述的两轮独立只读审查；
  小型流程/文档修正可豁免，但 PR 正文必须说明范围。

- 面向仓库协作者的 Issue、PR 标题、正文、review 和重要状态评论默认使用中文；用户明确要求其他语言时除外。文件路径、命令、代码标识符和不可翻译的专有名词可保留原文。
- Issue 或 PR 的正文必须使用清晰的 Markdown 标题、段落和列表。创建或编辑后，提交者必须回读 GitHub 实际保存的标题、正文和重要评论，确认换行、列表和段落没有被压平或损坏；未通过回读验证前不得请求 review 或合并。
