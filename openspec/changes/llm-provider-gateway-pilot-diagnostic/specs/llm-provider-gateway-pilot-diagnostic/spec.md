## ADDED Requirements

### Requirement: 三条件诊断对照执行

对 `llm-provider-gateway-v1` 的本地诊断 MUST 使用冻结 candidate 的 `private/conditions.yaml`（baseline / oracle-practice / irrelevant-practice）与 snapshot 作为唯一输入，MUST 使用本地 Pi diagnostic runner 执行，每条件按确认的重复次数与预算（默认 max_duration_minutes: 10）运行；执行本身 MUST NOT 修改 candidate 的题面/starter/evaluator/practices；model-tier 配置变更（conditions.yaml model + snapshot 重建，profile_input_hash 不变）作为 pilot 显式声明范围，需在本 change 中记录。

#### Scenario: 冻结输入
- **WHEN** 本地诊断运行
- **THEN** 使用 conditions.yaml 声明的三条件与 shared_execution；candidate 的题面/starter/evaluator/practices 在运行前后不变；model-tier 配置变更作为本 change 显式范围记录

#### Scenario: 评估器盲评
- **WHEN** Pi agent 在任意条件运行
- **THEN** 其 workspace/prompt 不包含 condition、evaluator、评分或评测信息

### Requirement: 结果表达与人可读表

诊断结果 MUST 按 `docs/PRACTICE_BENCHMARK_GUIDE.md` 模板呈现每条件 x/y：evaluated、semantic 通过、Practice 已观察、Practice 未观察、Practice 不确定、joint_pass；`joint_pass` MUST 仅派生为 semantic=pass 且 practice_observation=observed；非健康评测（evaluation_status != evaluated）MUST 单独计数，不得补推语义/观测结论。

#### Scenario: 结果表
- **WHEN** 三条件对照完成
- **THEN** 结果表区分语义通过、Practice 观测、joint_pass 与评测健康，无隐藏加权总分

### Requirement: judge 软分 opt-in

judge（`judge-agent/generic/v1`）MUST 仅在 `LORELUM_JUDGE_REAL=1` 显式 opt-in 且具备 DeepSeek API Key 时运行，作为 soft sidecar 逐条件报告；无 key/未 opt-in 时 MUST 记 not-run 并保留原因，且 MUST NOT 影响 semantic / practice_observation 结论。

#### Scenario: 无 key 时
- **WHEN** 环境无 DeepSeek Key 或未设置 LORELUM_JUDGE_REAL=1
- **THEN** judge 软分记 not-run，方向性结论只依据 semantic 与 practice_observation

### Requirement: 决策口径与边界

决策 MUST 按 `strictly-greater-than-each-control`：oracle 的 joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则记 diagnostic-only；本 change MUST NOT 创建正式 record、MUST NOT 升级 suite revision，且 MUST NOT 关闭/归档 candidate change（#162 已于 2026-08-10 合并，属既成事实，不作为可执行门禁）；结论不扩展到产品效果或模型泛化。

#### Scenario: 判别力成立
- **WHEN** oracle joint-pass 严格高于每个对照
- **THEN** 记录方向性结论，不扩大为正式结论

#### Scenario: 判别力不成立
- **WHEN** oracle 未严格领先任一对照
- **THEN** 记 diagnostic-only，并记录观察（如需调整 candidate，另立 change/revision）