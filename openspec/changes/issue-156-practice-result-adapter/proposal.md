## Why

#155 已合并 channel 中立的全局结果解释器核心 `result-interpreter/v1`。目前 practice 注入的
现有本地结果以 `profile-diagnostic-summary/v3` 落在 ignored `scratch/`（如登录页
`login-v2-three-condition-retest-v2`），其 `entries` 已含逐 attempt 的
`evaluation_status` / `semantic` / `practice_observation` / 脱敏 trace 与固定输入身份，
`plan.schedule` 的 `block` 即 1 起的 repeat。#156 把 practice 通道接入解释器：实现版本化
practice adapter，把 v3 结果映射为 `result-interpreter/v1` 契约并声明 practice decision
rule；用登录页 Practice 现有本地结果回放验证解释器判定可用，为 #92 汇总 #91 扩大样本
提供已验证的解释层。

## What Changes

- 新增版本化 practice adapter：读取 `profile-diagnostic-summary/v3`（`entries` +
  `plan.schedule`），按 `candidate × profile_input_hash` 分组构造 `result-interpreter/v1`
  的 `InterpretationInput`（unit plan + entries + decision rule）。
- 字段映射：`evaluation_status` → health、`semantic` → semantic、
  `practice_observation` → quality、trace/身份 → `sample_unit` + `RedactedTrace`、
  repeat 由 `entries.repeat` / `plan.schedule.block` 提供（1 起）。
- 声明 practice decision rule：`metric=joint-pass-count`、`active_condition=oracle-practice`、
  `controls=[baseline, irrelevant-practice]`、`relation=strictly-greater-than-each-control`、
  `otherwise=diagnostic-only`。
- 输入校验 fail-closed：`schema_version` 必须是 `profile-diagnostic-summary/v3`；身份与
  脱敏边界由解释器 gate 强制执行；Practice 文本、私有路径、工作区路径不得进入映射。
- 登录页验证：对 `scratch/profile-diagnostics/login-v2-three-condition-retest-v2/summary.json`
  回放 adapter + interpreter，产出脱敏 `result-interpreter-summary/v1`，断言 verdict 与缺口
  路径符合预期，并与既有 `report.conclusion_grade` 对照记录口径差异。
- 合成 fixture 测试覆盖固定输入隔离、泄露审计、缺口→uncertain、decision rule 应用与
  身份漂移。

## Capabilities

### New Capabilities

- `practice-result-adapter`: 定义把 `injection-calibration/v1` 的
  `profile-diagnostic-summary/v3` 结果映射为 `result-interpreter/v1` 契约的版本化 adapter
  契约：输入身份与 schema 校验、字段映射、practice decision rule、脱敏边界与登录页验证。

### Modified Capabilities

无。不修改 `result-interpreter/v1`、`outcome/v1` 或 `profile-diagnostic-runner.ts`。

## Impact

- 代码：新增 `src/benchmark/result-interpreter/v1/adapters/practice.ts` 与配套 focused
  tests（含合成 fixture 与登录页回放验证脚本）；不调用模型。
- 兼容：`profile-diagnostic-summary/v3` 作为只读输入，不改写 #90/#91 使用的 runner 逻辑。
- 验证：`bun run validate`、OpenSpec strict validation、public/private 泄露审计；
  `git diff --check`。
- 关联 issue：#156；前置 #155（解释器核心）；后续 #92（汇总扩大样本）。