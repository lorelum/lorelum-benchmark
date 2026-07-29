## Context

Issue #90 是 `injection-calibration/v1` profile 的首个执行集成 change。它要把 #89 已
校准的两个 candidate（`profile-update-command-boundary-v1` 与
`project-directory-resource-state-v1`）接入本地诊断执行，但不局限于这两个 candidate：
执行器只认 profile 契约，对任意声明 `core/v1` + `injection-calibration/v1` +
`react-vite` 的已验证 candidate 均可执行三条件对照。当前两个 candidate 作为首批验证
管线，后续 #91 扩大样本时执行器零代码改动。

仓库已有四条执行路径，均不满足 #90：

1. `execute.ts` 创建正式 artifact manifest——#90 禁止正式 manifest。
2. `coordinator.ts` 创建正式 run manifest 与 run record——#90 禁止正式 record。
3. `local-diagnostic-driver.ts` 依赖 experiment plan，走 `request-generator` ->
   `execute` -> `evaluate`，未集成 profile runtime 的 condition-specific resolver，
   不验证 candidate 输入身份，也无法结构性保证 baseline 不取得 Practice 文本。
4. 旧 `run-local.ts`（#75）是非-kernel 自由格式执行器，#90 明确禁止回放，且 #75 结果
   不得与 profile v1 混跑。

`injection-calibration/v1` profile runtime（`runtime.ts`）已提供三个 API：

- `resolveInjectionCalibration(candidatePath)` -> `ResolvedInjectionCalibration`，含
  `profile_input_hash`、四个 condition 的 resolved 状态与 calibration。
- `resolvePracticePayload(candidatePath, profile, conditionId)` -> `PracticePayload`，
  baseline 返回的 payload 无 `practice` 字段（结构性保证 baseline 不取得文本），
  oracle/irrelevant 返回含 `practice.text` 的内存载荷。
- `redactedInjectionTrace(profile, payload)` -> `RedactedInjectionTrace`，只记录
  `condition_id`、`channel`、`profile_input_hash`、Practice ID/version/SHA-256。

#90 要新建一个独立执行器，复用 kernel 的 `materialize`/`isolate` 与 profile runtime
API，但不走正式链路，不创建 manifest/record。

## Goals / Non-Goals

**Goals:**

- 提供一个对任意 `injection-calibration/v1` candidate 通用的诊断执行器，新增 candidate
  时执行器零代码改动。
- 在每次运行前验证 candidate 输入身份（`source_commit`、`snapshot_id`、
  `profile_input_hash` 三者自洽），验证失败时不创建工作区、不请求模型。
- 在每 candidate 首次执行前运行 #94 等价 preflight（Pi 可启动 + 模型端点可达），
  fail-closed，不消耗任务预算。
- 只通过 condition-specific resolver 取得内存 Practice payload；baseline 结构性
  无文本；Practice 文本只作为 Pi `--append-system-prompt` 参数传入进程，不 materialize
  到 workspace/trace/summary/日志。
- 在 ignored `scratch/` 下保留按 candidate × condition × repeat 分组的脱敏诊断产物；
  异常隔离，不中断其他候选。
- 不创建正式 manifest/record/suite revision，不执行 retrieval/盲评/成本时延/Wiki。

**Non-Goals:**

- 修改任一 candidate 的 source、Practice、evaluator、calibration 或 snapshot。
- 修改 #75 的 `run-local.ts` 行为或其 snapshot 覆盖范围；仅提取 preflight helper
  供新执行器复用。
- 扩大 candidate/Practice 样本数量或重复次数（#91 职责）。
- 汇总诊断结果或报告方向性信号（#92 职责）。
- `--resume` 或改变执行输入的参数调整（首版范围外，需新执行计划与输入身份）。
- 正式 manifest、record、retrieval、盲评、成本/时延统计或 Wiki 发布。

## Decisions

> 以下为规划澄清阶段确认的结论，实现前必须写回本节与 `tasks.md`。
> OpenSpec strict validation 通过且初始 PR 创建后，进入规划澄清阶段。

### 规划澄清门禁（已确认）

以下实现细节不改变题面、oracle、对照、评测或结论解释，已按现有上下文安全推断确认：

- **D1 重复次数**：执行器首版固定使用 conditions.yaml 声明的 `repetitions` 值，不接受
  `--repeat` 覆盖。与 #91 "不少于三次" 的扩大阶段区分；#91 固定新执行计划时再提高重复。
- **D2 模型与环境**：首版固定使用 conditions.yaml 声明的
  `deepseek/deepseek-v4-pro` + 本地 Pi（`LORELUM_LOCAL_EXPERIMENT=1`），不支持多模型。
- **D3 candidate 发现方式**：执行器接受显式 candidate 路径列表参数，不自动扫描
  `incubator/practice-injection/`；调用方负责选择候选，执行器只验证声明。
- **D4 preflight 复用**：从旧 `run-local.ts` 提取 `preflightModel` 语义为共享 helper
  `preflightPiAndModel`，供新执行器复用；不修改 `run-local.ts` 行为或其 snapshot 覆盖
  范围。

### 执行器与 candidate 解耦

