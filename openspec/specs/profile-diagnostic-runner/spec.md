## Purpose

Define the balanced, pre-registered execution and reporting contract for
profile-aware Practice-injection diagnostic runs.

## Requirements
### Requirement: Pre-registered balanced diagnostic schedule
Before creating a workspace or invoking Pi, the profile diagnostic runner MUST
construct and validate a complete schedule for each candidate x
`profile_input_hash`. The schedule MUST record a schedule-only plan seed,
schedule algorithm identifier/version, source commit, snapshot ID, profile
input hash, repeat block, and intended condition order. Every block MUST
contain exactly one baseline, one oracle-practice, and one
irrelevant-practice attempt. The runner MUST reject an incomplete, duplicate,
unbalanced, or identity-mismatched schedule before execution and MUST NOT pass
the plan seed as a provider model parameter.

#### Scenario: Valid schedule is generated before execution
- **WHEN** a validated candidate with a declared plan seed and repeat count is
  prepared for a diagnostic dry run
- **THEN** the runner produces a complete identity-bound schedule with each
  executable condition exactly once in every repeat block before any workspace
  or Pi invocation exists

#### Scenario: Identity mismatch fails closed
- **WHEN** a persisted schedule is presented for a different source commit,
  snapshot ID, candidate, or `profile_input_hash`
- **THEN** the runner records an invalid-plan reason and does not reorder,
  regenerate, create a workspace, or invoke Pi

#### Scenario: Schedule seed is not a model seed
- **WHEN** the runner constructs a diagnostic invocation from a scheduled
  attempt
- **THEN** the plan seed is retained only in schedule metadata and is absent
  from provider model parameters and Pi model arguments

### Requirement: Actual execution order is auditable and redacted
The runner MUST preserve the pre-registered schedule and record actual
attempt order and execution block in its redacted scratch output. Schedule and
result output MUST include only condition IDs and existing redacted Practice
identity metadata; they MUST NOT include Practice text, private paths,
evaluator/oracle material, or workspace paths.

#### Scenario: Actual order can be compared with the plan
- **WHEN** the runner completes or isolates an attempt from a scheduled block
- **THEN** its redacted result identifies the planned block, planned position,
  and actual execution position without exposing private treatment content

#### Scenario: Schedule output preserves private isolation
- **WHEN** a schedule and diagnostic report are persisted to scratch output
- **THEN** neither artifact contains Practice text, a private filesystem path,
  evaluator/oracle content, or a workspace path

### Requirement: Stratified diagnostic analysis retains every planned attempt
The runner MUST report, by candidate x `profile_input_hash` and condition, the
planned denominator, raw `joint_pass` proportion, oracle-minus-baseline and
oracle-minus-irrelevant-practice differences, semantic outcomes, every
Practice observation state, and every evaluation-health state. Unhealthy,
incomplete, and `indeterminate` attempts MUST remain in planned denominators
and their own status counts; the runner MUST NOT exclude them or relabel them
as `not-observed`.

#### Scenario: Non-health result remains in the denominator
- **WHEN** an attempt is invalid-output, execution-failed, not-executable, or
  incomplete
- **THEN** the report retains it in the condition's planned denominator and
  reports its actual health status without adding it to a semantic or Practice
  observation numerator

#### Scenario: Indeterminate observation is retained
- **WHEN** an evaluated attempt has `practice_observation=indeterminate`
- **THEN** the report increments the indeterminate count and does not count it
  as `not-observed` or silently remove it from the comparison

### Requirement: Conclusion grade reflects diagnostic evidence
The diagnostic report MUST include a conclusion grade derived from the
pre-registered plan and observed completion, health, and calibration state.
Three repeats per condition MUST be labeled as directional screening only.
The runner MUST downgrade the conclusion to diagnostic or uncertain when a
planned attempt is incomplete, non-healthy, indeterminate in a required
comparison, or calibration is invalid. It MUST NOT emit causal, generalized,
or reproducible-direction language unless the separately pre-registered
independent-candidate count and uncertainty presentation requirements are
satisfied.

#### Scenario: Three-repeat result is limited to a directional screen
- **WHEN** a complete and healthy plan contains three repeats per condition
- **THEN** the report labels any qualifying difference as a candidate-level
  directional screen and does not label it causal, generalizable, or
  reproducible

#### Scenario: Incomplete plan downgrades the conclusion
- **WHEN** any planned condition attempt is missing or non-healthy
- **THEN** the report emits a diagnostic or uncertain conclusion and preserves
  the blocking status in its summary

### Requirement: 执行器与 candidate 解耦
Profile-aware 诊断执行器 SHALL 接受任意声明 `core/v1` +
`injection-calibration/v1` + `react-vite` 的已验证 candidate 路径，不 hardcode
任一 candidate 特定逻辑。执行器 MUST 通过读 `private/candidate.yaml` 校验 kernel
声明，拒绝不符合该 profile 的 candidate。新增 candidate 时执行器零代码改动。

#### Scenario: 接受合法 profile v1 candidate
- **WHEN** 执行器收到一个声明 `injection-calibration/v1` 的 candidate 路径
- **THEN** 执行器进入身份验证与执行流程

#### Scenario: 拒绝非 profile v1 candidate
- **WHEN** 执行器收到一个不声明 `injection-calibration/v1` 的 candidate（如旧
  `login-page-layered-api-v1`）
- **THEN** 执行器拒绝该 candidate 并记录原因，不创建工作区、不请求模型

