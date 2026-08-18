# llm-provider-gateway-v3-pilot-diagnostic Specification

## Purpose

定义对 `llm-provider-gateway-v3` 执行三条件本地诊断对照与泛化探针判别力验证的要求：使用冻结 candidate/conditions/snapshot、`deepseek/deepseek-v4-flash` model-tier、每条件 n=3、本地 Pi key 映射 runner 前置、人可读结果表与 joint-pass 决策边界；不改写冻结对象，不创建正式产物，不运行真实 judge。

## ADDED Requirements

### Requirement: 冻结输入与三条件诊断

诊断 MUST 以 `incubator/practice-injection/llm-provider-gateway-v3/` 的冻结 `conditions.yaml`（baseline / oracle-practice / irrelevant-practice）与 snapshot 为输入，MUST 使用本地 Pi diagnostic runner 执行；model-tier MUST 为 `deepseek/deepseek-v4-flash`，每条件 MUST 为 3 次（9 attempts），单 attempt 预算 MUST 为 25 分钟。执行 MUST NOT 修改 candidate 的题面/starter/evaluator/practices/snapshot。

#### Scenario: 冻结输入

- **WHEN** 诊断运行
- **THEN** 使用冻结 conditions 的三条件与 shared_execution，candidate 的题面/starter/evaluator/practices 在运行前后不变

#### Scenario: 盲评边界

- **WHEN** Pi agent 在任意条件运行
- **THEN** workspace/prompt 不包含 condition、evaluator、评分或评测信息

### Requirement: 本地 Pi key 映射前置修复

诊断运行前，本地 Pi 路由 MUST 把 `.env` 的 `LORELUM_PI_API_KEY` 映射为 `DEEPSEEK_API_KEY` 传给 Pi 进程，并配合 `PI_CODING_AGENT_DIR` catalog baseUrl 覆盖指向内部 endpoint。MUST NOT 通过显式 `--api-key` 传 key（其会破坏 catalog 覆盖导致 401）。该修复 MUST 只作用于本地 profile diagnostic runner，MUST NOT 改变正式 runner、environment、sandbox/proxy 或 record 契约。

#### Scenario: 内部 endpoint 认证

- **WHEN** 本地 diagnostic runner 执行 preflight 或 attempt
- **THEN** Pi 以 `DEEPSEEK_API_KEY` env 认证 deepseek provider，且模型 baseUrl 来自 `LORELUM_PI_BASE_URL`/`LORELUM_JUDGE_BASE_URL` 的 catalog 覆盖，preflight 返回 ok

#### Scenario: 正式契约不变

- **WHEN** runner 修复被检查
- **THEN** `src/benchmark/runner/pi/v2/execute.ts`、formal environment、sandbox/proxy 与 record 契约未被修改

### Requirement: 探针判别力验证与结果表达

诊断结果 MUST 按人可读原始维度呈现每条件 x/y：evaluated、semantic pass、practice observed/not-observed/indeterminate、joint_pass。`joint_pass` MUST 仅派生为 semantic=pass 且 practice_observation=observed；非健康评测 MUST 单独计数。决策 MUST 按 `strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则 `diagnostic-only`。MUST NOT 根据 condition 标签反向调整探针或回填 expected label。

#### Scenario: 方向性结论

- **WHEN** oracle joint-pass 严格高于每个对照且 attempt 全部 evaluated
- **THEN** 记录 `directional-screen`，不扩大为正式结论

#### Scenario: 不成立

- **WHEN** oracle joint-pass 等于或低于任一对照，或存在必要非健康 attempt
- **THEN** 记录 `diagnostic-only` 并保留 observation_reason

#### Scenario: 探针不读取条件标签

- **WHEN** 探针评估任意 attempt 源码
- **THEN** 分类仅基于 import graph、调用/数据流、模块所有权或可观察行为，condition id 与 expected label 不作为输入

### Requirement: judge 边界与生命周期

本 change MUST 保持 `judge-agent/generic/v2` 为冻结 soft sidecar，MUST NOT 运行真实 judge（judge 硬化由 #174 独立承接）；`judge-unavailable` 可接受，方向性结论只依据 semantic 与 practice_observation。本 change MUST NOT 创建正式 record、MUST NOT 升级 suite revision、MUST NOT 修改 v1/v2 或现有 suite/treatment/历史结果。诊断输出 MUST 保留在 `scratch/profile-diagnostics/` 或 OpenSpec change verification，不进入 `results/records`。

#### Scenario: judge 不可用

- **WHEN** 诊断运行且 judge 通道关闭
- **THEN** 对应 sidecar 记 judge-unavailable 与原因，方向性结论只依据 semantic 与 practice_observation

#### Scenario: 不创建正式产物

- **WHEN** 诊断完成
- **THEN** 未创建正式 record、未升级 suite，候选仍为 `candidate` 生命周期
