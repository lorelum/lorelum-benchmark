# 三条件诊断结果（llm-provider-gateway-v1，deepseek-v4-pro）

- 计划：`incubator/practice-injection-plans/llm-provider-gateway-v1-three-condition-diagnostic-v4pro.yaml`（repetitions: 3，9 attempts，cyclic-latin-square）。
- 身份字段：source_commit `dde8c03…`；snapshot_id `7d01aa79bdde4e62f1c940fdba117b0f11497d695675fa040c089e3e77a64a11`；profile_input_hash `a6c31033…`；schedule_seed `llm-provider-gateway-v1-diagnostic-2026-08-10`。
- 模型：deepseek/deepseek-v4-pro；预算 10min/attempt；judge：judge-agent/generic/v1（LORELUM_JUDGE_REAL=1，rubric_hash `bb715e78…`）。
- 输出：`scratch/profile-diagnostics/llm-provider-gateway-v1-diagnostic-2026-08-10-r2`（interrupted=false）。
- 前置修复：R1 因 `materializeGitHistory` 对 baseline（无约定文档）空提交失败，3/3 baseline 未执行；runner 最后 commit 改 `--allow-empty` 后 R2 正常执行（runner 测试 38 pass）。R1 中 oracle rep1 为 evaluator-exit-nonzero（agent 语义 9/10，仅 JSONL 日志用例失败）、oracle rep2 为 Pi 超时，均属运行现象而非评测缺陷。

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

## not-observed 的 observation_reason 摘要（D1 记录）

- oracle rep1：R1 无统一契约（interface/class/type ≥2 方法）+ R6 服务层按供应商名分支。
- oracle rep2 / irrelevant rep1/2/3：R1 无统一契约 + R4 费用换算散落在服务/适配器内 + R6 服务层按供应商名分支。
- baseline rep3：R1 无统一契约 + R2 服务层含供应商直连地址 + R4 + R6 + R7 无边界观测导入。

## judge（中位分）

- baseline: 70（1 次）；oracle-practice: 62（62/58/84）；irrelevant-practice: 67（68/67）。judge 未显示 oracle 优势。

## 决策

- oracle joint_pass 1/3（0.333）> baseline 0/3 且 > irrelevant 0/3，方向上 oracle 是唯一出现 joint-pass 的条件。
- 但 baseline 仅 1/3 健康评测（2 次 agent 未通过语义、evaluator 非零退出），`conclusion_grade = diagnostic-or-uncertain` → `overall_conclusion_grade = diagnostic-only`。
- 解读：该 candidate + deepseek-v4-pro 下，practice 注入未稳定引导 agent 遵循规范（oracle 3 次中 2 次 semantic pass 但 not-observed）；判别力信号弱且样本健康度不足，结论为 **diagnostic-only（方向性/不确定）**，不扩大到"practice 有效"。
- 探针边界（D1）：R1/R6 为 AST 启发式——R1 接受 interface/class/type 等价实现；R6 对 `=== "openai|deepseek|anthropic"` 协议分支判定（名称启发式），存在等价写法误报边界；判定以 R1（统一契约）为主支撑，本表附 observation_reason 以增强可审计性。
- 未创建正式 record、未升级 suite revision；candidate 题面/starter/evaluator/practices 未改动（runner 侧修复与 plan 属 pilot change 范围）。