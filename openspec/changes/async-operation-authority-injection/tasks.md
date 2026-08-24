## 1. Issue、OpenSpec 与初始 PR

- [x] 1.1 创建单一问题 issue #180，记录承接边界、验收口径与待确认问题。
- [x] 1.2 创建 `async-operation-authority-injection` change，补齐 proposal/specs/design/tasks。
- [x] 1.3 运行 `openspec validate async-operation-authority-injection --type change --strict`，修正至通过。
- [x] 1.4 从最新 main 创建 `codex/async-operation-authority-injection` 分支，提交仅含 OpenSpec artifacts 的变更并创建初始 PR（引用 #180）。
- [x] 1.5 完成规划澄清，将需求方对被测行为、对照组卡、私有质量门与模型/预算/盲评边界的回答写回 #180 与 design Planning Confirmation。

## 2. Candidate 骨架与公开/私有边界

- [x] 2.1 创建 `incubator/practice-injection/async-operation-authority-v1/`，声明
  `injection-calibration/v2` + `react-vite`，独立 id/source/snapshot 身份。
- [x] 2.2 复制 skill-trigger v4 公开题面（task/starter/tests），确认不含 PX-47 规则正文。
- [x] 2.3 编写 private candidate/conditions/oracle/practices/manifests，固定 judge v2 声明
  与 practice-card 注入通道；`irrelevant-practice` 等长无关卡写入 metadata 并校验相对差。

## 3. 校准、snapshot 与验证

- [x] 3.1 建立 `injection-calibration/v2` 兼容 calibration base 共享声明与 digest 绑定，
  复用 `injection-calibration/v2/react-vite/app-shell/v1` base。
- [x] 3.2 建立 reference/anti-pattern/never-apply calibration overlays 与 snapshot。
- [x] 3.3 运行 `bun run validate`、`bun run test:contracts`、OpenSpec strict、泄露审计、
  `git diff --check`；确认冻结资产逐字节不变。

## 4. 诊断验证（用户授权）

- [x] 4.0 修复 practice-card argv 泄露与本地工具隔离：runtime prompt 改为一次性
  私有 temp 文件；Pi 禁用内置工具并启用 workspace-confined extension；`bun run test`
  由 extension 以外部 vite server 运行避免挂起；evaluator web server 单进程化并用
  TerminateProcess 兜底清理；补充合同测试、OpenSpec strict、泄露审计与最小 smoke。
- [x] 4.1 用户授权后执行三条件诊断性注入验证：r5（2026-08-21）因 DeepSeek 账户周配额
  429（GoUsageLimitError）作废；r6（2026-08-24，新 key）9/9 attempts 全部 evaluated，
  deepseek-v4-flash、25 分钟预算、cyclic-latin-square/v1。结果未达验收口径：baseline /
  irrelevant-practice / oracle-practice 各 3 次全部 judge v2=100 + 公开测试通过 +
  practice_observation=observed（oracle_deltas raw=0，bootstrap 95% CI=[0,0]），
  candidate 不具区分度。全程 diagnostic-only，未创建正式 record、未升级 suite。
- [x] 4.2 记录结果：注入机制正常（irrelevant-practice 卡被 agent 看到并忽略；oracle 卡经
  一次性私有 temp 文件路径注入，argv/trace 无卡正文）；根因是公开测试套件完整编码
  PX-47 可观测行为（200ms/600ms 窗口），无实践卡亦可测试驱动复现，故三条件零区分度。
  结论写入 design/tasks 与 issue #180/#181；诊断产物仅存 scratch/（不入库）；candidate
  暂不升级，需任务重设计（目标行为不可仅由公开测试推导）后重新诊断。
- [x] 4.3 按需求方决策（2026-08-24）放弃本诊断方向：candidate 不升级、不重设计，采纳层测量暂停；
  结论归档为「fixture 非区分、需重设计（目标行为不可仅由公开测试推导）」，回到 skill-trigger
  原任务（t100237 系列）核心交付收尾。#180/#181 按决策关闭，改动保留在分支。
