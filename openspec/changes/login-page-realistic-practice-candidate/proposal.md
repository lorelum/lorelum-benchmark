## Why

Issue #135：现有 `login-page-layered-api-v1` 来自早期探针，已有历史运行结果，不能
直接改写。仓库需要一个更接近真实开发派活的登录页 candidate，用于验证仓库级
JudgeAgent（#133）与 Practice refinement。该 candidate 的题面要让 Agent 自己查看
项目中实际存在的 API 说明和代码，而不是给出固定测试夹具路径或 benchmark 语言。

## What Changes

- 在 `incubator/practice-injection/` 新建真实开发风格的登录页 candidate
  （独立新 candidate，不改写 `login-page-layered-api-v1` 或历史结果）。
- 题面使用简短自然的任务表述：查看现有登录 API，接通登录页，处理表单/UI/UX 和
  分层，改完跑现有测试；不硬编码不存在的路径，不暴露私有验收结构。
- 提供真实可见的 API contract、starter 和现有测试入口；API 说明位置由
  starter/repository 实际内容决定。
- 私有 evaluator 只验证题面声明的可观察功能；分层、UI/UX 和表单质量交给质量评分
  （沿用仓库级硬/软门槛契约 #132 与 JudgeAgent 能力 #133 的边界）。
- 保持 public/private 隔离，不暴露 Oracle、Practice 或私有 evaluator；创建新的
  private snapshot。
- 不进入默认 suite，不创建正式 record；完成后只进入独立 calibration/pilot issue。

## Capabilities

### New Capabilities

- `login-page-realistic-practice-candidate`: 定义真实开发风格登录页 candidate 的
  题面、starter、API contract、私有 evaluator 与质量评分边界。

### Modified Capabilities

- `practice-benchmark-boundaries`: 应用五类信息边界到新登录页 candidate，明确题面
  不硬编码 API 文档路径、私有 evaluator 只验证题面声明的可观察功能。

## Impact

- Candidate：`incubator/practice-injection/<new-slug>-v1/`（public/private、starter、
  API contract、evaluator、calibration、snapshot）。
- 文档：`docs/PRACTICE_BENCHMARK_GUIDE.md` 补充真实开发风格题面与 API contract
  约定（如适用）。
- 范围：#135。不修改 `login-page-layered-api-v1` 或历史结果；不实现仓库级
  JudgeAgent；不执行正式 benchmark 或跨 candidate 比较；不把 reference 布局作为
  硬门槛；不创建正式 record。