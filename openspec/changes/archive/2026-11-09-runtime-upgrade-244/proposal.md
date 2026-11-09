# Proposal

## Why

Issue #244：当前 runtime 固定 Bun 1.4.2 / Pi 1.1.0，用户要求升级最新稳定运行环境；工具链版本和已有环境身份必须同步，不能改写历史运行意义。

## What Changes

- 将工作区、CI 与新版本环境升级至经验证的最新稳定 Bun、Node 和 Pi，冻结精确版本及 lockfile。
- 更新 Pi 扩展、模型、trace、sandbox 的不兼容部分并验证；创建新 environment 版本，保留历史版本。
- 构建和验证更新后的正式镜像；不默认调用真实模型或写正式 record。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ci-runtime-modernization`: 更新活跃运行时的精确版本和新 environment 版本，同时保留历史身份。

## Impact

涉及 package manifest、lockfile、CI、Dockerfile、runner、environments 和文档。新旧环境必须可分别解释；#242 自主检索业务不属于本变更。
