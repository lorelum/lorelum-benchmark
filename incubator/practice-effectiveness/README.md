# Practice Effectiveness 候选卡

这里存放尚未进入正式 suite 的 `contract-derived seed` 候选测试。它们是依据
现有 benchmark contract、任务生命周期和产品边界合成的设计材料，不代表真实生产
issue，也不能单独证明 Lorelum Practice 在生产环境中的效果。

## 卡片格式

每张卡使用一个不可复用的 `*-v1` ID，并包含：

- 可证伪的实验主张和不泄露解法的用户提示；
- 相关 Practice、等长无关负对照及其审核状态；
- baseline 失败假设、starter/reference/evaluator 计划和可观察验收；
- 功能通过与遵从目标 Practice 的区分方式；
- 混杂因素、排除条件、风险和四种适用 treatment 条件；
- 晋升为正式 revision 前的冻结 checklist。

当前仓库尚未提供版本化的 Lorelum Practice、anti-pattern 或对应的
`irrelevant-practice` treatment。因此卡片中的相关 Practice 和负对照均标为
`MISSING`，在补齐并冻结这些依赖前不得晋升或用于效果结论。现有
`treatments/vercel-skill/v1` 是外部 Skill，只能作为可能的后续比较条件，不能冒充
Lorelum Practice。

为 `pe-untrusted-metadata-v1` 编写的待审核相关 Practice 与无关 control 位于
`practices/untrusted-metadata-v1/`。它们仍是 `draft-awaiting-review`，不改变上述
`MISSING` 状态，也不得注入 agent 或用于实验。

## 审核规则

1. 先补齐 Practice ID、版本、内容 hash、无关等长 control 及对应 treatment。
2. 为每张卡建立 `public/task.md`、可重建 starter 和 `private/evaluator`、
   `private/oracle`、reference；Agent workspace 只物化 public 内容。
3. 用本地确定性 fixtures 覆盖正常、边界和恶意输入；starter 必须失败，reference
   必须通过，且 evaluator 能区分功能结果与目标 Practice 的行为证据。
4. 完成 review checklist 后，才能复制为
   `suites/practice-effectiveness/tasks/<slug>/v1/` 并生成 snapshot；产生结果后
   不得修改 revision，变更须新建 v2。

现有 validator 只扫描正式 `suites/`、`treatments/`、`environments/`、
`results/records/` 等契约目录，不扫描本目录的 Markdown 候选材料；因此本次
`bun run validate` 验证的是仓库现有正式结构未被破坏，候选卡仍需人工按上述规则
审核，不能把 validator 通过当作卡片已冻结。
