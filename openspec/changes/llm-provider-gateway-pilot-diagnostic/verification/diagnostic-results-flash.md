# 三条件诊断结果（llm-provider-gateway-v1，deepseek-v4-flash model-tier rerun）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v1-three-condition-diagnostic.yaml`（repetitions: 3，9 attempts；`schedule_seed` flash 变体）。
- 模型：deepseek/deepseek-v4-flash（model-tier rerun，config commit `6133a07`；conditions.yaml `shared_execution.model.id` 改为 flash，snapshot_id `c3af28...`，profile_input_hash 不变 `a6c310...`）。
- 预算 10min/attempt；judge：judge-agent/generic/v1（LORELUM_JUDGE_REAL=1）。
- 输出：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-flash-2026-08-10`（**interrupted=false，9/9 evaluated，exit 0**）。

## 人可读原始结果表（每条件 n=3）

| 条件 | 注入内容 | evaluated | 非健康评测 | 语义通过 | Practice 已观察 | Practice 未观察 | Practice 不确定 | joint_pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 无 | 3/3 | 0/3 | 3/3 | 1/3 | 2/3 | 0/3 | 1/3 |
| oracle-practice | llm.provider-gateway（docs/ai-gateway-guide.md） | 3/3 | 0/3 | 3/3 | 3/3 | 0/3 | 0/3 | **3/3** |
| irrelevant-practice | backend.pagination（docs/ai-gateway-guide.md） | 3/3 | 0/3 | 3/3 | 1/3 | 2/3 | 0/3 | 1/3 |

## 逐 attempt

| 条件 | rep | evaluation_status | semantic | practice_observation | joint_pass | judge |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 1 | evaluated | pass | observed | true | 90 |
| baseline | 2 | evaluated | pass | not-observed | false | 82 |
| baseline | 3 | evaluated | pass | not-observed | false | judge-unavailable |
| oracle-practice | 1 | evaluated | pass | observed | true | 96 |
| oracle-practice | 2 | evaluated | pass | observed | true | 100 |
| oracle-practice | 3 | evaluated | pass | observed | true | 100 |
| irrelevant-practice | 1 | evaluated | pass | not-observed | false | 92 |
| irrelevant-practice | 2 | evaluated | pass | not-observed | false | 85 |
| irrelevant-practice | 3 | evaluated | pass | observed | true | 100 |

## judge（中位分）

- baseline: 86（90/82）；oracle-practice: **100**（96/100/100）；irrelevant-practice: 92（92/85/100）。oracle 中位分最高，且 oracle 3 次全 observed。

## 决策

- `conclusion_grade = directional-screen`：oracle joint_pass 3/3（100%）严格高于 baseline 1/3 与 irrelevant 1/3；oracle 语义通过 ≥ 各对照；9/9 健康（无 indeterminate、无非健康评测）。
- `overall_conclusion_grade = reproducible-direction`（runner 按 independent_candidate_threshold=1 的单候选规则给出；实际是单候选方向性信号）。
- 解读：deepseek-v4-flash 档下，practice 注入稳定引导 agent 产出"语义通过且遵循规范"（oracle 3/3 joint-pass），相对 baseline/irrelevant（各 1/3）有明确方向性增量，judge 也一致（oracle 100 中位）。按小样本边界，这仅支持"该 candidate + 该模型档位的方向性结论"，不扩大到多任务/泛化。
- 与 v4-pro 对比：v4-pro 档 oracle 1/3 joint-pass（diagnostic-only，且 baseline 健康不足）；flash 档 oracle 3/3（directional-screen）——模型档位对 practice 引导力影响显著。
- 未创建正式 record、未升级 suite revision；model-tier 配置改动（conditions.yaml model + snapshot + plan）属 pilot change 范围，题面/starter/evaluator/practices 未动。