### Requirement: 输入身份验证 fail-closed
执行器 MUST 在每次运行前验证 candidate `source_commit`、`snapshot_id` 与 resolved
`profile_input_hash` 三者自洽。执行器 MUST 调用 `resolveInjectionCalibration` 取得
profile 并比对 `profile_input_hash` 与 snapshot 一致。任一验证失败时 MUST 标记
`not-executable` 并记录原因，不创建工作区、不请求模型、不进入执行循环。

#### Scenario: 身份验证通过
- **WHEN** candidate 的 snapshot_id、profile_input_hash 与 source_commit 三者自洽
- **THEN** 执行器进入 preflight 与执行流程

#### Scenario: snapshot_id 不匹配
- **WHEN** snapshot.json 的 snapshot_id 与 resolved 块不自洽
- **THEN** 执行器标记 `not-executable`，不创建工作区、不请求模型

#### Scenario: profile_input_hash 不匹配
- **WHEN** `resolveInjectionCalibration` 返回的 `profile_input_hash` 与 snapshot 不一致
- **THEN** 执行器标记 `not-executable`，不创建工作区、不请求模型

### Requirement: per-candidate fail-closed preflight
执行器 MUST 在每 candidate 首次执行前运行 #94 等价 preflight：验证 Pi 可启动且模型
端点可达。preflight 失败时 MUST fail-closed，不创建工作区、不请求模型、不进入执行
循环。preflight MUST NOT 消耗任务 `max_duration_minutes` 预算，MUST 使用独立 30 秒
超时。同一 candidate 的多个 condition/repeat 共享一次 preflight。

#### Scenario: preflight 通过后进入执行
- **WHEN** preflight 在 30 秒内成功返回
- **THEN** 执行器进入 condition-specific 执行循环

#### Scenario: preflight 失败时不进入执行
- **WHEN** preflight 失败（Pi 不可启动、模型端点不可达、超时或 API key 无效）
- **THEN** 执行器以退出码 1 退出，不创建工作区、不进入执行循环、不创建 summary

### Requirement: condition-specific Practice payload 解析
执行器 MUST 只通过 `resolvePracticePayload` 取得内存 Practice payload。baseline
condition MUST NOT 取得任何 Practice 文本；oracle-practice 与 irrelevant-practice
MUST 仅在各自运行中取得各自卡片文本。Practice 文本 MUST 只作为 Pi
`--append-system-prompt` 参数传入进程内存，MUST NOT materialize 到 workspace、trace、
summary 或日志。

#### Scenario: baseline 无 Practice 文本
- **WHEN** 执行器执行 baseline condition
- **THEN** `resolvePracticePayload` 返回的 payload 无 `practice` 字段，Pi 调用不含
  `--append-system-prompt` 参数

#### Scenario: oracle 取得 oracle 卡片文本
- **WHEN** 执行器执行 oracle-practice condition
- **THEN** payload 含 oracle 卡片的 `text`，且只作为 `--append-system-prompt` 传入 Pi

#### Scenario: Practice 文本不进入 workspace
- **WHEN** 执行器复制 workspace 后
- **THEN** workspace 内不含 `private/` 或 `practices/` 文件，Practice 文本不写入任何
  workspace 文件

### Requirement: 脱敏 trace 与诊断产物
执行器 MUST 用 `redactedInjectionTrace` 生成每条结果的 trace，只记录 `condition_id`、
channel、Practice ID/version/SHA-256、`profile_input_hash`。trace、summary、workspace
与日志 MUST NOT 包含 Practice 文本、私有 Practice 路径或工作区路径。诊断产物 MUST 在
ignored `scratch/` 下按 candidate × condition × repeat 分组。

#### Scenario: trace 不含 Practice 文本
- **WHEN** 执行器生成 trace
- **THEN** trace 只含 `condition_id`、channel、Practice ID/version/SHA-256 与
  `profile_input_hash`，不含 Practice 文本或私有路径

#### Scenario: summary 按输入身份分组
- **WHEN** 执行器生成 summary
- **THEN** summary 按 candidate × profile_input_hash 分组，不同 profile_input 的结果
  不相加、不平均

### Requirement: 异常隔离
单个 candidate/condition/repeat 异常 MUST 隔离记录到对应 entry，MUST NOT 中断其他
候选的执行。starter、snapshot 或 evaluator 问题 MUST 标记 `not-executable` 并保留
原因，MUST NOT 将其结果解释为 Practice 效果。

#### Scenario: 单个 candidate 失败不中断整批
- **WHEN** 一个 candidate 的某个 condition/repeat 失败
- **THEN** 该失败记录到 entry，执行器继续处理其他 candidate/condition/repeat

#### Scenario: 不可执行 candidate 不解释为 Practice 效果
- **WHEN** candidate 因 starter/snapshot/evaluator 问题不可运行
- **THEN** 执行器标记 `not-executable` 并保留原因，不将其结果计入 Practice 效果判定

### Requirement: 不创建正式产物
执行器 MUST NOT 创建正式 run manifest、正式 record 或 suite revision。执行器 MUST NOT
执行 retrieval、盲评、成本/时延统计或 Wiki 发布。`--resume` 与任何改变执行输入的参数
调整 MUST NOT 在首版提供。

#### Scenario: 不创建正式 manifest 或 record
- **WHEN** 执行器完成一次诊断运行
- **THEN** 不产生 formal-run-manifest.json 或 run record，只在 `scratch/` 产生诊断
  产物与脱敏 summary
