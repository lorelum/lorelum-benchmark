## 1. 规划澄清

- [ ] 1.1 初始 OpenSpec PR 创建并审核后，向需求方确认至少一个后续 candidate 的公开可观察行为、Practice 行为、baseline 缺陷、相关/无关对照、语义验收、质量信号、源码快照和执行边界。
- [ ] 1.2 将确认结果写回 #81 与本 change 的 design/tasks；若任何候选的题面、Practice、probe 或结论解释仍未确定，暂停对应实现。

## 2. 维护者指南

- [ ] 2.1 仅在 `docs/PRACTICE_BENCHMARK_GUIDE.md` 新增维护者指南：定义五类信息、Practice 的可迁移写法、公共接口例外以及禁止将 reference 偏好设为默认硬门槛；为每类提供至少一个正例和反例。
- [ ] 2.2 在同一指南定义语义硬门槛、quality signal 的独立报告、运行前 reference/等价实现/反模式校准，以及面向人的原始结果表要求；加入将 #75 相关 probe 断言映射到五类信息的分类矩阵。
- [ ] 2.3 从 `docs/BENCHMARK_PROTOCOL.md` 链接该指南；不得在本 change 修改 `incubator/`、`suites/`、共享 runner、schema、环境、record 或执行任何模型调用。

## 3. 验证与收口

- [ ] 3.1 审阅指南中的正反例和 #75 分类矩阵，确认其每条相关 probe 断言都归入五类信息之一，且未公开的 reference 路径、helper 或命名没有被列为硬门槛；确认 #75 的通用 Practice、职责等价 probe 校准和结果表可以按规则分类，且不把其两次本地结果升级为产品结论。
- [ ] 3.2 运行 `openspec validate practice-design-quality-gates --type change --strict`、`git diff --check` 和 `bun run validate`；在 PR 中记录通过结果及未执行模型运行的原因。
- [ ] 3.3 更新 #81 的设计结论和 PR 验证证据；后续 candidate/evaluator 改动仅通过独立 issue 与 OpenSpec change 承接。
