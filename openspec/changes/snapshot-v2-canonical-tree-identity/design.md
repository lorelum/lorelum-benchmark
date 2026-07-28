## Context

当前 snapshot v1（`src/benchmark/snapshot.ts`）以任务/候选目录下每个受管文件的路径 + SHA-256
构成完整 manifest，并以 `snapshot_id`（manifest JSON 的 SHA-256）作为身份。它同时通过
`resolved` 字段绑定 kernel core 版本/hash、profile 声明、materializer_kind、input hash、
materialized output hash 与（对 injection-calibration/v1）profile input hash。generated-output
目录、证据索引与 snapshot 自身被排除；`private/practices/` 对 injection-calibration profile
被排除，Practice 通过 profile input hash 绑定。

盘点显示全仓约 23 份 snapshot 共约 92 KB（每份约 84 行），随 candidate/fixture/revision 线性增长。
Issue #107 要求在不重写冻结/退休 v1 snapshot 或正式 record 的前提下，以版本化 canonical 树身份
降低逐文件 manifest 膨胀，同时保持可复现、可诊断、public/private 隔离与历史不可变。

## Goals / Non-Goals

**Goals:**

- 定义版本化、跨干净目录可复现的字节级 canonicalization 规则与树根摘要。
- 使内容变更、新增、删除、重命名、非法路径与 symbolic link 均 fail closed。
- 与 v1 并存；v1 历史 snapshot 与正式记录行为不变。
- 保留 generated-output 排除与 Practice/private 隔离；失配诊断不泄露私有内容。
- 显著降低新 v2 snapshot 的已提交体积，同时保留可读的失配定位能力。

**Non-Goals:**

- 不修改、重写或重新解释冻结/退休 v1 snapshot 或正式 record。
- 不实现 calibration fixture overlay（#106）；v2 与 #106 overlay resolver 的依赖顺序待确认。
- 不修改 #75、#89、#97 的 candidate 行为、Practice、calibration 结论或 source pin。
- 不删除历史源码、retired revision；不通过可变外部路径、symlink 或删除降低体积。
- 不运行 Pi、模型、retrieval、盲评或正式 record。

## Decisions

### D1：canonical 形式为 Merkle 树根摘要（待确认细节）

v2 的 canonical 身份采用确定性的 Merkle 式树根摘要：叶节点为 `<relative-path>\0<sha256(bytes)>`，
按路径字典序排序后逐层组合为树根 SHA-256。这给出跨平台、遍历顺序无关的稳定身份，且支持按需从
树根沿路径展开定位失配，而无需将完整逐文件清单作为默认提交主存储。

**待确认**：是否在树根之外保留按需 proof 格式，以及 proof 的具体编码与诊断能力边界
（见 Open Questions Q1）。

### D2：路径、字节、文件类型与排除规则

- 路径以正斜杠规范化，按字典序排序；拒绝绝对路径、`.`/`..`/空段。
- 仅纳入常规文件；symbolic link 在计算前失败。
- generated-output 目录、证据索引（`private/evidence-index/`）与 snapshot 自身
  （`private/snapshot.json`）排除，与 v1 一致。
- 对 `injection-calibration/v1` profile，`private/practices/` 排除；Practice 通过
  profile input hash 绑定。

### D3：v1/v2 并存与版本选择

v2 与 v1 并存，由 snapshot document 的 `version` 字段（`1` 或 `2`）决定验证路径。不存在
隐式迁移；冻结/退休 revision 的 v1 snapshot 不被转换。新输入可选择 v2。v1 验证代码路径保持不变。

### D4：source、profile input 与 private payload 边界

v2 复用 v1 的 resolved 绑定（core 版本/hash、profile、materializer_kind、input hash、
materialized output hash、profile input hash、calibration sets hash）。失配诊断仅暴露受影响
受管路径与失配类型，不暴露 Practice 文本、`private/practices/` 路径或私有 evaluator/oracle 内容。

## Risks / Trade-offs

- [树根摘要成为不可解释黑盒] -> canonicalization 规则、叶节点编码与受控失配诊断在契约中显式定义。
- [v1/v2 并存增加维护成本] -> 版本字段单一选择点，v1 路径冻结不再演进。
- [canonicalization 在平台间漂移] -> 字节级 SHA-256 + 正斜杠路径 + 字典序，跨干净目录测试覆盖。
- [overlay resolver 依赖未定] -> v2 首版范围与 #106 合成树的依赖顺序待确认（见 Open Questions）。

## Migration Plan

1. 完成 strict OpenSpec validation 并创建仅含 OpenSpec artifacts 的初始 PR。
2. 在规划澄清门禁确认 Open Questions 后，将结论写回 Issue #107、本 design 与 `tasks.md`。
3. 按 `tasks.md` 依赖顺序实现 v2 canonicalization、验证路径与共存选择逻辑。
4. 每完成一项任务运行 focused tests；触及 suite/task/schema/benchmark code 时运行 `bun run validate`。
5. 不执行模型调用、正式 record 或 candidate 升级为 suite revision。

## Open Questions

以下问题构成实现门禁，必须在开始候选 fixture 或 benchmark 代码实现前向需求方确认，并写回 Issue #107、
本 design 与 `tasks.md`：

- **Q1 canonical 形式边界**：v2 采用纯 Merkle 树根摘要，还是树根 + 按需 proof？proof 的具体编码、
  诊断能力与提交边界如何定义？
- **Q2 首版适用范围**：v2 首版限于 incubator candidate，还是允许无运行记录的非冻结 suite revision 迁移？
- **Q3 v1/v2 并存与迁移**：v1 与 v2 的选择规则、迁移与验证策略；如何确保不重写冻结/退休 v1 snapshot 或 record？
- **Q4 与 #106 overlay resolver 依赖顺序**：PR #108 已实现但尚未合并。v2 等待 #108 合并、基于其分支，
  还是先完成独立 schema/validator 设计？v2 首版是否需要引用 overlay 合成树身份？
- **Q5 canonical path/字节/文件类型/目录/symlink/非法路径/generated-output 排除规则**：确认上述 D2
  规则的最终边界，特别是目录条目是否参与树根、generated-output 排除清单是否与 v1 完全一致。
- **Q6 profile input hash、source pin、Practice/private payload 边界**：确认 v2 如何承载这些绑定，
  以及失配诊断如何在不泄露私有内容的前提下定位失配。