## Why

#94 要求在 Practice 候选实跑前探活模型端点。当前 `run-local.ts:291` 只做 `pi --version`，
仅证明二进制存在，不验证模型端点可达或 API key 有效；模型不可达要等到第一次 `runAttempt`
实际调用 Pi 时才暴露，此时已进入实跑循环、已复制工作区、已消耗等待时间。#89 将新增多个候选，
环境问题若在每次实跑时才暴露会重复浪费。

## What Changes

- 在 `incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts`
  实跑入口（`pi --version` 之后、runAttempt 循环之前）增加一次轻量模型可达性探活：用极小
  prompt 调用 Pi `--print`，验证模型端点可达且 key 有效，失败则不进入 runAttempt 循环。
- 探活失败时以退出码 1 失败并在 stderr 报告具体原因（key 缺失 / 端点不可达 / 模型 ID 无效），
  不创建摘要、不写 record。
- 探活设独立短超时（建议 30 秒），不受 `conditions.yaml` 的 `max_duration_minutes` 任务预算
  约束。
- 不修改评分机制、evaluator、`verify-layering.ts` 或 `conditions.yaml`。由于本 change 修改了
  候选快照覆盖的本地执行器，会重新生成 `private/snapshot.json`，仅固定新的执行器与测试哈希。

## Capabilities

### New Capabilities

- `practice-env-preflight`: 定义 Practice 候选本机实跑前的执行环境前置检查行为：Pi 可启动、
  模型端点可达、key 有效，作为进入 runAttempt 循环前的硬门禁，不消耗任务预算。

### Modified Capabilities

无。本 change 不修改已归档 `login-practice-probe-fixture` 或 `login-practice-pilot-execution`
的既有 requirement。

## Impact

- 代码：`incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts`
  实跑入口；`run-local.test.ts` 新增探活测试。
- 候选：重新生成 `private/snapshot.json`，使其覆盖新的本地执行器和测试；不改变 evaluator、
  verify-layering.ts、conditions.yaml、评分机制或正式 runner。
- 验证：`bun run validate` 与新增探活聚焦测试。
- 关联 issue：#94。
