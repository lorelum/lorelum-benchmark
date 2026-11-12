# Proposal

## Why

Issue #242：现有 Pack treatment 在运行前由 runner 查询并注入 Practice，不能衡量编码 Agent 自主检索及安装 Pack 对最终结果的影响。需要单独的端到端对照，而非将 #222 检索排名或 #214 注入试验误当成产品效果。

## What Changes

- 增加版本化 Pack 安装/空 Store 配对评测及可复现隔离环境；任务、starter、提示、工具、模型与预算保持一致。
- Agent 自行决定是否 query/get；独立记录检索行为、运行健康、功能正确性和代码与架构质量。
- 建立可供贡献者复用的任务、环境与私有 verifier 接入路径；任务和 Pack 可替换，功能与可选质量证据独立报告。
- 编写环境、任务、执行、产物交接和结果解读指南；以不同技术栈任务验证复用，保留历史实验语义，不更改已冻结 revision。

## Capabilities

### New Capabilities

- `autonomous-pack-comparison`: 安装 Pack 对照中的输入一致性、自主检索观测、隔离与结果表达。

### Modified Capabilities

无。已有 Practice 注入和检索排名轨道保留。

## Impact

涉及 `schemas/`、`src/benchmark/`、`environments/`、`treatments/`、`incubator/`、实验计划与维护者文档。正式 record 和模型运行需另行满足现有生命周期、安全及授权门禁。
