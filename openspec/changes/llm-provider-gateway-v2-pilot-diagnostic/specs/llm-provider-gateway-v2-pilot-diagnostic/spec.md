# llm-provider-gateway-v2-pilot-diagnostic Specification

## Purpose

定义对 `llm-provider-gateway-v2` 执行三条件本地诊断对照与 judge 判别力校准的要求：使用冻结 candidate/conditions/snapshot、`deepseek/deepseek-v4-flash` model-tier、每条件 n=5、真实 LLM judge 校准、人可读结果表与 joint-pass 决策边界；不改写冻结对象，不创建正式产物。

## ADDED Requirements

### Requirement: 冻结输入与三条件诊断

诊断 MUST 以 `incubator/practice-injection/llm-provider-gateway-v2/` 的冻结 `conditions.yaml`（baseline / oracle-practice / irrelevant-practice）与 snapshot 为输入，MUST 使用本地 Pi diagnostic runner 执行；本 change 的 model-tier 配置 MUST 为 `deepseek/deepseek-v4-flash`，每条件 MUST 为 3 次（9 attempts），单 attempt 预算 MUST 为 25 分钟。执行 MUST NOT 修改 candidate 的题面/starter/evaluator/practices。

#### Scenario: 冻结输入

- **WHEN** 诊断运行
- **THEN** 使用冻结 conditions 的三条件与 shared_execution，candidate 的题面/starter/evaluator/practices 在运行前后不变

#### Scenario: 盲评边界

- **WHEN** Pi agent 在任意条件运行
- **THEN** workspace/prompt 不包含 condition、evaluator、评分或评测信息

### Requirement: judge 判别力校准先行

在对三条件 attempt 评分前，MUST 使用 `judge-agent/generic/v1`（`LORELUM_JUDGE_REAL=1`）对固定校准夹具（reference / equivalent / anti-pattern / public-starter）执行判别力校准，记录 rubric hash 与阈值。校准未通过时，judge 软分 MUST 记 not-run/未通过原因，MUST NOT 参与结论。

#### Scenario: 校准通过

- **WHEN** judge 校准通过
- **THEN** 记录 rubric hash、阈值与各夹具分数，后续三条件软分复用同一 rubric

#### Scenario: 校准未通过

- **WHEN** judge 校准未通过或未 opt-in
- **THEN** judge 仅记录 not-run 与原因，方向性结论只依据 semantic 与 practice_observation

### Requirement: 结果表达与决策边界

诊断结果 MUST 按人可读原始维度呈现每条件 x/y：evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass，judge 中位分独立列出；`joint_pass` MUST 仅派生为 semantic=pass 且 practice_observation=observed；非健康评测 MUST 单独计数。决策 MUST 按 `strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则 `diagnostic-only`。

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
