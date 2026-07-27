## Context

`incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts` 是
登录页候选的本地执行器。当前实跑入口（`run-local.ts:291`）只执行 `pi --version` 探活，确认
Pi 二进制能启动，但不验证模型端点可达或 API key 有效。模型不可达的失败要等到第一次
`runAttempt`（`run-local.ts:192`）实际调用 Pi `--print` 时才暴露，此时已进入实跑循环、已
复制工作区、已消耗等待时间。

#89 将新增多个候选，若环境问题在每次实跑时才暴露，会重复浪费工作区复制和时间。本 change 在
实跑入口增加一次轻量模型可达性探活，使环境问题在进入 runAttempt 循环前、不消耗任务预算时
即暴露。

Pi 是一个带 `--print` 模式的编码 agent（`pi --print --model <id> <prompt>`），其 `--version`
不触发模型调用。因此模型可达性必须通过一次真实的（但极小的）`--print` 调用验证。

## Goals / Non-Goals

### Goals

- 在 `pi --version` 之后、runAttempt 循环之前，用极小 prompt 调用 Pi `--print` 探活模型端点。
- 探活失败时以退出码 1 失败并在 stderr 报告原因，不进入 runAttempt 循环、不创建摘要。
- 探活设独立短超时（30 秒），不受任务 `max_duration_minutes` 预算约束。
- 探活不读取 private 材料、不把 key 写入日志或摘要。

### Non-Goals

- 不修改评分机制、evaluator、`verify-layering.ts` 或 `conditions.yaml`。本地执行器和测试变更后会
  重新生成 `private/snapshot.json`，以保持候选输入自洽。
- 不做完整 smoke run（不跑任务题面、不跑 evaluator），只做连通性探活。
- 不创建正式 record、run manifest 或冻结 suite revision。
- 不引入 formal sandbox、模型快照或发布级证据链。
- 不修改 #75 已记录的本地结果。

## Decisions

### 决策 1：探活复用 Pi `--print`，不直接调 provider API

探活通过 `pi --print --model <id> --no-session "ok"` 之类极小调用验证，而非直接 HTTP 调用
DeepSeek `/models` 端点。理由：探活应走与实跑相同的 Pi 路径，这样能同时验证 Pi 二进制、
模型 ID 解析、provider 配置和 key 有效性；直接调 provider API 会绕过 Pi 的模型路由逻辑，
通过不能保证 Pi 实跑也能通。

替代方案：直接调 provider `/models` 端点。否决，因为绕过 Pi 路径，探活与实跑行为不一致。

### 决策 2：探活设独立 30 秒超时

探活不受 `conditions.yaml` 的 `max_duration_minutes`（10 分钟）约束，单独设 30 秒超时。
理由：探活只发极小 prompt，正常应在数秒内返回；30 秒足以覆盖冷启动和网络延迟，又不会让
维护者长时间等待才得知环境未就绪。探活超时视为不可达，失败退出。

替代方案：复用任务预算超时。否决，因为 10 分钟太长，环境未就绪时应快速失败。

### 决策 3：探活失败硬退出，不支持 continue-on-failure

环境未就绪时直接以退出码 1 退出，不进入 runAttempt 循环，不创建摘要。理由：环境问题会影响
所有条件所有重复，继续跑只会产出全部失败的无效结果，浪费预算。

替代方案：允许 `--continue-on-failure` 跳过。否决，因为环境前置失败不应继续。

### 决策 4：探活 prompt 与 key 不写入日志

探活调用不把 API key 或探活 prompt 明文写入 stdout/stderr 或摘要。失败信息只报告类别
（key 缺失 / 端点不可达 / 超时 / 模型 ID 无效），不回显 key。

## Risks / Trade-offs

- [探活本身消耗少量模型 token] -> 探活 prompt 极小（单字），token 成本可忽略；且在实跑前
  暴露环境问题节省的预算远大于此。
- [provider 不支持极小请求或最小计费单元较大] -> 探活仍真实调用，成本仍远低于一次完整实跑；
  若 provider 完全不可达，探活快速失败不产生额外成本。
- [探活与实跑的 Pi 调用参数细微差异] -> 探活复用 `piCommand()` 解析的同一命令路径和
  `conditions.shared_execution.model.id`，差异仅在 prompt 和超时，均不影响环境可达性判断。

## Migration Plan

1. 在 `run-local.ts` 实跑入口 `pi --version` 之后、runAttempt 循环之前，增加 `preflightModel`
   函数：用极小 prompt 调用 Pi `--print`，30 秒超时，失败则 `fail()` 退出。
2. 在 `run-local.test.ts` 新增测试：探活失败时不进入 runAttempt 循环、不创建摘要；探活成功
  时进入循环（用 fake Pi 模拟两种情况）。
3. 运行 `bun run validate`。
4. 回放登录页候选实跑，确认探活在实跑前执行且不影响已有结果。

回滚：revert 该分支提交即可，实跑入口回到只做 `pi --version`。

## Resolved Decisions

以下问题已在规划澄清阶段与需求方确认：

- **探活 prompt**：固定为 `"ok"`，目的只是触发一次模型往返，不关心输出内容。
- **dry-run 时是否执行探活**：不执行。dry-run 不消耗任何预算，探活属于实跑前置，仅在非
  dry-run 的实跑入口执行。
- **探活失败信息分类**：尽量从 Pi stderr 区分 key 缺失 / 端点不可达 / 超时 / 模型 ID 无效；
  若无法可靠区分，统一报"模型不可达"并附不含 key 的原始 stderr 摘要。

四个核心决策（探活方式、超时、失败处理、dry-run 行为）已在 Decisions 1-4 中固化，实现按此
执行。
