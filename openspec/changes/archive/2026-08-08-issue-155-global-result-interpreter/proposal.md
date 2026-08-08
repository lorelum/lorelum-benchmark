## Why

#92 需要汇总 #91 扩大样本的本地 Practice 注入对照诊断结果。目前 practice 一侧的
结果解释逻辑（strict joint-pass decision rule、按 `candidate × profile_input_hash`
分组、脱敏 summary 与 conclusion_grade）直接嵌在
`src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts` 里，与 practice 语义强耦合；
skill 注入一侧（`treatment-comparison/v1`、`treatments/<id>/vN` kind=skill）没有对应
的解释/验收层。为了让 practice 与 skill 两类注入共用同一套结果验收口径，先建立
channel 中立的全局结果解释器核心。#155 是该核心的首个 change；后续 #156 接入
practice adapter 并用登录页 Practice 验证，#92 据此汇总扩大样本的诊断结果。

## What Changes

- 新增版本化共享 helper `src/benchmark/result-interpreter/v1/`，核心与注入通道无关。
- 中立 attempt 契约复用 `outcome/v1`（execution health、semantic、quality、
  `joint_pass`），并补充 sample unit 身份（candidate、source_commit、snapshot_id、
  input_hash）、`condition_id`、`repeat`、脱敏注入 trace 与计划分母。
- decision rule 由调用方以数据声明（`metric`、`active_condition`、`controls`、
  `relation`、`otherwise`），核心不硬编码任一通道的条件集合。
- 三层验收 gate：输入身份一致性 + 分母完整性、脱敏/泄露 fail-closed、
  decision rule 判定 → verdict（`signal` / `diagnostic-only` / `uncertain`）。
- 可审计输出：逐 unit 证据链（source commit / snapshot ID / input hash）与跨 unit
  诊断性分布，禁止加权总分。
- 用合成 fixture 验证 skill 与 practice 两类注入共用同一核心（channel 中立性）；
  不接真实 skill runner，不调用模型。

## Capabilities

### New Capabilities

- `result-interpreter`: 定义 channel 中立的全局结果解释器核心契约：规范化 attempt
  输入、数据化 decision rule、输入身份隔离、分母完整性、脱敏/泄露 gate，以及
  verdict 与审计汇总输出。

### Modified Capabilities

无。不修改 `outcome/v1`、`profile-diagnostic-runner` 或既有 profile 契约。

## Impact

- 代码：新增 `src/benchmark/result-interpreter/v1/types.ts`、
  `src/benchmark/result-interpreter/v1/interpret.ts` 与 focused tests。
- 兼容：不改写被 #90/#91 使用的 runner 总结逻辑；现有
  `profile-diagnostic-summary/v3` 保持兼容。
- 验证：`bun run validate`、OpenSpec strict validation、public/private 泄露审计；
  不运行 Pi/模型、不创建正式 record、不发布 Wiki。
- 关联 issue：#155；后续 #156（practice adapter + 登录页验证）、#92（汇总）。
