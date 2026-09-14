# PR Review 规范

本文件是根 `AGENTS.md` 所链接的按需审查流程，只适用于触及 benchmark contract 的 PR。
- 涉及 suite、任务、schema、evaluator、runner、treatment、environment、实验协议或 record
  的 PR，合并前必须完成两轮独立 review。两轮独立产出 findings、分别留档、互不替代：
  1. 第一轮执行 `ai-code-review`：核查评测有效性、可复现性、public/private 隔离、
     生命周期、验证门禁与流程合规。第一轮存在未修复 must-fix 时，不得进入第二轮。
  2. 第二轮执行 `thermo-nuclear-code-quality-review`：在第一轮 must-fix 全部修复后的
     最新 diff 上核查结构质量、抽象与 code judo 机会、spaghetti/死逻辑条件、canonical
     层复用与文件体量（1k 线），并按其自身 approval bar 出具阻断项。
- 两轮结论应记录 skill 规则条目到 finding 的依据映射，便于复核审计。
- 不触及上述 benchmark 契约的小型流程或文档修正可不执行双轮门禁，但 PR 正文必须说明
  范围（与 [`CHANGE_WORKFLOW.md`](CHANGE_WORKFLOW.md) 的范围规则一致）。
- 两轮 review 均为只读审查，不得在 review 中顺带修改代码。修复按 finding 的实际范围走适用流程：
  当前 change 范围内的修复留在现有 Issue/OpenSpec/PR 证据链；新增或无关范围按工作流拆分；
  符合直接 PR 例外的文档/流程修复不要求另建 Issue/OpenSpec。
