## Context

当前 snapshot v1（``src/benchmark/snapshot.ts``）以任务/候选目录下每个受管文件的路径 + SHA-256
构成完整 manifest，并以 ``snapshot_id``（manifest JSON 的 SHA-256）作为身份。它同时通过
``resolved`` 字段绑定 kernel core 版本/hash、profile 声明、materializer_kind、input hash、
materialized output hash 与（对 injection-calibration/v1）profile input hash。generated-output
目录、证据索引与 snapshot 自身被排除；``private/practices/`` 对 injection-calibration profile
被排除，Practice 通过 profile input hash 绑定。

盘点显示全仓约 23 份 snapshot 共约 92 KB（每份约 84 行），随 candidate/fixture/revision 线性增长。
Issue #107 要求在不重写冻结/退休 v1 snapshot 或正式 record 的前提下，以版本化 canonical 树身份
降低逐文件 manifest 膨胀，同时保持可复现、可诊断、public/private 隔离与历史不可变。

#106 的 calibration fixture overlay（PR #108）已合并到 ``origin/main``，``resolved`` 字段已支持
``calibration_sets_hash`` 绑定。v2 基于该主线实现，自然复用该绑定。

## Goals / Non-Goals

**Goals:**

- 定义版本化、跨干净目录可复现的字节级 canonicalization 规则与树根摘要。
- 使内容变更、新增、删除、重命名、非法路径与 symbolic link 均 fail closed。
- 与 v1 并存；v1 历史 snapshot 与正式记录行为不变。
- 保留 generated-output 排除与 Practice/private 隔离；失配诊断不泄露私有内容。
- 显著降低新 v2 snapshot 的已提交体积，同时保留可读的失配定位能力。

**Non-Goals:**

- 不修改、重写或重新解释冻结/退休 v1 snapshot 或正式 record。
- 不修改 #75、#89、#97 的 candidate 行为、Practice、calibration 结论或 source pin。
- 不删除历史源码、retired revision；不通过可变外部路径、symlink 或删除降低体积。
- 不运行 Pi、模型、retrieval、盲评或正式 record。

## Decisions

### D1：canonical 形式为纯 Merkle 树根摘要 + 按需内存诊断（已确认）

v2 的 canonical 身份采用确定性的 Merkle 式树根摘要：叶节点为 ``<relative-path>\0<sha256(bytes)>``，
按路径字典序排序后逐层组合为树根 SHA-256。已提交主存储仅为树根摘要，不持久化完整逐文件清单或 proof。
验证失败时在内存中重新展开树，定位受影响路径与失配类型，不在 snapshot 中持久化 proof 片段。这给出
跨平台、遍历顺序无关的稳定身份，体积最小且仍可诊断。

### D2：路径、字节、文件类型与排除规则（已确认）

- 路径以正斜杠规范化，按字典序排序；拒绝绝对路径、``.``/``..``/空段。
- 仅纳入常规文件；symbolic link 在计算前失败。
- 叶节点为 ``路径\0SHA256``；目录不作为独立节点，仅通过其下文件的路径前缀体现。
- generated-output 目录（``node_modules``、``dist``、``test-results``、``playwright-report``、
  ``.vite``、``.materialized``、``.practice-runtime``、``.run-workspaces``、``logs``）、
  证据索引（``private/evidence-index/``）与 snapshot 自身（``private/snapshot.json``）排除，
  与 v1 完全一致。
- 对 ``injection-calibration/v1`` profile，``private/practices/`` 排除；Practice 通过
  profile input hash 绑定。

### D3：v1/v2 并存与版本选择（已确认）

v2 与 v1 并存，由 snapshot document 的 ``version`` 字段（``1`` 或 ``2``）决定验证路径。不存在
隐式迁移；冻结/退休 revision 的 v1 snapshot 不被转换。v1 验证代码路径冻结不再演进。新输入可选择 v2。

### D4：首版适用范围（已确认）

v2 首版限于 incubator candidate 与新创建（无运行记录）的非冻结 suite revision。冻结/退休 revision
一律不迁移到 v2。

### D5：与 #106 overlay resolver 的依赖顺序（已确认）

PR #108（#106 calibration fixture overlay）已合并到 ``origin/main``。v2 直接基于最新主线实现，
自然复用 overlay resolver 的 ``calibration_sets_hash`` 绑定。v2 不需要独立等待或分支耦合；两条
证据链在主线汇合，互不阻塞。

### D6：source、profile input 与 private payload 边界（已确认）

v2 复用 v1 的 resolved 绑定字段（core 版本/hash、profile、materializer_kind、input hash、
materialized output hash、profile input hash、calibration sets hash）。失配诊断仅输出受影响
受管路径与失配类型（如 ``路径: hash 不匹配``），绝不输出 Practice 文本、``private/practices/``
路径或私有 evaluator/oracle 内容。

## Risks / Trade-offs

- [树根摘要成为不可解释黑盒] -> canonicalization 规则、叶节点编码与受控失配诊断在契约中显式定义。
- [v1/v2 并存增加维护成本] -> 版本字段单一选择点，v1 路径冻结不再演进。
- [canonicalization 在平台间漂移] -> 字节级 SHA-256 + 正斜杠路径 + 字典序，跨干净目录测试覆盖。
- [失配诊断泄露私有内容] -> 诊断仅输出受管路径与失配类型，测试覆盖 Practice/practices 泄露。

## Migration Plan

1. ~~完成 strict OpenSpec validation 并创建仅含 OpenSpec artifacts 的初始 PR。~~（已完成，PR #110）
2. ~~在规划澄清门禁确认 Open Questions 后，将结论写回 Issue #107、本 design 与 ``tasks.md``。~~（本次完成）
3. 按 ``tasks.md`` 依赖顺序实现 v2 canonicalization、验证路径与共存选择逻辑。
4. 每完成一项任务运行 focused tests；触及 suite/task/schema/benchmark code 时运行 ``bun run validate``。
5. 不执行模型调用、正式 record 或 candidate 升级为 suite revision。