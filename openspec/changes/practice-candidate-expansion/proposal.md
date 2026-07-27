## Why

#75 在登录页 candidate 中观察到相关 Practice 的方向性信号，但单题无法区分可迁移的
Practice 效果与该题特有的 API 分层结构。#89 要求新增少量、独立校准的 candidate，以在不
创建正式 record 或执行模型的前提下，为后续 #90/#91 的多 candidate 对照准备可审查输入。

## What Changes

- 在规划澄清完成后，于 `incubator/practice-injection/` 新增 2-3 个 Practice-injection
  candidate；每个均有公开任务与 starter、私有相关/无关 Practice、私有语义验收、仅报告的
  质量 probe 和候选 snapshot。
- 为每个 candidate 提交不调用模型的 calibration：reference 和职责等价实现通过质量 probe，
  已登记的 anti-pattern 在公开语义通过时被质量 probe 拒绝。
- 为后续本地执行保留与 #94 一致的 Pi/模型可达 preflight 前提，但本 change 不运行候选、
  不生成 scratch 结果、不创建 record。

## Capabilities

### New Capabilities

- `practice-candidate-expansion`: 定义为 Practice-injection 实验扩展候选集选择、隔离、校准、
  snapshot 和执行前门禁的要求。

### Modified Capabilities

无。本 change 不改写既有登录页 candidate、活跃 suite、共享 runner、schema 或正式 record。

## Impact

- 预期新增：`incubator/practice-injection/<candidate-id>/` 下的候选材料及其 snapshots。
- 不影响：#75 已完成的登录页 candidate、`suites/`、`results/records/`、共享 evaluator helper、
  treatment、environment 与 retrieval 条件。
- 关联 issue：#89；依赖已归档的 #81 边界契约和 #94 preflight。
