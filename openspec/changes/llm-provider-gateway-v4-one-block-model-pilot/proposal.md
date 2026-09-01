## Why

`llm-provider-gateway-v4-two-stage-structure`（#185 / PR #186）已合并并通过 offline calibration，但该 change 的边界是零模型调用：candidate model calls 与 judge model calls 均为 0。v4 的生产执行链路——Stage 1 → 同 workspace / 同 Pi session 的 Stage 2、15+15 分钟模型预算、timeout、snapshot 与 dependency immutability——从未在真实模型下运行过。需要一次 diagnostic-only 的 one-block 真实模型 pilot（#188）验证这些链路，并观察三条件的 deterministic structure observation 是否出现可读差异，然后才能决定是否申请多 block directional screen。

## What Changes

- 新增一个 production Pi adapter 与 one-block pilot driver，复用 `src/benchmark/runner/pi/v2/staged/` 既有 fail-closed 语义（`runStagedDiagnosticAttempt` 不修改）。
- 按 `staged-profile-diagnostic-plan/v1`（cyclic-latin-square/v1、`schedule_seed`）执行一个 block：3 个 attempt，覆盖 baseline / oracle-practice / irrelevant-practice。
- 每个 attempt 的 Stage 1 / Stage 2 各最多 15 分钟模型执行预算（offline evaluator 时间不计入）；超时触发进程树终止并记录 execution unhealthy。
- Stage 2 必须恢复同一 Pi session；resume 失败或 session id 不一致即 execution unhealthy，不降级为 no-session。
- 不使用 LLM judge、不使用加权 structure score、不做 automatic semantic retry；unhealthy / indeterminate attempt 保留在 planned denominator。
- 新增 preflight 模式：candidate snapshot / profile identity 校验、Pi adapter 与 credential/endpoint 审计（不提交 secret）、timeout/cancellation 演练、Stage 1 leakage audit、dry-run 三条件计划（zero model calls）。
- transcript 与 run workspace 存放在仓库外（scratch 目录，git ignored），绝不提交；public summary 仅含 run/attempt id、condition、session binding state、必要 hash、execution health、semantic label、structure check labels、raw metrics。
- 不修改 v4 candidate 的题面、oracle、Practice、evaluator 语义、snapshot identity、conditions 语义或 offline calibration 结论；不创建 formal record、不升级 suite revision、不出 Practice effect 或 directional-screen 结论。

## Capabilities

### New Capabilities

- `llm-provider-gateway-v4-model-pilot`: 定义对 `llm-provider-gateway-v4` 执行 one-block 真实模型 diagnostic pilot 的要求——preflight 门禁与 zero-model-call dry-run、单 block 三条件调度、每 stage 15 分钟模型预算与进程树终止、same-session fail-closed resume、no-judge / no-weighted-score / no-semantic-retry、planned denominator 保留、redacted public summary、仓库外 artifact 边界。

### Modified Capabilities

无。`two-stage-practice-structure` 与 `llm-provider-gateway-v4-two-stage-structure` stable specs 已定义 staged 语义；本 change 只落地其授权的一次真实模型执行。

## Impact

- 只读复用：`incubator/practice-injection/llm-provider-gateway-v4/` 冻结不动；`src/benchmark/runner/pi/v2/staged/` 的 fail-closed attempt 语义不改。
- 新增代码：production Pi adapter（session start/resume、超时终止）、pilot driver CLI（preflight / dry-run / one-block 执行）、focused tests。
- 依赖：#188 的 one-block model-call 授权（仅 preflight 全通过后执行）；本地 `pi` 0.80.10、`deepseek/deepseek-v4-flash`、DeepSeek API credential 环境变量。
- 产出：redacted diagnostic summary 与 run artifacts（`scratch/`，不提交）；不进入 `results/records`，不升级 suite revision。
