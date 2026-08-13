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

- rubric_hash：`86d3587477fac56305921c20cd79da92fe3b0313fd71135ecb3f1fe684fe600b`
- oracle-practice rep1 judge score：98（observed）
- 其余 attempt judge 结果见各自 `judge.sidecar.json`；本表仅汇总主决策，judge 不改变语义/观测结论。

## 决策

- `conclusion_grade = diagnostic`、`overall_conclusion_grade = diagnostic-only`。
- 原因：oracle joint_pass 1/3，baseline 0/3，irrelevant-practice 1/3。oracle 未严格高于 irrelevant 对照（相等），不满足 `strictly-greater-than-each-control`。
- 解释：9/9 语义通过、9/9 evaluated，说明 candidate 的功能可完成；Practice 注入未稳定提升 joint-pass，irrelevant 也出现 1 次 observed，方向性信号不足。

## 边界

- 未创建正式 record、未升级 suite revision；candidate 题面/starter/evaluator/practices 未改动（model-tier 配置为 pilot 显式范围）。
- 该结果仅作单候选本地诊断，不扩大到产品效果或模型泛化。
