# AI Code Review Round 1（#199）

- 审查范围：`origin/main...4e19290`
- 审查类型：`ai-code-review`
- 审查日期：2026-09-16
- 关联 Issue：#199
- 关联 PR：#215

## 结论

未发现必须修改的问题。

## 核查结果

- **评测隔离**：Practice body、selection provenance 和 applicability basis 位于 treatment `private/`；没有复制到 public task/starter、Agent workspace 或 public trace。
- **Pack provenance**：manifest 固定 repository、`agentic-coding-v0.4.0` ref、resolved commit、Practice source path、source/card/content 三种 hash；prepare 失败时不生成替代 Practice。
- **Lore 调用边界**：prepare adapter 只在独立准备阶段执行固定 install/query/get；delivery helper 不接受 query provider，三个 node 共用已校验 payload。
- **query 选择边界**：semantic query 只要求目标 Practice 出现在结果集并记录 rank，不把 rank 当作九次 timing 实验的质量结论；不自动降级到 keyword 或静默换卡。
- **生命周期**：未修改 suite、task revision、evaluator、runner、正式 record 或结果；改动保持在 #199 treatment contract 范围内。
- **baseline/未声明 condition**：不生成 Practice payload，delivery failure/unsupported 显式返回。
- **验证**：OpenSpec strict、`bun run validate`、Pack Practice contract tests 和 `git diff --check` 均通过。

## Review addendum

Latest diff `4e19290` also centralizes private output path validation between the prepare adapter and runtime contract; the addendum introduced no new lifecycle, isolation, or reproducibility finding.

## 未覆盖范围

- 未执行真实 Lore CLI、网络、semantic model、Agent 模型运行或 #201 九次探索，符合本 change 的生命周期门禁。
- 未审查 #197 staged runner 的实现；本 PR 未修改该 runner。

## 规则依据

- `AGENTS.md`：public/private 隔离、Pack treatment condition scope、OpenSpec 生命周期、验证门禁和双轮 review 要求。
- `docs/WORKSPACE_LAYOUT.md`：treatment private material 不得进入 Agent workspace，运行输入与正式记录边界。
- `docs/TASK_LIFECYCLE.md`：未升级 suite revision，不修改冻结任务或正式 record。
- `schemas/pack-practice-treatment.schema.json`：Pack identity、delivery channel、hash 和 applicability 字段约束。
