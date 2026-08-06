## Why

#91 的两个 incubator candidate（`profile-update-command-boundary-v1`、`project-directory-resource-state-v1`）仍沿用旧设计：验收腔题面、starter 已把任务全部做完（baseline 无注入即全过，无 Practice 可观测缺口）、公开测试依赖产品内 `window.__` 埋点、Practice 以 practice-card 形态注入。#143/#145/#149 已把「真实题面 + 制造可观测缺口 + 公平可解释评分」沉淀为主线规范；若不修订，直接用 v1 扩样会把天花板/埋点/题面失真带进结论。

## What Changes

- 新建两个 v2 candidate：`incubator/practice-injection/profile-update-command-boundary-v2/` 与 `incubator/practice-injection/project-directory-resource-state-v2/`（不改写 v1 与 #91 scratch 历史身份）。
- v2 `public/task.md` 以真实工单口吻声明可观察行为与基本分层要求（baseline 有机会做到），详细约定由 Practice 提供。
- v2 starter 为真实占位：保留传输 adapter（`src/services/http.ts`）与 API 文档，移除预置领域翻译/查询边界，不预置任何 `window.__` 埋点；公开测试经 `page.route` 拦截 API，不依赖产品内计数。
- Practice 以项目内规范 `docs/frontend-guide.md` 条件化注入（`injection-calibration/v2` + `project-convention/v1`，oracle/irrelevant 可见、baseline 不可见），公共痕迹只记录版本与 hash。
- 私有 evaluator/probe 按职责可解释（required responsibilities / forbidden responsibilities），完成 reference / equivalent / anti-pattern 校准与离线缺口验证。
- 生成并校验 snapshot，通过 public/private 泄露审计、`bun run validate`、OpenSpec strict。
- 不调用模型、不创建正式 record、不升级 suite revision。

## Capabilities

### New Capabilities

- `practice-injection-candidate-v2`: 定义 #91 两个 Practice-injection candidate 的 v2 修订要求：真实题面、占位 starter 与可观测 Practice 缺口、无产品内埋点、项目内规范条件化注入、职责可解释探针与校准/离线缺口验证、身份与历史保留。

### Modified Capabilities

- 无（现有 `practice-benchmark-boundaries`、`login-page-task-headroom`、`login-page-auth-flow-diagnostic-pilot` stable spec 已覆盖评分公平性与注入形态；本 change 只落地实现）。

## Impact

- Candidate：`incubator/practice-injection/profile-update-command-boundary-v2/`、`incubator/practice-injection/project-directory-resource-state-v2/`（public/private、starter + git-history manifest、conditions/oracle/evaluator、calibration、snapshot）。
- 复用：`injection-calibration/v2` profile 与 `project-convention/v1` 交付模板（#147 已合并）、`verify-command-boundary.ts` / `verify-resource-state.ts` 探针思路（按职责升级为 v2）。
- 不改写：`profile-update-command-boundary-v1`、`project-directory-resource-state-v1`、#91/#125 执行计划与 scratch 结果。
- 不进入默认 suite，不创建正式 record。
