# 三条件诊断结果（llm-provider-gateway-v2，deepseek-v4-flash）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v2-three-condition-diagnostic-flash.yaml`
- repetitions：3（9 attempts），cyclic-latin-square/v1。
- 模型：`deepseek/deepseek-v4-flash`；judge：`judge-agent/generic/v2`，`LORELUM_JUDGE_REAL=1`。
- 输出：`scratch/profile-diagnostics/2026-08-13T09-31-54-698Z`（interrupted=false，9/9 evaluated）。

## 人可读原始结果表（n=3）

| 条件 | 注入内容 | evaluated | 语义通过 | Practice observed | joint_pass |
| --- | --- | --- | --- | --- | --- |
| baseline | 无 | 3/3 | 3/3 | 0/3 | 0/3 |
| oracle-practice | llm.provider-gateway.v2 | 3/3 | 3/3 | 1/3 | 1/3 |
| irrelevant-practice | backend.pagination | 3/3 | 3/3 | 1/3 | 1/3 |

## 逐 attempt

| 条件 | rep | evaluation_status | semantic | practice_observation | joint_pass |
| --- | --- | --- | --- | --- | --- |
| baseline | 1 | evaluated | pass | not-observed | false |
| baseline | 2 | evaluated | pass | not-observed | false |
| baseline | 3 | evaluated | pass | not-observed | false |
| oracle-practice | 1 | evaluated | pass | not-observed | false |
| oracle-practice | 2 | evaluated | pass | observed | true |
| oracle-practice | 3 | evaluated | pass | not-observed | false |
| irrelevant-practice | 1 | evaluated | pass | observed | true |
| irrelevant-practice | 2 | evaluated | pass | not-observed | false |
| irrelevant-practice | 3 | evaluated | pass | not-observed | false |

## judge soft sidecar（judge-agent/generic/v2）

- run-level rubric_hash：`86d3587477fac56305921c20cd79da92fe3b0313fd71135ecb3f1fe684fe600b`
- 全部 9 个 attempt 均为 `observed`，judge 不改变语义/观测结论。

| 条件 | rep | score | policy-centralization | rubric_hash |
| --- | --- | --- | --- | --- |
| baseline | 1 | 100 | 20/20 | `86d35874…` |
| baseline | 2 | 84 | 14/20 | `86d35874…` |
| baseline | 3 | 90 | 15/20 | `86d35874…` |
| oracle-practice | 1 | 98 | 20/20 | `86d35874…` |
| oracle-practice | 2 | 100 | 20/20 | `86d35874…` |
| oracle-practice | 3 | 100 | 20/20 | `86d35874…` |
| irrelevant-practice | 1 | 94 | 14/20 | `86d35874…` |
| irrelevant-practice | 2 | 87 | 7/20 | `86d35874…` |
| irrelevant-practice | 3 | 100 | 20/20 | `86d35874…` |

逐条件中位：

| 条件 | scores | 中位 | policy-centralization |
| --- | --- | --- | --- |
| baseline | 100, 84, 90 | 90 | 20, 14, 15 |
| oracle-practice | 98, 100, 100 | 100 | 20, 20, 20 |
| irrelevant-practice | 94, 87, 100 | 94 | 14, 7, 20 |

judge 证据说明：v1 校准失败证据见 `judge-calibration-attempt.md`；#170/#171 的 v2 校准通过后，本 pilot 使用 v2 sidecar。实际 run-level rubric hash `86d35874…` 与 #170 校准记录 `286c29bd…` 不同，原因是没有为本次三条件运行注入固定 rubric 文本；该差异仅作 soft-score 诊断限制，不改变 joint-pass 决策。

## 决策

- `conclusion_grade = diagnostic`、`overall_conclusion_grade = diagnostic-only`。
- 原因：oracle joint_pass 1/3，baseline 0/3，irrelevant-practice 1/3。oracle 未严格高于 irrelevant 对照（相等），不满足 `strictly-greater-than-each-control`。
- 解释：9/9 语义通过、9/9 evaluated，说明 candidate 的功能可完成；主指标 joint-pass 未形成方向性领先，irrelevant 也出现 1 次 observed。judge v2 的 `policy-centralization` 显示 oracle 三次均为 20/20，而两个对照仅各出现一次，说明软信号存在但未参与主决策。

## 边界

- 未创建正式 record、未升级 suite revision；candidate 题面/starter/evaluator/practices 未改动（model-tier 配置为 pilot 显式范围）。
- 该结果仅作单候选本地诊断，不扩大到产品效果或模型泛化。
