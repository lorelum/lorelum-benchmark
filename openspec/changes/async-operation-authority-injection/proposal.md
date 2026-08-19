## Why

skill-trigger-orchestration 轨道（#96 / PR #113）解耦后，发现层（agent 是否自主发现并
查询规范）已由 r17c 3/3 达成并归档，但采纳层（agent 是否按查询到的行为约束完整实现）
明确移交 practice-injection 轨道验证。归档 OpenSpec
`2026-08-18-skill-trigger-orchestration-pilot` 的 tasks.md 记录：需新 issue + OpenSpec
承接，复用 `react.project-operation-authority` 卡与 judge v2，用 `oracle-practice` 注入
通道验证完整采纳（窗口起点 + 前台在途语义）。r17c 三个 attempt 均只实现「距前台完成
>500ms」近似，缺失「前台在途时不生效 + 窗口从启动时刻算起」；该差距必须在注入场景下
可观察、可判定，形成采纳层的正式证据链。

## What Changes

- 新建 `incubator/practice-injection/async-operation-authority-v1/` candidate，采用
  `injection-calibration/v2` profile + `react-vite` materializer，三条件 `baseline /
  oracle-practice / irrelevant-practice`，`lorelum-retrieval` 显式 `unavailable`。
- `oracle-practice` 通过 `practice-card/v1` 运行时注入 `react.project-operation-authority`
  卡（条件作用域私有运行时通道，不物化进 agent workspace）；`irrelevant-practice` 注入
  等长无关卡；`baseline` 无注入。
- 复用 skill-trigger v4 的公开行为题面与 `dashboard.spec.ts`（含「前台在途 + 后台协调」
  第 8 条可观察回归），`task.md`/starter 不含 PX-47 规则正文。
- 复用 `skill-trigger-source-authority/v2` judge 与校准矩阵（reference 90+ /
  anti-pattern ≤75 / never-apply 失败），新增 `injection-calibration/v2` 兼容的
  react-vite app-shell/v2 calibration base 共享声明并绑定 digest。
- 不改写任何冻结资产：skill-trigger v4 的 Practice 卡、judge v2、公开测试、校准矩阵、
  snapshot 保持不动；共享 judge provider 不改签名。

## Capabilities

### New Capabilities

- `async-operation-authority-practice-candidate`: 定义采纳层承接 candidate 的公开/私有
  边界、三条件注入协议、judge v2 语义验收、校准矩阵与 snapshot 生命周期。

### Modified Capabilities

## Impact

- 新增 `incubator/practice-injection/async-operation-authority-v1/`：public task/starter/
  tests、private candidate/conditions/oracle/practices/evaluator/calibration/snapshot。
- 新增 `injection-calibration/v2` 兼容的 calibration base 共享声明（复用 react-vite
  app-shell/v2 base 并绑定 digest）。
- 不修改 skill-trigger v4、共享 judge、suite、treatment 或 record；不创建正式 record、
  不升级 suite revision。
