## Why

Issue #134：#91 第二 candidate 的诊断运行出现 `http://127.0.0.1:4173 is already used`。
Playwright 配置固定端口，前一次 evaluator 遗留的 Vite/Playwright 子进程会阻止后续
attempt 启动。现有 Pi shim 超时清理（`execute.ts`/`coordinator.ts` 的进程树清理）不覆盖
profile diagnostic runner 使用的 `preflight.ts` `run`：其超时只 `child.kill()`，会遗留
WebServer 子进程，导致启动失败被误读成 candidate 或 Practice 失败。

## What Changes

- 保证每次诊断 attempt 的 WebServer、Playwright worker 与 evaluator 独立启动、结束和
  清理：evaluator 使用独立端口（动态端口或受控 supervisor，待规划确认），连续 attempt
  不产生端口冲突或残留进程。
- evaluator 正常退出、失败和超时后都清理子进程（Windows 与 Linux），复用仓库已验证的
  进程树终止能力，并为 profile diagnostic 路径接入统一清理。
- 启动失败、依赖失败和 evaluator 超时使用稳定的脱敏分类（沿用现有
  `execution-failed` 语义与稳定 error 类别），不进入语义/Practice/joint-pass 比较。
- 保留 public-only workspace 与 private evaluator 边界，不修改登录页题面、Practice、
  Oracle 或质量 rubric，不改历史 record，不重跑 #91 结果。
- **BREAKING（仅 runner 健康行为）**：profile diagnostic evaluator 启动路径不再依赖固定
  端口，启动/清理语义收紧，但不改变 evaluator-result/v2 或诊断结果字段。

## Capabilities

### New Capabilities

- `evaluator-webserver-lifecycle`: 定义诊断 evaluator 的 WebServer 独立端口、进程
  启动/结束/清理契约与连续 attempt 隔离要求。

### Modified Capabilities

- `profile-diagnostic-evaluator-health`: 把 WebServer 启动失败、依赖失败与超时纳入
  稳定脱敏的 execution-failed 分类，禁止启动失败产生语义/质量结论。
- `profile-diagnostic-runner`: 要求每次 attempt 使用隔离端口并清理 evaluator 子进程，
  连续 attempt 不得端口冲突或残留。

## Impact

- Runner：`src/benchmark/runner/pi/v2/preflight.ts`（统一进程树清理的 `run`）、
  `profile-diagnostic-runner.ts`（evaluator 启动/端口注入/清理）与聚焦测试。
- Evaluator 契约：诊断 attempt 的 WebServer 生命周期；不改写 evaluator-result/v2、
  冻结 helper 或现有 candidate 私有 evaluator 语义。
- 范围：#134。不产生 candidate、snapshot、模型运行或正式 record；不修改登录页题面/
  Practice/Oracle/质量 rubric；不改历史 record。