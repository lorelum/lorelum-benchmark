## Why

#88 要求把 Practice 候选实跑前的 `--dry-run` 固化为强制门禁。当前 `run-local.ts` 的
`--dry-run` 只输出计划 JSON，跳过了 `runAttempt` 中的工作区复制和 private 泄露检查；后续
扩展候选（#89）若不在实跑前验证工作区干净，会重复 #75 早期的 private 泄露问题。

## What Changes

- 扩展 `incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts`
  的 `--dry-run` 分支：在输出计划 JSON 前，先复制一次干净工作区、列出实际文件清单，并断言
  不含 `private/` 或 `practices/` 材料；不调用模型、不运行 evaluator。
- 在 `run-local.test.ts` 增加聚焦测试：dry-run 产物包含实际工作区文件清单，且清单不含
  private 材料；dry-run 不产生 Pi 调用或 evaluator 输出。
- 不修改评分机制、evaluator、探针、conditions.yaml 或已记录的本地结果。
- 不创建正式 record、run manifest 或冻结 suite revision。

## Capabilities

### New Capabilities

- `practice-candidate-dryrun-gate`: 定义 Practice 候选实跑前的本地 dry-run 门禁行为：
  复制干净公开工作区、验证不含 private 材料、不消耗模型预算，作为后续每个候选实跑的前置。

### Modified Capabilities

无。本 change 不修改已归档 `login-practice-probe-fixture` 的既有 requirement，也不改写
`login-practice-pilot-execution` 已声明的三条件对照与结果边界。

## Impact

- 代码：`incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts`
  的 dry-run 分支；`run-local.test.ts` 新增测试。
- 不影响：evaluator、verify-layering.ts、conditions.yaml、snapshot.json、评分机制、正式 runner。
- 验证：`bun run validate` 与新增 dry-run 聚焦测试。
- 关联 issue：#88。