执行器只认 profile 契约，不 hardcode candidate 特定逻辑。candidate 发现通过显式路径
列表：对每个路径读 `private/candidate.yaml`，校验 `kernel.core === v1`、
`kernel.profile === injection-calibration/v1`、`kernel.materializer_kind === react-vite`。
拒绝非该 profile 的 candidate（如旧 `login-page-layered-api-v1`），从源头隔离 #75。

### 输入身份验证（per candidate，fail-closed）

执行器读 `private/snapshot.json`，校验：

1. `snapshot_id` 与 `resolved` 块存在且自洽。
2. `resolved.profile_input_hash` 与 snapshot 顶层一致。
3. 调 `resolveInjectionCalibration(candidatePath)` 取得 profile，比对
   `profile.profile_input_hash` 与 snapshot `resolved.profile_input_hash` 一致。
4. `source.source_commit` 与 candidate.yaml 声明一致。

任一不匹配 -> 标记 `not-executable` 并记录原因，不创建工作区、不请求模型。

### Preflight 泛化（#94 语义，per candidate 首次执行前）

从旧 `run-local.ts` 提取 `preflightModel` 逻辑为共享 helper
`preflightPiAndModel(command, modelId)`：`pi --version` 验证二进制 +
`pi --print --no-session --model <id> ok` 验证模型可达（30s 短超时，不消耗任务预算）。
失败 -> fail-closed，不进入执行循环。对同一 candidate 只跑一次（多 condition/多 repeat
共享）。不修改 `run-local.ts` 行为或其 snapshot 覆盖范围。

### Condition-specific 执行循环

对每个 candidate 的三个 declared condition（baseline、oracle-practice、
irrelevant-practice）× N repeat：

1. clean copy `public/starter` + `public/task.md` 到临时 workspace。
2. assert workspace 内无 `private/` 或 `practices/` 文件。
3. `payload = resolvePracticePayload(candidatePath, profile, conditionId)`：
   - baseline: `payload.practice` 为 `undefined`（结构性保证，非 if-else 特判）。
   - oracle/irrelevant: `payload.practice` 含 `text`（仅内存）。
4. `trace = redactedInjectionTrace(profile, payload)`：只记 id/version/sha256。
5. 构造 Pi args：base args + `--append-system-prompt <practiceText>`（仅当
   `payload.practice` 存在）。baseline 不加该参数 -> 永远拿不到 Practice 文本。
6. 运行 Pi（budget 来自 conditions.yaml），运行 evaluator，收集结果。
7. 写 entry 到 `scratch/.../<candidate>/<condition>/attempt-<repeat>/`。

### 脱敏与隐私边界

- trace 只用 `redactedInjectionTrace`，不含 Practice 文本、私有路径或工作区路径。
- Practice 文本只作为 CLI 参数传给 Pi 进程内存，从不写入 workspace 文件。
- summary 只记录 `condition_id`、channel、Practice ID/version/SHA-256、
  `profile_input_hash`、source commit、snapshot ID、重复编号、语义结果、质量 probe
  与异常。
- `lorelum-retrieval` 条件为 `unavailable`，执行器跳过，不请求 retrieval。

### 异常隔离

单个 candidate/condition/repeat 失败 -> 记录到 entry，`continue` 到下一个，不中断
整批。starter/snapshot/evaluator 问题 -> 标 `not-executable`，不解释为 Practice 效果。

## Risks / Trade-offs

- [执行器绕过 profile resolver] -> 执行器只通过 `resolvePracticePayload` 取得 payload，
  不直接读 Practice 文件；baseline 的无文本保证由 runtime API 结构性提供。
- [Practice 文本泄露到 workspace/trace] -> 文本只作 CLI 参数传入进程内存；workspace
  复制后 assert 无私有文件；trace 只用 redacted API。
- [混合不同 profile input] -> 每个 candidate 验证 `profile_input_hash` 自洽；
  summary 按 candidate × profile_input 分组，不跨 input 相加。
- [preflight 失败后仍创建工作区] -> preflight 在执行循环之前，fail-closed 直接退出。
- [旧 run-local.ts 行为被改变] -> 仅提取 helper，不修改 run-local.ts 逻辑或 snapshot。

## Migration Plan

1. 完成 strict OpenSpec validation 并创建本 change 的 OpenSpec-only PR。
2. 向需求方确认规划澄清门禁 D1-D4，将结论写回本 design 与 `tasks.md`。
3. 实现输入身份验证与 fail-closed preflight helper（复用 #94 语义）。
4. 实现 condition-specific 执行循环，集成 profile runtime 的三个 API。
5. 实现 scratch 诊断产物与脱敏 summary。
6. 实现 focused tests 覆盖 issue 验证要求。
7. 执行 public/private 泄露审计、`bun run validate`、OpenSpec strict validation；
   记录结果及未执行的 Pi、模型、retrieval、盲评与正式 record。

## Confirmed Evolution Model

本 change 新增 `profile-diagnostic-runner` capability，不修改既有 spec。后续 #91 扩大
样本时复用同一执行器，#92 汇总时消费执行器产出的 scratch 原始结果。执行器版本演进
通过新 capability version 表达，不改写已冻结 candidate 的 source 或 identity。
