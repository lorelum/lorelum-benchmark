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

- [ ] 4.1 用户授权后执行三条件诊断性注入验证：oracle-practice 3 次完整采纳（judge v2
  ≥90 + 公开测试通过），baseline / irrelevant-practice 失败；不创建正式 record、不升级
  suite。
- [ ] 4.2 记录结果、更新 design/tasks 与 issue，保留验证证据与未执行原因。
