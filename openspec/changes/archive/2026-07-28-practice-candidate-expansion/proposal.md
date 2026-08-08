## Why

#75 在登录页 candidate 中观察到相关 Practice 的方向性信号，但单题无法区分可迁移的
Practice 效果与该题特有的 API 分层结构。#89 要求新增少量、独立校准的 candidate，以在不
创建正式 record 或执行模型的前提下，为后续 #90/#91 的多 candidate 对照准备可审查输入。

## What Changes

- 在规划澄清完成后，于 `incubator/practice-injection/` 新增 2-3 个 Practice-injection
  candidate；每个均有公开任务与 starter、私有相关/无关 Practice、私有语义验收、仅报告的
  质量 probe 和候选 snapshot。其 conditions 固定 baseline（无注入）、oracle-practice 和按固定
  计量方式等长的 irrelevant-practice，除注入内容外保持执行输入一致。
- 每个新 candidate 声明 `core/v1`、`injection-calibration/v1` 与 `react-vite` materializer，
  并按 profile v1 提供真实 Practice SHA-256、versioned Practice metadata、结构化 decision rule
  和 resolved profile-input hash。profile 不接受旧登录页 candidate 的自由格式 conditions。
- 在 candidate 校准前，先提交不含生成物的 source seed commit；candidate declaration 与
  snapshot 在后续提交中固定该 commit。Practice 文件不进入通用 snapshot files，而由 profile
  input hash 绑定。
- 为每个 candidate 提交不调用模型的 calibration：reference 和职责等价实现通过质量 probe，
  public starter 与已登记的 anti-pattern 在公开语义通过时被质量 probe 拒绝。
- 为后续本地执行保留与 #94 一致的 Pi/模型可达 preflight 前提；后续执行 change 必须将它集成到
  多 candidate 执行入口。本 change 不运行候选、不生成 scratch 结果、不创建 record。

## Capabilities

### New Capabilities

- `practice-candidate-expansion`: 定义为 Practice-injection 实验扩展候选集选择、隔离、校准、
  snapshot 和执行前门禁的要求。

### Modified Capabilities

无。本 change 不改写既有登录页 candidate、活跃 suite、共享 runner、schema 或正式 record。

## Impact

本 change 消费 #100 定义的 `injection-calibration/v1` profile，不定义 profile 契约本身；
candidate 的 kernel 声明依赖 #100 合并。

- 预期新增：`incubator/practice-injection/<candidate-id>/` 下的候选材料及其 snapshots。
- 新 candidate 依赖已合并的 #101 kernel 与 #102 Practice profile；#75 继续保留为非-kernel 的
  历史候选，不能作为新 profile runner 的执行回放输入。
- 不影响：#75 已完成的登录页 candidate、`suites/`、`results/records/`、共享 evaluator helper、
  treatment、environment 与 retrieval 条件。
- 关联 issue：#89；依赖已归档的 #81 边界契约和 #94 preflight。
