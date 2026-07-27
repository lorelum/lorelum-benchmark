## Context

`incubator/practice-injection/login-page-layered-api-v1/private/execution/run-local.ts` 是
登录页候选的本地执行器。它支持 `--dry-run`，但当前实现（`run-local.ts:270`）在 dry-run 分支
只输出 `login-practice-local-plan/v1` 计划 JSON 后立即 `process.exit(0)`，跳过了
`runAttempt`（`run-local.ts:170`）中的 `copyPublicWorkspace`、`workspaceFiles` 和 private 泄露
断言（`run-local.ts:187-189`）。

也就是说，dry-run 验证了“计划了哪些条件”，但没有验证“实际工作区是否干净”。#75 早期曾因
private 材料进入工作区而返工；#89 将新增多个候选，每个候选都应在消耗模型预算前低成本确认
工作区只含 `public/` 文件。

## Goals / Non-Goals

### Goals

- 让 `--dry-run` 在输出计划 JSON 前，复制一次干净工作区并断言其不含 `private/` 或
  `practices/` 材料，但不调用模型、不运行 evaluator。
- dry-run 产物包含实际工作区文件清单，使维护者能在实跑前确认工作区边界。
- 为后续每个新候选（#89）提供可复用的实跑前置门禁。

### Non-Goals

- 不修改评分机制、evaluator、`verify-layering.ts`、`conditions.yaml` 或 `snapshot.json`。
- 不创建正式 record、run manifest 或冻结 suite revision。
- 不引入盲评、成本/时延统计或 Wiki 发布。
- 不改变 `login-practice-probe-fixture` 已归档的 public/private 隔离 requirement。
- 不修改 #75 已记录的本地结果。

## Decisions

### 决策 1：dry-run 复用现有 `copyPublicWorkspace` + `workspaceFiles`，不新增独立校验路径

dry-run 分支调用与 `runAttempt` 相同的工作区复制与文件列举函数，并对结果执行 private 泄露
断言。理由：避免维护两套工作区逻辑；若 dry-run 与实跑使用不同复制路径，dry-run 通过不能
保证实跑工作区也干净。

替代方案：新增独立的“工作区预检”函数。否决，因为会与 `runAttempt` 的复制逻辑产生漂移。

### 决策 2：dry-run 产物 schema 升级为包含 `workspace_files` 字段

计划 JSON 在现有 `planned_runs`、`workspace_template`、`output` 之上增加
`workspace_files`（实际复制的文件清单）。schema 版本保持 `login-practice-local-plan/v1`
（新增字段为向后兼容的附加字段，不破坏既有消费者）。

替代方案：升版本到 v2。否决，因为 dry-run 计划 JSON 无正式消费者，附加字段足够。

### 决策 3：dry-run 复制的工作区在 dry-run 结束后清理

dry-run 复制的工作区是临时校验产物，不应残留。dry-run 完成后删除其临时工作区目录，只保留
计划 JSON 输出。

替代方案：保留 dry-run 工作区供人工检查。否决，因为残留目录可能与实跑工作区混淆；需人工
检查时可用实跑的 `--output`。

### 决策 4：门禁失败时退出码 1 并写入 stderr

dry-run 若发现 private 材料进入工作区，以退出码 1 失败并在 stderr 报告泄露文件，使 CI 或
本地脚本能据退出码判定门禁状态。

## Risks / Trade-offs

- [dry-run 工作区与实跑工作区复制路径仍有细微差异] -> 通过复用同一函数消除差异；测试覆盖
  dry-run 与实跑的文件清单一致性。
- [dry-run 复制工作区增加少量磁盘与时间开销] -> 可接受，dry-run 不调模型，开销远低于一次
  实跑；且复制后立即清理。
- [新增 `workspace_files` 字段被误读为正式 record] -> 在计划 JSON 中标注 `dry_run: true`
  并保留 `schema_version` 为 plan/v1，不写入 `scratch/` 之外的正式路径。

## Migration Plan

1. 修改 `run-local.ts` dry-run 分支：复制工作区、列举文件、断言无 private、清理临时目录、
   输出含 `workspace_files` 的计划 JSON。
2. 在 `run-local.test.ts` 新增测试：dry-run 退出 0、产物含文件清单、清单不含 private、不
   产生 Pi/evaluator 输出。
3. 运行 `bun run validate`。
4. 回放登录页候选 dry-run，确认与现有行为一致（计划仍含三条件）。

回滚：revert 该分支提交即可，dry-run 行为回到只输出计划 JSON。

## Open Questions

- dry-run 是否应支持 `--output` 指定临时工作区位置以供调试？当前 `--output` 控制的是实跑
  摘要目录，dry-run 不产生摘要。建议 dry-run 忽略 `--output`，临时工作区用系统临时目录。
