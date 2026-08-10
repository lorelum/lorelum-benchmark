# 三条件诊断结果（llm-provider-gateway-v1）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v1-three-condition-diagnostic.yaml`（repetitions: 3，9 attempts，cyclic-latin-square）。
- 模型：deepseek/deepseek-v4-pro；预算 10min/attempt；judge：judge-agent/generic/v1（LORELUM_JUDGE_REAL=1）。
- 输出：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-2026-08-10-r2`（interrupted=false）。
- 前置修复：R1 因 `materializeGitHistory` 对 baseline（无约定文档）空提交失败，3/3 baseline 未执行；runner 最后 commit 改 `--allow-empty` 后 R2 正常执行（runner 测试 38 pass）。

## 人可读原始结果表（每条件 n=3）

| 条件 | 注入内容 | evaluated | 非健康评测 | 语义通过 | Practice 已观察 | Practice 未观察 | Practice 不确定 | joint_pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 无 | 1/3 | 2/3 | 1/3 | 0/3 | 1/3 | 0/3 | 0/3 |
| oracle-practice | llm.provider-gateway（docs/ai-gateway-guide.md） | 3/3 | 0/3 | 3/3 | 1/3 | 2/3 | 0/3 | 1/3 |
| irrelevant-practice | backend.pagination（docs/ai-gateway-guide.md） | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 |

## 逐 attempt

| 条件 | rep | evaluation_status | semantic | practice_observation | joint_pass | judge |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | 1 | execution-failed | - | - | - | - |
| baseline | 2 | execution-failed | - | - | - | - |
| baseline | 3 | evaluated | pass | not-observed | false | 70 |
| oracle-practice | 1 | evaluated | pass | not-observed | false | 62 |
| oracle-practice | 2 | evaluated | pass | not-observed | false | 58 |
| oracle-practice | 3 | evaluated | pass | observed | true | 84 |
| irrelevant-practice | 1 | evaluated | pass | not-observed | false | 68 |
| irrelevant-practice | 2 | evaluated | pass | not-observed | false | judge-unavailable |
| irrelevant-practice | 3 | evaluated | pass | not-observed | false | 67 |

## judge（中位分）

- baseline: 70（1 次）；oracle-practice: 62（62/58/84）；irrelevant-practice: 67（68/67）。judge 未显示 oracle 优势。

## 决策

- oracle joint_pass 1/3（0.333）> baseline 0/3 且 > irrelevant 0/3，方向上 oracle 是唯一出现 joint-pass 的条件。
- 但 baseline 仅 1/3 健康评测（2 次 agent 未通过语义、evaluator 非零退出），`conclusion_grade = diagnostic-or-uncertain` → `overall_conclusion_grade = diagnostic-only`。
- 解读：该 candidate + deepseek-v4-pro 下，practice 注入未稳定引导 agent 遵循规范（oracle 3 次中 2 次 semantic pass 但 not-observed）；判别力信号弱且样本健康度不足，结论为 **diagnostic-only（方向性/不确定）**，不扩大到"practice 有效"。
- 未创建正式 record、未升级 suite revision、candidate 未改动（runner 侧修复与 plan 属 pilot change 范围）。