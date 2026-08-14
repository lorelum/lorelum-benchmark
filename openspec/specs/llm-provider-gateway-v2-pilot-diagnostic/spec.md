# llm-provider-gateway-v2-pilot-diagnostic Specification

## Purpose
TBD - created by archiving change llm-provider-gateway-v2-pilot-diagnostic. Update Purpose after archive.
## Requirements
### Requirement: 冻结输入与三条件诊断

诊断 MUST 以 `incubator/practice-injection/llm-provider-gateway-v2/` 的冻结 `conditions.yaml`（baseline / oracle-practice / irrelevant-practice）与 snapshot 为输入，MUST 使用本地 Pi diagnostic runner 执行；本 change 的 model-tier 配置 MUST 为 `deepseek/deepseek-v4-flash`，每条件 MUST 为 3 次（9 attempts），单 attempt 预算 MUST 为 25 分钟。执行 MUST NOT 修改 candidate 的题面/starter/evaluator/practices。

#### Scenario: 冻结输入

- **WHEN** 诊断运行
- **THEN** 使用冻结 conditions 的三条件与 shared_execution，candidate 的题面/starter/evaluator/practices 在运行前后不变

#### Scenario: 盲评边界

- **WHEN** Pi agent 在任意条件运行
- **THEN** workspace/prompt 不包含 condition、evaluator、评分或评测信息

### Requirement: judge 校准与 v2 迁移处置

在对三条件 attempt 评分前，MUST 先尝试 `judge-agent/generic/v1`（`LORELUM_JUDGE_REAL=1`）判别力校准并保留失败证据。v1 校准未通过后，本 change MUST 使用 #170/#171 交付并完成夹具校准的 `judge-agent/generic/v2` 作为 soft sidecar；v2 结果 MUST 逐 attempt、逐条件记录 rubric hash 与分数。任一 judge 校准/评分通道不可用时，方向性结论 MUST 只依据 semantic 与 practice_observation。

#### Scenario: v1 校准失败被保留

- **WHEN** v1 校准出现 anti-pattern 高于 reference、equivalent 偏差过大或解析失败
- **THEN** 记录 rubric hash、各夹具分数与 fail-closed 原因，不掩盖原始证据

#### Scenario: v2 迁移并评分

- **WHEN** #170/#171 的 v2 校准通过且 candidate 条件迁移到 v2
- **THEN** 三条件 attempt 使用 `judge-agent/generic/v2`，记录同一 run-level rubric hash、逐 attempt score 与 rationale

#### Scenario: judge 不可用

- **WHEN** 任一 judge 校准/评分通道未 opt-in、provider 不可用或 fail-closed
- **THEN** 对应 sidecar 记 not-run/judge-unavailable 与原因，方向性结论只依据 semantic 与 practice_observation

### Requirement: 结果表达与决策边界

诊断结果 MUST 按人可读原始维度呈现每条件 x/y：evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass；judge 的逐 attempt score 与每条件中位分 MUST 在 verification artifact 中完整列出，rubric hash MUST 与分数并列记录。`joint_pass` MUST 仅派生为 semantic=pass 且 practice_observation=observed；非健康评测 MUST 单独计数。决策 MUST 按 `strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则 `diagnostic-only`。

#### Scenario: judge 证据完整

- **WHEN** 诊断完成且 judge sidecar 存在
- **THEN** verification 记录每个条件的三个 score、中位分、共同 rubric hash 与逐 attempt 引用

#### Scenario: 方向性结论

- **WHEN** oracle joint-pass 严格高于每个对照且 attempt 全部 evaluated
- **THEN** 记录 `directional-screen`，不扩大为正式结论

#### Scenario: 不成立

- **WHEN** oracle joint-pass 等于或低于任一对照，或存在必要非健康 attempt
- **THEN** 记录 `diagnostic-only` 并保留 observation_reason

### Requirement: 生命周期与产物边界

本 change MUST NOT 创建正式 record、MUST NOT 升级 suite revision、MUST NOT 修改 v1/现有 suite/treatment/历史结果。诊断输出 MUST 保留在 `scratch/profile-diagnostics/` 或 OpenSpec change verification，不进入 `results/records`。

#### Scenario: 不创建正式产物

- **WHEN** 诊断完成
- **THEN** 未创建正式 record、未升级 suite，候选仍为 `candidate` 生命周期
