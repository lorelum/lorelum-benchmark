## Why

Issue #107 的 snapshot v1 以逐文件路径 + SHA-256 manifest 作为每个任务/候选的提交主存储。
它直接、易审计，但随 candidate、fixture 与 revision 增长，重复路径和 hash 持续写入仓库
（全仓约 23 份 snapshot 共约 92 KB，每份约 84 行）。需要一份与 v1 并存的版本化 canonical
树身份契约，在不重写冻结/退休 v1 snapshot 或运行记录的前提下，以确定、可复现、可诊断的
树根摘要替代逐文件清单作为新输入的已提交主存储，同时保留 fail-closed 的 source、materialization
与 resolved profile 输入绑定。

## What Changes

- 新增版本化的 snapshot v2 schema 与 canonicalization 规则：定义目录遍历、路径规范化（正斜杠、
  排序、无 ./../绝对路径）、文件类型（仅常规文件）、字节级 SHA-256、目录树 hash 的 Merkle
  式组合与稳定编码，使同一受管输入树在跨干净 checkout 中产生相同身份。
- v2 以版本化的 canonical tree root（树根摘要）替代逐文件 manifest 作为已提交主存储；支持在
  验证失败时按受控方式定位树内不匹配，但完整逐文件清单不再作为每份新 snapshot 的默认提交内容。
- 内容变更、新增、删除、重命名、非法路径、symbolic link 及错误 schema 均必须使身份校验失败
  （fail closed）；generated-output 目录（node_modules、dist、.vite、.practice-runtime 等）
  与证据索引的排除规则与 v1 一致。
- v1 与 v2 并存：v1 继续验证现有、retired 与已冻结 revision 的 snapshot；v2 作为新输入的
  可选格式。选择规则、版本字段与迁移策略在 design 中确定，绝不重写或重新解释冻结/退休 v1
  snapshot 或正式 record。
- source commit、resolved profile input hash、Practice/private payload 边界继续以 fail-closed
  digest 绑定；失配诊断不得泄露 Practice 文本、`private/practices/` 路径或私有 evaluator/oracle
  内容到 agent workspace、公开 prompt、trace、普通 snapshot 文件或生成物。

## Capabilities

### New Capabilities

- `snapshot-canonical-tree-identity`: 版本化的 canonical 源码树身份契约，定义确定性
  canonicalization、树根摘要、受控失配诊断、generated-output 排除、v1/v2 并存与选择规则，
  以及 public/private 泄露防护。

### Modified Capabilities

- 无。snapshot v1 的 resolved snapshot 契约（`benchmark-candidate-resolved-snapshot`）仍处于
  未归档的 `benchmark-candidate-workspace-kernel` change 中；本 change 不修改其既有 requirement，
  仅在 v2 中定义并列的版本化格式与共存策略。

## Impact

- `src/benchmark/snapshot.ts` 的 snapshot 生成与验证路径：新增 v2 格式与版本选择逻辑，保留
  v1 验证路径不变。
- `src/benchmark/kernel/` 的 core hash、materialize 与 isolate 输入边界：v2 复用同一受管输入树
  与隔离审计，不改变既有 v1 行为。
- 相关 focused tests、public/private 泄露审计与文档；不修改 #75、#89、#97、不实现 calibration
  fixture overlay（#106）、不运行 Pi、模型、retrieval、盲评或正式 record。