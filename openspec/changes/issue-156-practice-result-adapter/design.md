## Context

#155 已交付 channel 中立解释器核心。现有 practice 结果以 `profile-diagnostic-summary/v3`
落在 ignored `scratch/`；其 `entries` 已含 per-attempt 的 `evaluation_status`/`semantic`/
`practice_observation`/脱敏 trace/固定输入身份，`plan.schedule`（`block`=1 起 repeat）提供
计划分母。本 change 实现 practice adapter 并在登录页 Practice（`login-page-auth-flow-v2`）
现有本地结果上回放验证解释器。

## Goals / Non-Goals

**Goals:**

- 版本化 practice adapter：`profile-diagnostic-summary/v3` → `result-interpreter/v1`
  `InterpretationInput`，声明 practice decision rule。
- 登录页回放验证：adapter + interpreter 在 `login-v2-three-condition-retest-v2` 上产出
  脱敏 `result-interpreter-summary/v1`，verdict/缺口路径符合预期。
- 合成 fixture 测试：固定输入隔离、泄露审计、缺口→uncertain、decision rule、身份漂移。

**Non-Goals:**

- 不改写 `profile-diagnostic-runner.ts` 中被 #90/#91 使用的逻辑。
- 不实现 skill adapter 或 `treatment-comparison` runtime。
- 不运行模型、不创建正式 run manifest / record / suite revision。
- #75 历史结果只作只读背景，不与 profile v1 结果混算。

## Decisions

### 输入源：profile-diagnostic-summary/v3

adapter 直接消费 v3 的 `entries` 与 `plan.schedule`，不解析 per-attempt 目录。
`schema_version` 必须为 `profile-diagnostic-summary/v3`，否则 fail-closed。
`plan.schedule[].block` 即 1 起的 repeat，与 `entries[].repeat` 对齐。

### 字段映射

- health ← `evaluation_status`（evaluated / execution-failed / invalid-output / not-executable）
- semantic ← `semantic`
- quality ← `practice_observation`（observed / not-observed / indeterminate / not-run）
- `sample_unit` ← { candidate, source_commit, snapshot_id, input_hash=profile_input_hash }
- `trace` ← 原样（已脱敏：condition_id / channel / profile_input_hash / practice_id /
  practice_version / practice_sha256）
- repeat ← `entries.repeat`

### practice decision rule

`metric=joint-pass-count`、`active_condition=oracle-practice`、
`controls=[baseline, irrelevant-practice]`、`relation=strictly-greater-than-each-control`、
`otherwise=diagnostic-only`。由 adapter 注入每个 unit。

### 登录页验证与口径差异

对 `login-v2-three-condition-retest-v2`（6 重复）回放：oracle joint-pass=3、
baseline=1、irrelevant=2，但其中 oracle#3（evaluator-cleanup-unverified）与
baseline#5（Pi timed out）为 `execution-failed`。解释器严格 gate 将单元判为
`uncertain`（unhealthy-attempt），overall=uncertain——即使 oracle 在已评估 attempt
中领先，任何执行异常都阻止 signal。旧 `report.conclusion_grade` 为
`diagnostic-or-uncertain`；解释器口径更严格且逐 attempt 可审计，差异作为口径说明
记录。合成 fixture（全部 evaluated）验证 strict lead → signal；缺口路径（缺失
attempt / 非 evaluated / indeterminate quality）必须输出 `uncertain`。

### Quality gap 集合

沿用 #155 v1（`gapQualityStates = { "indeterminate" }`）；`practice_observation` 的
`not-run` / judge 不可用是否升级为缺口，在登录页真实数据验证后由需求方确认（needs-discussion）。

## Risks / Trade-offs

- [v3 字段语义漂移] -> schema_version + 关键字段存在性校验，fail-closed。
- [旧 report 口径与解释器 verdict 不一致] -> 对照记录为口径说明，不当作错误。
- [登录页结果不完整] -> 缺口路径输出 uncertain，如实记录。

## Migration Plan

1. Strictly validate this change and create its OpenSpec-only PR for #156.
2. Obtain planning confirmation and write it back to this design and `tasks.md`.
3. Implement adapter + synthetic tests; replay login-page scratch validation.
4. #92 summarizes the #91 corpus with the validated adapter + interpreter.

Rollback leaves `result-interpreter/v1` and the runner untouched; the adapter is additive.

## Planning Confirmation

需求方已确认以下口径（2026-08-08，全部按推荐）：

- adapter 输入源：直接消费 `profile-diagnostic-summary/v3`（`entries` + `plan.schedule`，
  `block`=1 起 repeat），不解析 per-attempt 目录。
- 登录页验证范围：仅回放现有 scratch（`login-v2-three-condition-retest-v2`），不补跑模型。
- quality gap 口径：维持 #155 v1（仅 `indeterminate` 视为缺口 → uncertain；
  `not-run` / judge 不可用按“非 observed”处理），留待 #92 按真实数据复核。