## Why

`llm-provider-gateway-v2`（#166）已完成 candidate 交付并归档，校准矩阵 6/6、仓库验证与独立验证通过，judge rubric 已固定（hash `db059c1653e74405e6ffab17da4f8d21f32ef5b9a24c816eb93246ac2ae19894`）。#168 承接其效果验证：对冻结 candidate 执行三条件本地诊断对照，并额外执行 judge 判别力校准，以确认被测 Practice 相对 baseline/无关对照的方向性增量。

## What Changes

- 以本地 Pi diagnostic runner 对 `incubator/practice-injection/llm-provider-gateway-v2` 执行三条件对照（baseline / oracle-practice / irrelevant-practice）。
- 每条件 3 次、共 9 attempts，预算 25 分钟/attempt；模型仅 `deepseek/deepseek-v4-flash`。
- judge：先以 `judge-agent/generic/v1` 执行真实 LLM 判别力校准（`LORELUM_JUDGE_REAL=1`），固定/记录 rubric hash 与阈值，再逐条件软分。
- 结果按人可读原始维度呈现：evaluated / semantic / practice_observation / joint_pass，judge 独立 sidecar。
- 决策按 `strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则 diagnostic-only。
- 不改写 candidate、不创建正式 record、不升级 suite revision。

## Capabilities

### New Capabilities

- `llm-provider-gateway-v2-pilot-diagnostic`: 定义对 `llm-provider-gateway-v2` 执行三条件本地诊断对照与 judge 判别力校准的要求——使用冻结 candidate/conditions/snapshot、flash model-tier、n=5、真实 LLM judge 校准、人可读结果表与 joint-pass 决策边界。

### Modified Capabilities

无。现有 `practice-injection-v2-diagnostic-execution`、`practice-observation-diagnostics`、`judge-agent-rubric-scoring` stable specs 已覆盖诊断执行、观测与软分规则；本 change 只落地一个 candidate 的诊断执行与校准。

## Impact

- 只运行，不改写：`incubator/practice-injection/llm-provider-gateway-v2/` 的 public/private 保持冻结。
- 依赖：#166/#167 candidate 就绪（已合并）；本地 Pi diagnostic runner 已支持 node-ts；DeepSeek API Key（模型 + judge real）。
- 产出：本地诊断结果与 judge 校准证据（`scratch/profile-diagnostics/` 或 OpenSpec change verification），不进入 `results/records`。
- 不进入默认 suite，不创建正式 record。
