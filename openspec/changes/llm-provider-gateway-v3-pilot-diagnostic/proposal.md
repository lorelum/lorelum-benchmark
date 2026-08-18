## Why

#172/#173 交付了 `llm-provider-gateway-v3`：公开题面复刻 v2，私有结构探针改为名称无关的职责边界判定，新增命名变体/decoy-import/真实 PI-derived 回归矩阵。14-case 确定性校准、历史回放（baseline 0/3、oracle 3/3、irrelevant 0/3 observed）、OpenSpec strict、泄露审计全部通过。#175 的 one-repeat smoke 已观察到方向信号，但 oracle 因 25 分钟预算超时未完成正式语义评估。本 change 承接 #178，对 v3 执行完整三条件本地诊断对照（n=3），验证泛化探针在真实模型输出上的判别力，并交付使 smoke 可运行的前置 runner 修复。

## What Changes

- 以本地 Pi diagnostic runner 对 `incubator/practice-injection/llm-provider-gateway-v3` 执行三条件对照（baseline / oracle-practice / irrelevant-practice）。
- 每条件 3 次、共 9 attempts，预算 25 分钟/attempt；模型仅 `deepseek/deepseek-v4-flash`（与 v3 conditions.yaml 一致）。
- 前置 runner 修复：本地 Pi 路由把 `.env` 的 `LORELUM_PI_API_KEY` 映射为 `DEEPSEEK_API_KEY` 传给 Pi 进程（Pi 以该 env 认证 deepseek provider），同时保留 `PI_CODING_AGENT_DIR` catalog baseUrl 覆盖；不引入显式 `--api-key`（其会破坏 catalog 覆盖）。该修复只影响本地 profile diagnostic runner，不改变正式 runner、environment 或 record 契约。
- judge：`judge-agent/generic/v2` 保持冻结 soft sidecar，本 pilot 不运行真实 judge（judge 硬化由 #174 独立承接），`judge-unavailable` 可接受。
- 结果按人可读原始维度呈现：evaluated / semantic / practice_observation / joint_pass。
- 决策按 `strictly-greater-than-each-control`：oracle joint-pass 严格高于 baseline 与 irrelevant-practice 才支持方向性结论，否则 diagnostic-only。
- 不改写 candidate、不创建正式 record、不升级 suite revision。

## Capabilities

### New Capabilities

- `llm-provider-gateway-v3-pilot-diagnostic`: 定义对 `llm-provider-gateway-v3` 执行三条件本地诊断对照与泛化探针判别力验证的要求——使用冻结 candidate/conditions/snapshot、flash model-tier、n=3、人可读结果表、joint-pass 决策边界，以及本地 Pi key 映射 runner 前置。

### Modified Capabilities

无。现有 `practice-injection-v2-diagnostic-execution`、`practice-observation-diagnostics`、`practice-structure-probe-calibration` stable specs 已覆盖诊断执行、观测与探针规范；本 change 只落地一个 candidate 的诊断执行与 runner 本地修复。

## Impact

- 只运行与本地 runner 修复，不改写 candidate：`incubator/practice-injection/llm-provider-gateway-v3/` 的 public/private 保持冻结。
- 依赖：#172/#173 candidate 就绪（已合并到 main）；本地 Pi diagnostic runner 支持 node-ts；`.env` 提供 `LORELUM_PI_BASE_URL` 与 `LORELUM_PI_API_KEY`。
- 产出：本地诊断结果（`scratch/profile-diagnostics/` 或 OpenSpec change verification），不进入 `results/records`。
- 不进入默认 suite，不创建正式 record。
