## Why

现有 `judge-agent/generic/v1/v2` 仍绑定远端 LLM、代码类证据和固定任务校准方式，无法回答一个更小但更关键的问题：固定一个 3B 以下的本地模型、judge core 和判断协议后，只更换场景描述、证据投影、rubric 与校准标签，是否仍能稳定完成判断并在证据不足时 abstain。该问题同时受 #225 约束：原型必须离线、显式运行，不能影响 P1 runner、语义硬门槛或普通 CI。

## What Changes

- 新增一个原型级、显式启用的离线 Judge core，使用不超过 3B 的本地模型 artifact，并固定 runtime、量化、tokenizer、prompt、温度、随机种子、上下文预算和权重 hash。
- 将场景差异隔离为 scenario profile、evidence adapter、固定 rubric 和 calibration labels；确定性代码负责证据投影、输入校验、汇总、schema 校验与 abstain，本地模型只回答受约束的短判断任务。
- 以 Gateway v3 和 Source-authority 作为开发场景，以 Compaction 摘要作为预先声明的 holdout；holdout 加入时只允许新增适配材料，core、prompt 主体、输出协议和聚合规则必须零改动。
- 在 holdout 运行前冻结并记录 core、prompt、模型、输出 schema、阈值和聚合规则，输出包含成对准确率、等价对稳定性、A/B 顺序交换一致性、abstain、证据引用、schema 合法性与高置信错误的 generalization report。
- 复用固定任务 rubric 时只读适配，不修改 `generic/v1`、`generic/v2`、P1 runner、Pi runner、公共 schema、provider registry 或 `judge-result/v1`；本地 Judge 仍是软信号和实验设施，不改变任何语义硬门槛。
- 普通 CI 只测试确定性投影、schema、汇总、abstain、provenance 与 core zero-diff 检查；模型权重、真实模型调用和正式 record 均不进入默认验证路径。

## Capabilities

### New Capabilities

- `offline-judge-core-generalization`: 定义离线本地 Judge core 的场景适配边界、冻结与 holdout 协议、证据与 provenance 要求、abstain 行为、报告指标，以及与固定任务 rubric 和现有 runner 的迁移边界。

### Modified Capabilities

无。

## Impact

- 关联 Issue：[#225](https://github.com/lorelum/lorelum-benchmark/issues/225)。
- 预期新增独立原型目录、版本化 scenario profile/evidence adapter、私有 calibration fixture 与本地显式运行入口；具体路径和依赖在 Plan mode 确认后写入 `design.md` 和 `tasks.md`。
- 不修改已有 `judge-agent/generic/v1/v2`、`practice-layered-api/v2`、`skill-trigger-source-authority/v1/v2`、P1/Pi runner、公共 schema、provider registry 或已有 task revision。
- 不创建正式 record、不升级 suite/candidate、不把原型接入语义判定；未来接入 #209 或其他公共契约必须另立 change。
- 本地模型 artifact 不入库，只记录 hash 与可复现 locator；普通 CI 不下载、不加载、也不调用真实模型。
