## 0. OpenSpec、初始 PR 与规划澄清门

- [x] 0.1 确认 proposal/design/spec/tasks 与 Issue #199 单一声明范围一致；明确本 change 只负责 Pack-sourced treatment contract，不吸收 #196、#197、#200、#201 或 #202 的实现。
- [x] 0.2 执行 `openspec validate pack-sourced-practice-treatment --type change --strict --json`，修复所有 strict validation 问题；此阶段不得修改非 OpenSpec 实现文件。
- [x] 0.3 从最新 `origin/main` 的 `codex/pack-sourced-practice-treatment-199` 分支创建只含 OpenSpec artifacts 的初始 PR；PR 标题/正文引用 Issue #199，并明确不含 candidate fixture、runner、模型调用或结果记录。
- [x] 0.4 在正式规划阶段确认：prepare 阶段使用标准 Lore CLI 三步流程真实执行一次 install/query/get；采用 `kind: retrieval`、query provenance private sidecar、source/content/card 三 hash、baseline/三 timing node 的 delivery/审计口径；结论已写回 Issue #199、`design.md` 和本文件。

## 1. 固定 Pack-sourced treatment contract

- [ ] 1.1 依据已确认的规划决定，扩展/版本化 treatment schema，要求 Pack repository/ref/commit/version、Practice ID/source path、content digest/source hash/card hash、delivery form/channel、query provenance 和 applicability evidence identity；保持 baseline 与既有 skill treatment 可解析且不重写冻结语义。
- [ ] 1.2 创建版本化 treatment manifest 与 private canonical Practice/reference，固定已确认的 `agentic-coding-v0.4.0` 及不可变 source commit；不把正文、Pack 全量内容或 private evaluator/oracle/scoring 复制到 public/Agent 输入。
- [ ] 1.3 创建 `pack-practice-treatment/v1` provenance/applicability fixture，记录 `scope_changed` 的新兼容、并行旧新版本、回退事实与选中 Practice 的 `applies_when` 对应关系；对 evidence 和正文执行 SHA-256。

## 2. Deterministic resolver 与 delivery contract

- [ ] 2.1 实现依赖注入的 Pack prepare/query/get resolver：生产 prepare 通过标准 Lore CLI 在隔离 Store 中执行一次 install/query/get，测试接受固定 stdout fixture；验证 ref、commit、version、Practice ID、source path、content digest、source/card hash 和 applicability，任何漂移 fail closed；运行时不得重新 query。
- [ ] 2.2 实现供 #197 消费的最小 delivery metadata/payload helper：`practice-card` 只经 condition-scoped private runtime 送达，三节点复用同一已校验 payload；baseline/未声明 condition 显式无 payload。
- [ ] 2.3 实现 benchmark audit sidecar contract：完整 Pack provenance、selection provenance、applicability basis 和三节点 identity comparison 只写入非 Agent 审计材料；Agent-visible trace 仅保留 treatment version/hash/status。

## 3. 验证与生命周期门禁

- [ ] 3.1 添加 mock/fixture 测试：fixed identity、hash consistency、three-node same-content、baseline/undeclared isolation、wrong ref/version/id/hash rejection、query rerun/drift rejection、applicability evidence 和 delivery failure。
- [ ] 3.2 执行 public/private 泄露审计，确认没有 Practice 正文、Pack root/Store path、Pack 全量内容、evaluator/oracle/scoring 进入 Agent workspace、public task、starter、public trace 或日志。
- [ ] 3.3 运行 `bun run validate`、相关契约测试和 `git diff --check`；确认 CI 没有真实 Lore/model/network call，且没有正式 record、suite revision、run workspace、logs 或 generated diff 被提交；在同一 PR 中记录验证证据和未执行项。
- [ ] 3.4 完成第一轮 `ai-code-review` 并修复 must-fix；再在最新 diff 上完成第二轮 `thermo-nuclear-code-quality-review`，两轮 findings 和规则依据分别留档；在 change 完成前不得合并/归档初始 PR。
