## Why

Issue #90 要求对已校准的 `injection-calibration/v1` candidate 批量执行
baseline、oracle-practice、irrelevant-practice 三个可执行条件。当前仓库有三条
执行路径，均不满足 #90 的诊断执行约束：

- `runner/pi/v2/execute.ts`（`pi`）创建正式 artifact manifest，#90 禁止正式 manifest。
- `runner/pi/v2/coordinator.ts`（`pi:coordinate`）创建正式 run manifest 与 run record，
  #90 禁止正式 record。
- `runner/pi/local-diagnostic-driver.ts`（`pi:diagnose`）依赖 experiment plan 与
  `request-generator`，未集成 profile runtime 的 condition-specific Practice resolver，
  不验证 candidate 输入身份，也无法保证 baseline 从不取得 Practice 文本。
- 旧 `run-local.ts`（#75）是非-kernel 自由格式执行器，#90 明确禁止将其当作 profile v1
  runner 回放，且不得与 profile v1 结果混跑。

`injection-calibration/v1` profile runtime 已提供
`resolveInjectionCalibration`、`resolvePracticePayload` 与 `redactedInjectionTrace`
三个 API，但尚无执行器把它们接入一个 fail-closed 的本地诊断循环。#90 是该 profile 的
首个执行集成 change。

## What Changes

- 新增一个 profile-aware 诊断执行器
  `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`，接受任意声明
  `core/v1` + `injection-calibration/v1` + `react-vite` 的已验证 candidate，不
  hardcode 任一 candidate 特定逻辑；新增 candidate 时执行器零代码改动。
- 执行器在每次运行前验证 candidate `source_commit`、`snapshot_id` 与 resolved
  `profile_input_hash` 三者自洽，验证失败时不创建工作区、不请求模型、不进入执行循环。
- 执行器在每 candidate 首次执行前运行 #94 等价 preflight（Pi 可启动 + 模型端点
  可达），失败时 fail-closed；preflight 不消耗任务预算，使用独立 30 秒超时。
- 执行器只通过 condition-specific resolver 取得内存 Practice payload：baseline
  不取得任何 Practice 文本，oracle-practice 与 irrelevant-practice 仅在各自运行中
  取得各自卡片文本；Practice 文本只作为 Pi `--append-system-prompt` 参数传入进程，
  不得 materialize 到 workspace、trace、summary 或日志。
- 在 ignored `scratch/` 下保留按 candidate、condition、重复编号分组的诊断产物与
  脱敏摘要；trace 只记录 `condition_id`、channel、Practice ID/version/SHA-256、
  `profile_input_hash`、source commit、snapshot ID、重复编号、语义结果、质量 probe
  与异常。单个 candidate/condition/repeat 异常必须隔离记录，不中断其他候选。
- 不创建正式 run manifest、正式 record 或 suite revision；不执行 retrieval、盲评、
  成本/时延统计或 Wiki 发布。`--resume` 和任何改变执行输入的参数调整不属于首版范围。

## Capabilities

### New Capabilities

- `profile-diagnostic-runner`: 定义 `injection-calibration/v1` profile-aware 本地
  诊断执行器的输入身份验证、fail-closed preflight、condition-specific Practice
  payload 解析、baseline 无文本保证、脱敏 trace 与异常隔离契约。

### Modified Capabilities

无。本 change 不修改 `practice-env-preflight` 的既有 requirement；preflight 语义被
复用并泛化到 per-candidate 首次执行，但既有 spec 不改动。

## Impact

- 代码：新增 `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts` 与配套
  focused tests；提取 #94 preflight 逻辑为共享 helper 供执行器与旧 `run-local.ts`
  复用，不修改 `run-local.ts` 的行为或其 snapshot 覆盖范围。
- 候选：不修改任一 candidate 的 source、Practice、evaluator、calibration 或
  snapshot；执行器只读取已验证产物。
- 验证：覆盖 resolver 调用顺序、baseline 无 payload、条件范围、输入身份校验、
  脱敏 trace、异常隔离和 preflight fail-closed；`bun run validate`、OpenSpec
  strict validation 与 public/private 泄露审计通过。不运行 Pi、模型、retrieval、
  盲评或正式 record。
- 关联 issue：#90；前置依赖 #89（candidate 校准交付）、#94（preflight 语义）、
  #101（kernel）、#102（profile runtime）。后续衔接 #91（扩大样本）与 #92
  （汇总诊断结果）。
