## Context

#92 需要汇总 #91 的扩大样本 practice 注入诊断结果，但 practice 侧的解释逻辑
（strict joint-pass rule、按 candidate × profile_input_hash 分组、脱敏 summary）
直接嵌在 `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts` 中，与 practice
语义强耦合；skill 注入（`treatment-comparison/v1`、kind=skill treatments）没有对应
解释层。#155 先建立 channel 中立的全局结果解释器核心，使 practice 与 skill 后续都能
以同一套口径验收；#156 实现 practice adapter 并用登录页 Practice 验证，#92 据此汇总。

本 change 只新增共享 helper，不迁移现有 runner 逻辑，不触碰冻结 revision。

## Goals / Non-Goals

**Goals:**

- 新增 `src/benchmark/result-interpreter/v1/`：中立 attempt 契约（复用 outcome/v1
  词汇）、数据化 decision rule、三层 gate、verdict 与审计汇总。
- 用合成 fixture 证明 skill 与 practice 两类注入共用同一核心（channel 中立性）。
- 输出可审计：逐 unit 证据链，跨 unit 仅诊断性分布，禁止加权总分。

**Non-Goals:**

- 不实现 practice adapter / skill adapter / treatment-comparison runtime（#156 与后续）。
- 不迁移或改写 `profile-diagnostic-runner.ts` 中被 #90/#91 使用的总结逻辑；
  `profile-diagnostic-summary/v3` 保持兼容。
- 不创建正式 run manifest、record、suite revision；不调用模型、retrieval、盲评；
  不发布 Wiki。

## Decisions

### Neutral attempt contract on outcome/v1

解释器输入复用 `src/benchmark/outcome/v1/contract.ts` 的 ExecutionHealth /
SemanticOutcome / QualityOutcome 与 deriveJointPass，避免再造一套结果词汇；每个
attempt 携带 sample unit 身份（candidate、source_commit、snapshot_id、input_hash）、
condition_id、repeat、脱敏 trace 与异常。trace 只允许 id/hash/channel 类字段，
任何自由文本或路径字段被拒绝。

### Decision rule as data

v1 支持 `metric=joint-pass-count` 与 `relation=strictly-greater-than-each-control`
的枚举组合，`active_condition` / `controls` 由调用方声明；核心不硬编码 practice /
skill 条件名。枚举保持最小，扩展走新版本。

### Isolation and fail-closed gates

解释器按 sample unit 分组；同一 unit 内 source_commit / snapshot_id / input_hash
必须一致，计划分母（condition × repeat）必须完整；任何 attempt 非 evaluated、
quality indeterminate、身份漂移或泄露字段 → 该 unit 记为 `uncertain` 并带原因。
跨 unit 绝不合并计数。

### Verdict semantics

`signal` 仅当 active_condition 的 joint-pass 严格高于每个 control 且全部 attempt
evaluated；否则 `diagnostic-only`；有缺口 / 身份 / 泄露问题 → `uncertain`。汇总的
跨 unit 部分只报告判定分布与执行缺口，不产出聚合 signal。

### Quality gap definition (v1)

v1 只把 quality `indeterminate` 视为执行缺口 → `uncertain`；`not-run` 与
`judge-unavailable` 按“非 observed”处理（joint_pass=false），不触发 uncertain。
该口径在 #155 规划确认时锁定，代码中以 `gapQualityStates` 集中表示；#156/#92
接入真实 judge 结果时再决定是否将 `not-run`/`judge-unavailable` 升级为缺口。

### overall 语义

`InterpreterSummary.overall` 只表示“是否存在 uncertain 单元”，取值仅为
`diagnostic-only` 或 `uncertain`，永远不是 `signal`，也不代表聚合结论；跨 unit
聚合是刻意保持诊断性的（#155 确认，禁止加权总分与聚合 signal）。

### Additive versioning

`result-interpreter/v1` 是新增共享 helper；不改 outcome/v1，不迁移 runner 现有
总结。后续 practice adapter（#156）与 skill adapter 都以该核心为底座。

## Risks / Trade-offs

- [核心过泛导致空转] -> v1 枚举最小化（joint-pass-count + strictly-greater-than-each-control），其余以数据声明扩展。
- [输入身份漂移被静默合并] -> 身份 gate fail-closed，任何不一致 → uncertain。
- [泄露字段进入输出] -> redaction gate 在输入校验层拒绝未知/私有字段，输出仅由已校验字段生成。
- [与既有 practice summary 口径不一致] -> 本 change 不迁移；#156 用登录页真实结果对照验证。

## Migration Plan

1. Strictly validate this change and create its OpenSpec-only PR for #155.
2. Obtain planning confirmation and write it back to this design and `tasks.md`.
3. Add contract + core + focused tests, run validation and leakage audits.
4. #156 implements the practice adapter on this core and validates on login-page Practice results.
5. #92 produces the diagnostic summary over the #91 corpus using the validated interpreter.

Rollback leaves runner and outcome contracts untouched; the new helper is additive and removable.

## Planning Confirmation

需求方已确认以下口径（2026-08-08，plan-mode 提问）：

- 判定口径：`signal` 要求 active_condition 的 joint-pass 严格多于每个 control；
  相等或更低只算诊断性结论（与 #91/#92 strict rule 一致）。
- channel 中立性验证：仅合成数据（practice 三条件 + skill 两条件 fixture），
  不跑真实 skill、不调用模型。
- 汇总输出：逐单元 verdict + 证据链 + 原始计数；跨 unit 只给判定分布与执行缺口，
  不加权总分、不产出聚合 signal。
- 命名/落点：`result-interpreter/v1`（避免与正式 record 的 `outcome/v1` 混淆）。
- 版本化：新增共享 helper，不改 `outcome/v1`，不迁移 `profile-diagnostic-runner.ts`
  现有总结逻辑。
