## Why

`llm-provider-gateway-v1`（#161/#162）已交付并通过校准/门禁（校准矩阵 6/6、validate + test:contracts 全绿、泄露审计 0、独立验证、F1-F4 findings 处理），需求方初步认可。下一步需要在本机用真实模型跑三条件诊断对照（baseline / oracle-practice / irrelevant-practice），验证被测 Practice 在该 candidate 上是否有方向性增量（joint-pass 严格高于每个对照）；若有效，再规划 suite 升级与正式运行。issue #163 承接该执行。

## What Changes

- 以本地 Pi diagnostic runner 对 `incubator/practice-injection/llm-provider-gateway-v1` 执行三条件对照（baseline / oracle-practice / irrelevant-practice），每条件按 `private/conditions.yaml` 重复次数（默认 2）与预算（max_duration_minutes: 10）。
- 结果按 `docs/PRACTICE_BENCHMARK_GUIDE.md` 人可读原始结果表呈现（evaluated / semantic pass / practice observed / joint_pass，非健康评测与 indeterminate 单独计数）。
- judge（`judge-agent/generic/v1`）软分：需要 `LORELUM_JUDGE_REAL=1` 显式 opt-in + DeepSeek API Key；无 key 时 judge 记 not-run，方向性结论只依据 semantic + practice_observation。
- 决策：oracle joint-pass 严格高于 baseline 与 irrelevant-practice → 支持方向性结论；否则 diagnostic-only。
- 不改写 candidate（题面/夹具/evaluator 已冻结）；不创建正式 record、不升级 suite revision；#162 已于 2026-08-10 合并，candidate change（llm-provider-gateway-practice-candidate）尚未归档，本 change 不关闭/归档该 change。

## Capabilities

### New Capabilities

- `llm-provider-gateway-pilot-diagnostic`：定义对 `llm-provider-gateway-v1` 执行本地三条件诊断对照的要求——使用冻结 candidate 与 conditions、本地 Pi diagnostic runner、人可读原始结果表、judge opt-in 规则、oracle-strictly-greater 决策口径、不建正式产物与不改写冻结对象的边界。

### Modified Capabilities

- 无（现有 `practice-injection-v2-diagnostic-execution`、`practice-observation-diagnostics`、`profile-diagnostic-runner` stable spec 已覆盖诊断执行与结果表达；本 change 只落地一个 candidate 的诊断执行）。

## Impact

- 只运行，不改写：`incubator/practice-injection/llm-provider-gateway-v1/` 的 public/private 保持冻结。
- 依赖：#161/#162 candidate 就绪；本地 Pi diagnostic runner（`pi:diagnose` / profile-diagnostic-runner）；DeepSeek API Key（模型 + judge opt-in，可选）。
- 产出：本地诊断结果（scratch/ 或 change 内 verification 记录），不进入 results/records。
- 不进入默认 suite，不创建正式 record。