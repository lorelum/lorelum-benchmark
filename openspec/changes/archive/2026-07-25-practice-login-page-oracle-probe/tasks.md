## 0. OpenSpec 交付流程

- [x] 0.1 创建 issue #74，并在 `AGENTS.md` 固定 issue 先行、OpenSpec 先行、初始 PR 仅含 OpenSpec artifacts、后续实现持续追加到同一分支与同一 PR 的规则。#73 发生在该规则落库前，其 issue 时序作为一次明确的引导例外，不得作为后续 change 的先例。 [写入范围：`AGENTS.md`]
- [x] 0.2 修订流程与 OpenSpec，使未完成 change 不得关闭或合并初始 PR；明确 Practice 的条件私有注入、evaluator/oracle 的模型输入禁令和证据索引要求。 [写入范围：`AGENTS.md`、`openspec/changes/practice-login-page-oracle-probe/`]
- [x] 0.3 在 `AGENTS.md` 固定严格验证后的规划澄清门：关键实验问题未确认时暂停实现。 [写入范围：`AGENTS.md`]
- [x] 0.4 向需求方完成登录页实验的规划澄清，将答案写回 issue #74 与本 change 的 design/tasks，再开始候选 fixture 实现。已确认 Vite 依赖、公开三状态登录契约、300 毫秒延迟、固定 feature API、AST 探针、对照卡、盲评与推进门槛。 [写入范围：issue #74、`openspec/changes/practice-login-page-oracle-probe/`]

## 1. 候选契约与 fixture

- [x] 1.1 选择可在本地评测的登录页 starter 和不可变源码提交；记录其公开行为为何不会泄露 `react.api.layered-design` 规则。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/candidate.yaml`]
- [x] 1.2 创建候选的 `public/task.md` 和 `public/starter/`，仅描述可观察的登录行为；排除 Practice 文本、oracle 断言、evaluator 代码和旧轨道资产。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/public/`]
- [x] 1.3 新增版本化的私有 `react.api.layered-design` Oracle Practice 卡、长度与模板匹配的无关对照，以及记录渲染长度和独立评审的元数据。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/practices/`]

## 2. 私有验收与候选验证

- [x] 2.1 定义私有验收草案，包含确定性语义检查和不同于其的 Practice 遵循探针；记录预期 baseline 缺陷，但不得在公开材料中发布断言。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/evaluator/`、`incubator/practice-injection/login-page-layered-api-v1/private/oracle.yaml`]
- [x] 2.2 在不调用模型的前提下，使用 reference 与 naive 实现校准私有验收草案；若检查无法区分功能行为与 Practice 遵循，则拒绝候选。naive 探针失败，reference 探针通过；Chromium 浏览器语义测试通过。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/calibration.md`]
- [x] 2.3 审计公开题面、starter、公开提示和公开日志中的 Practice/oracle 泄露；验证 Practice 仅经 condition-scoped 私有运行时通道输入，evaluator/oracle 不进入模型输入。扩展 incubator 快照行为以排除 `private/evidence-index/` 和候选生成目录的 post-run metadata，然后使用 `bun run src/benchmark/snapshot.ts --write --incubator practice-injection login-page-layered-api-v1` 生成 `private/snapshot.json`。 [写入范围：`src/benchmark/snapshot.ts`、`incubator/practice-injection/login-page-layered-api-v1/private/snapshot.json`]
- [x] 2.4 运行 `bun run validate` 和 incubator 快照验证；已运行 `bun test src/benchmark/snapshot.test.ts`、`bun run validate` 与 strict OpenSpec 校验。仅在候选契约验证失败时修复相应源文件，然后再进入执行步骤。 [写入范围：除失败的候选验证所需修复外，不修改源码]

## 3. 后续执行交接

- [x] 3.1 创建私有条件清单，覆盖 `baseline`、`oracle-practice`、`lorelum-retrieval` 和 `irrelevant-practice`，固定候选快照、源码提交、模型/版本、提示 hash、工具策略、预算、工作区隔离、Practice 卡版本/hash、私有注入通道和检索来源契约；在存在真实结果前将检索标为不可用。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/conditions.yaml`]
- [x] 3.2 创建并关联 Issue #75，将 baseline、Oracle、无关对照的人工执行、受保护 artifact、盲评与决策规则移交其独立 OpenSpec 和 PR；#73 合并后必须从最新 `main` 开始该流程。 [写入范围：Issue #75、`openspec/changes/<后续执行 change>/`]
