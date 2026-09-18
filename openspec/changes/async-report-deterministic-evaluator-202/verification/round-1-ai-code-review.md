# Round 1: ai-code-review

- 审查范围：`8edb137` 之后的 #202 working tree，包括独立 evaluator 包、private fixtures、calibration、leakage audit 和 OpenSpec 更新。
- 审查身份：只读 benchmark contract review；未在这一轮审查过程中修改代码。
- 审查依据：`AGENTS.md`、`docs/CHANGE_WORKFLOW.md`、`docs/BENCHMARK_PROTOCOL.md`、`docs/WORKSPACE_LAYOUT.md`、`docs/TASK_LIFECYCLE.md`、`docs/PR_REVIEW.md` 和 `.agents/skills/ai-code-review/SKILL.md`。

## Findings

### F1 must-fix: 包级 snapshot 缺失导致仓库验证失败

- 位置：`incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/snapshot.json`
- 规则来源：`AGENTS.md` 要求 suite、任务、schema 或 benchmark code 改动后运行 `bun run validate`；`ai-code-review` 要求新 benchmark artifact 能通过仓库验证门禁。
- 证据：首次运行 `bun run validate` 失败，报错为 `Missing snapshot: incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/snapshot.json`。原因是指有 nested evaluator snapshot，缺少仓库 snapshot discovery 约定的 package-level snapshot。
- 影响：实现本身不能通过仓库生命周期门禁，PR 无法进入合并前验证。
- 修复：新增 sibling package `private/snapshot.json`，由仓库 `src/benchmark/snapshot.ts` 生成；nested `private/evaluator/v1/snapshot.json` 继续承担 evaluator runtime source identity。同步更新 design、delta spec 和 tasks 的范围说明。
- 最小验证：`bun run validate` 通过，输出 `Workspace layout is valid.` 与 `Snapshots are intact.`。
- 状态：fixed。

### F2 should-fix: 死导出和重复文件系统遍历

- 位置：`incubator/practice-injection/async-report-lifecycle-evaluator-v1/private/evaluator/v1/`
- 规则来源：`thermo-nuclear-code-quality-review` 的删除重复 helper、避免无效 wrapper 和减少文件遍历逻辑漂移要求。
- 证据：`fixtureRelativePath`、`valueRecord` 未被使用；`identity.ts`、`leakage-audit.ts` 和 `fixtures/generate-manifest.ts` 各自实现递归列目录，`harness.ts` 和 `calibration/materialize.ts` 各自实现递归拷贝。
- 影响：增加维护面，并可能让不同路径的过滤规则逐渐不一致。
- 修复：新增 `files.ts` 统一 `listRelativeFiles` 和 `copyDirectory`，删除未使用导出；重新生成 nested snapshot 和 package snapshot。
- 最小验证：`bun test checks.test.ts result.test.ts identity.test.ts harness.test.ts summary.test.ts` 20/20 通过；完整 calibration 12/12 通过；`bun run validate` 通过。
- 状态：fixed。

## Conclusion

未发现剩余 must-fix。public/private 隔离、生命周期、fixture provenance、结果契约、失败关闭和 identity 边界均有可复核证据。未运行正式模型、未创建 record、未修改 #196 candidate、#197 runner 或 #199/#200 文件。

未覆盖范围：没有第二套操作系统 CI 证据；本轮只在当前 Windows workspace 执行 deterministic checks。
