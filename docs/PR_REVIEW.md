# PR Review 规范

本文件是根 `AGENTS.md` 所链接的按需审查流程，只适用于触及 benchmark contract 的 PR。

## 独立审查上下文

- “独立 review”首先要求 reviewer context 与实现上下文隔离，而不是只要求某个目录状态。
  reviewer 必须是未参与该 PR 实现的新 agent 或新 session，不得 fork 实现线程，也不得把
  实现过程中的对话、工具日志、失败尝试、作者解释或自评作为审查前提。
- review 以固定的 commit SHA 为审查对象。reviewer 只能从该 SHA 对应的 diff、Issue、
  OpenSpec、PR 正文、仓库规范和可复现验证结果独立形成判断。
- worktree 可以是普通 checkout 或 detached clean checkout；clean worktree 不是独立性的
  充分条件。即使换了干净目录，只要 reviewer 继承实现上下文，结果仍只能算 self-check。
- 审查完成后目标 SHA 发生任何代码变化，原 review 不得继续覆盖新内容。相关改动必须在新
  reviewer context 中重新审查。

- 涉及 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或 record
  的 PR，合并前必须完成两轮独立 review。两轮独立产出 findings、分别留档、互不替代：
  1. 第一轮执行 `ai-code-review`：核查评测有效性、可复现性、public/private 隔离、
     生命周期、验证门禁与流程合规。第一轮存在未修复 must-fix 时，不得进入第二轮。
  2. 第二轮执行 `thermo-nuclear-code-quality-review`：在第一轮 must-fix 全部修复后的
     最新 diff 上核查结构质量、抽象与 code judo 机会、spaghetti/死逻辑条件、canonical
     层复用与文件体量（1k 线），并按其自身 approval bar 出具阻断项。
- 第一轮发现 must-fix 后，修复会产生新的审查 SHA。必须在新的 reviewer context 中按新 SHA
  重跑第一轮；只保留旧 findings 加作者修复说明不能替代复审。第一轮在新 SHA 上通过后，才可
  进入第二轮。
- 两轮结论应记录 skill 规则条目到 finding 的依据映射，便于复核审计。
- 每轮证据至少记录：审查 skill、固定 commit SHA、reviewer context 标识、输入引用、实际
  命令与结果、findings，以及未覆盖范围。实现者在同一上下文完成的检查必须明确标记为
  self-check，不能作为合并门禁。
- 不触及上述 benchmark 契约的小型流程或文档修正可不执行双轮门禁，但 PR 正文必须说明
  范围（与 [`CHANGE_WORKFLOW.md`](CHANGE_WORKFLOW.md) 的范围规则一致）。
- 两轮 review 均为只读审查，不得在 review 中顺带修改代码。修复按 finding 的实际范围走适用流程：
  当前 change 范围内的修复留在现有 Issue/OpenSpec/PR 证据链；新增或无关范围按工作流拆分；
  符合直接 PR 例外的文档/流程修复不要求另建 Issue/OpenSpec。
