## Why

Issue #137：新登录页 candidate（#135）、仓库级 JudgeAgent（#133）、runner 生命周期
修复（#134）与登录页 rubric 校准（#136）完成后，需要一次受控的三条件诊断 pilot，
观察 Practice 是否带来分层与 UI/UX 质量改善，并把功能通过、judge 分数和执行健康
分开记录。本 pilot 只产出诊断性/不确定结论，不创建正式记录或发布结论。

## What Changes

- 为 `login-page-auth-flow-v1` 提供 candidate 私有的诊断 pilot 执行器（沿用 #75
  的 `run-local.ts` 模式并扩展）：每个条件×重复次数使用干净 workspace，仅复制
  `public/task.md` 与 `public/starter/`，Practice 通过运行时通道注入。
- 每次尝试运行语义 evaluator 与 JudgeAgent（登录页 rubric，`judge-result/v1`
  sidecar）：记录 judge raw dimensions、执行失败类别、runner/模型身份与各类
  SHA-256 hash（source commit、snapshot、rubric、profile、input）。
- 固定三条件对照：baseline / oracle-practice / irrelevant-practice，相同重复次数、
  模型、提示、工具权限与预算；`lorelum-retrieval` 保持 unavailable。
- 执行前门禁：plan dry-run、public/private audit、runner/evaluator preflight、
  JudgeAgent preflight；通过后才调用模型。
- 输出脱敏 summary 与 raw 结果到被忽略的 `scratch/`，不创建正式 record、suite
  revision 或发布报告；只报告该 candidate 的诊断性/不确定结果。

## Capabilities

### New Capabilities

- `login-page-auth-flow-diagnostic-pilot`: 定义登录页 candidate 的三条件诊断
  pilot 执行契约：冻结执行计划、干净 workspace、Practice 运行时注入、语义 +
  JudgeAgent 逐次评测、脱敏 summary 与身份绑定、执行失败分类，以及只读诊断结论。

### Modified Capabilities

- 无（不修改仓库级 runner、schema、`judge-result/v1` 或既有 stable spec）。

## Impact

- Candidate private：`incubator/practice-injection/login-page-auth-flow-v1/private/execution/`
  新增 pilot 执行器与测试；沿用 `private/conditions.yaml`、`private/judge/` 与
  snapshot。
- 校验：plan dry-run、public/private audit、JudgeAgent preflight、
  `bun run test:pi:v2`、`bun run validate`、OpenSpec strict validation、
  `git diff --check`。
- 范围：#137。不修改已有运行计划或历史结果；不创建正式 suite revision、正式
  record 或发布报告；不做跨 candidate、因果、产品效果或 #92 结论；不归档或合并
  当前 #125。
