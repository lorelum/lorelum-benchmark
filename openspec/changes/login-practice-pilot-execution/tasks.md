## 1. 流程门禁

- [x] 1.1 回读 Issue #75、#73/#77 及已校准 candidate，确认本 change 只处理非正式人工小试的执行准备，不改写归档事实。 [写入范围：无]
- [x] 1.2 对本 change 运行 strict OpenSpec validation，在最新 `main` 派生的 `codex/login-practice-pilot-execution` 创建仅含 OpenSpec artifacts 和必要流程约束的初始 PR #78，并关联 Issue #75。 [写入范围：`openspec/changes/login-practice-pilot-execution/`、`AGENTS.md`、GitHub PR]
- [ ] 1.3 在初始 PR 创建后，向负责人确认 design 中列出的可观察行为、Practice 对照、私有验收、candidate/source snapshot、模型/提示/预算、artifact storage、盲评与停止条件；将回答写回 Issue #75、`design.md` 与本文件。未确认前不得实现或调用模型。 [写入范围：Issue #75、`openspec/changes/login-practice-pilot-execution/`]

## 2. 执行前契约与隔离

- [ ] 2.1 根据已确认输入创建 candidate 私有 execution snapshot，固定 source commit、candidate snapshot、公共输入、Practice、系统 prompt、工具策略、模型、预算、环境和六个预注册 attempt ID；更新受影响 candidate snapshot。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/`]
- [ ] 2.2 实现并验证经批准的非正式执行路径：每次尝试使用新工作区，只 materialize `public/task.md` 与 `public/starter/`，并仅通过 condition-scoped private runtime channel 注入 Practice。 [写入范围：经确认的 candidate 私有执行治理；如需 runner 变更，先在本 change 中明确版本与验证范围]
- [ ] 2.3 对受保护 artifact storage 执行写入、版本化、不可变保留、URI 和 SHA-256 preflight；无法核验时停止，不创建执行产物。 [写入范围：受保护外部 storage；仓库仅记录允许入库的私有索引]
- [ ] 2.4 运行 candidate snapshot、public/private 泄露审计和执行前 dry-run；触及 candidate、schema 或 benchmark code 时运行 `bun run validate`。 [写入范围：仅修复验证失败所必需的受影响源码]

## 3. 最小人工小试

- [ ] 3.1 在所有门禁通过后执行 baseline、Oracle Practice、无关 Practice 各两次；不执行 `lorelum-retrieval`、不复用工作区、不创建正式 Pi record。 [写入范围：受保护外部 artifacts；不提交 run workspace、日志、trace 或 diff]
- [ ] 3.2 每次尝试后独立运行公开浏览器语义检查和私有 AST 分层探针，保存输出、diff、环境、成本、时延、重试与有效性状态；任一私有泄露、输入不一致或 artifact 核验失败均判无效并停止。 [写入范围：受保护外部 artifacts]
- [ ] 3.3 对随机化、脱敏后的允许材料完成隐藏 condition 的相关性/利用率盲评；将匿名映射保存在批准的受限位置。 [写入范围：受保护外部 artifacts 与受限映射位置]

## 4. 证据与决策

- [ ] 4.1 在 `private/evidence-index/` 仅登记 execution snapshot、condition、不可变 artifact URI/SHA-256、有效性状态和盲评映射的受限位置；不提交 prompt、trace、日志、diff、oracle 或 Practice 正文。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/evidence-index/`]
- [ ] 4.2 按“语义与分层探针均通过”的原始次数报告结果：仅当 Oracle 严格高于 baseline 与无关 Practice 时提出后续 change 建议；否则报告诊断性或不确定。 [写入范围：Issue #75、经批准的私有证据索引]
- [ ] 4.3 向负责人回报小试的原始观察、无效尝试和残余风险，由负责人决定修订 candidate、扩大实验或停止；不将本小试表述为正式 benchmark 结论。 [写入范围：Issue #75]
