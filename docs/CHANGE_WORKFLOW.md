# OpenSpec 与 PR 工作流

本文件是根 `AGENTS.md` 所链接的详细工作流；只在处理 benchmark contract、OpenSpec change、PR 边界或获准本地诊断时按需读取。它细化执行步骤，不覆盖用户明确目标或适用的 stable spec/schema。
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
