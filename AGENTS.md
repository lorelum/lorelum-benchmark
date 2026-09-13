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

- 修复现有 runner、validation、流程或文档缺陷，且不改变评测语义、candidate/snapshot
  身份、record 或结论解释的改动，可直接在独立分支提交 PR，不需要先创建 issue 或 OpenSpec
  change；PR 正文必须说明根因、修复边界与验证方式。
- 用户明确授权的本地测试、诊断或 smoke 可以直接执行，不需要单独授权 issue；仍不得创建
  正式 record、升级 suite revision，或把测试结果当作正式结论。OpenSpec strict、
  public/private 泄露审计与生命周期门禁继续约束正式运行。
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
- OpenSpec strict validation 通过且初始 PR 创建后、开始任何非 OpenSpec 的实施前，必须进入
  Plan mode（当前客户端不支持时，明确标出等效规划阶段），向需求方展示本次改动范围、预期
  效果、验证方式和非目标，并获得明确确认；实施中若需实质改变已确认的范围或预期效果，必须
  重新规划并确认。规划必须记录当前 change 实际适用、且会改变题面、oracle、对照、评测、
  treatment、environment 或结论解释的决定。
- 未由当前 change 或 experiment 明确声明的领域方法条件不是实施门禁，也不要求填写不适用
  说明；当前 change 已声明的领域方法必须在其 design 中记录并按对应领域契约执行。规划回答
  必须写回 issue 与 OpenSpec design/tasks，再开始实现。信息不足时必须暂停并询问，不得自行假设。
- 用户明确的目标、范围或非目标与 Issue、OpenSpec 或历史材料不一致时，必须显式指出差异；
  不得默认为已有 artifact 的表述改写用户目标或扩大范围。若当前请求已澄清该差异，不重复追问；
  否则只询问会实质改变方案的未决点。需要 Issue/OpenSpec 的变更，应先同步关联记录再实施；
  适用直接 PR 例外的流程或文档修复，按其 PR 规则记录范围与验证。
- 当 change 新增或修改 `openspec/specs/` 中的 stable capability 时，Plan 与 PR 必须说明每条
  requirement 为什么脱离当前 Issue、candidate、任务、模型、profile、目录、版本与一次实验
  结论后仍成立；无法说明的决定必须留在当前 change 的 design/tasks 或具体 fixture contract，
  不得作为 stable spec delta 归档。
- 实现按 `tasks.md` 的依赖顺序推进。完成每项任务后立即勾选；触及 suite、任务、schema 或
  benchmark 代码时运行 `bun run validate`，并在 PR 中保留验证证据和未执行原因。
- OpenSpec 的 strict validation、public/private 泄露审计及生命周期门禁未通过前，不得执行
  模型调用、创建正式 record，或将 candidate 升级为 suite revision。

## 用户纠错与规则沉淀

- 用户纠正后先修正当前理解、计划或交付，停止沿用已被否定的假设；不重复确认已明确
  的结论。
- 按影响范围选一个权威落点：
  - 当前任务或实验的决定：写回适用的 Issue/OpenSpec；若按根流程无需 OpenSpec，则记录在当前 PR；
  - 文档错误：修正其 canonical source，不在多份指南复制规则；
  - 跨任务仍成立的契约：按 stable spec 升格要求处理；
  - 可复用的 Agent 工作方式：写入 `AGENTS.md` 或范围明确的维护指南；
  - 工具/环境故障：修复相应工具、环境或操作指南，不转成 benchmark 规则。
- 只有能脱离当前 Issue、candidate、模型或单次实验继续成立的规则，才可升为全局规则。
  不要复制原始对话或建立独立纠错台账。
- 规则相关的纠正，在已有 Issue、PR 或 OpenSpec 中简要记录“错误模式 → 根因 → 唯一
  更新位置 → 回归场景/验证”。可复用规则至少配一个重现旧错误的检查；不能自动化时，
  在 PR 验证中记录人工场景。普通任务没有规则发现时不额外记日志。
- 设计示例须区分“说明”“非规范性走查”和“验证证据”；只有预先声明的验收标准实际
  通过，才可称为验证，不能把示例数量当成通用性证明。

## PR Review 双轮规范

- 涉及 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或 record
  的 PR，合并前必须完成两轮独立 review。两轮独立产出 findings、分别留档、互不替代：
  1. 第一轮执行 `ai-code-review`：核查评测有效性、可复现性、public/private 隔离、
     生命周期、验证门禁与流程合规。第一轮存在未修复 must-fix 时，不得进入第二轮。
  2. 第二轮执行 `thermo-nuclear-code-quality-review`：在第一轮 must-fix 全部修复后的
     最新 diff 上核查结构质量、抽象与 code judo 机会、spaghetti/死逻辑条件、canonical
     层复用与文件体量（1k 线），并按其自身 approval bar 出具阻断项。
- 两轮结论应记录 skill 规则条目到 finding 的依据映射，便于复核审计。
- 不触及上述 benchmark 契约的小型流程或文档修正可不执行双轮门禁，但 PR 正文必须说明
  范围（与本文件「OpenSpec 与 PR 流程」一节的范围规则一致）。
- 两轮 review 均为只读审查，不得在 review 中顺带修改代码；修复按各自 findings 走常规
  issue/OpenSpec 流程交付。

## 协作表达

- 面向仓库协作者的 Issue、PR 标题、正文、review 和重要状态评论默认使用中文；用户明确要求其他语言时除外。文件路径、命令、代码标识符和不可翻译的专有名词可保留原文。
- Issue 或 PR 的正文必须使用清晰的 Markdown 标题、段落和列表。创建或编辑后，提交者必须回读 GitHub 实际保存的标题、正文和重要评论，确认换行、列表和段落没有被压平或损坏；未通过回读验证前不得请求 review 或合并。
