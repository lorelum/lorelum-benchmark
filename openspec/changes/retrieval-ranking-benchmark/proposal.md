# Proposal

## Why

Lorelum 主仓库 Issue #236 要求判断任务相关 Practice 是否进入排序前候选，以及它是否压过领域相似但当前任务不匹配的 Practice。本仓库现有正式运行链路测量的是 Agent 编码任务，不足以证明检索召回或排名是否改善。本 change 关联 benchmark Issue #222。

## What Changes

- 新增独立 retrieval-ranking 评测轨道，不把它伪装成现有 Agent task/condition。
- 固定完整 Pack 语料快照及版本化 query/gold label/scorer，支持 candidate pool 与 final top-k 的分层诊断。
- 增加本地 runner、自动 scorer、批次 manifest/record 和结果附件完整性校验；gold labels 不传给主仓库 harness。
- 依赖主仓库先交付 N/K 分离和 ID-only 本地 harness；随后跑完整改动前 baseline。

## Capabilities

### New Capabilities

- `retrieval-ranking-evaluation`: 定义检索排名轨道的输入/金标隔离、候选与最终列表评测、可复现批次记录及运行有效性。

### Modified Capabilities

无。现有 Agent 编码轨道及其记录语义保持不变。

## Impact

新增 retrieval-ranking 专用 suite/fixture、track-specific schema 与 validator、runner/scorer、批次运行记录和验证测试。主仓库 Engine、普通 `lore query` 输出及公开产品 API 不在本 change 修改范围内。
