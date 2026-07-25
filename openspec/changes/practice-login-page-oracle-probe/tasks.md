## 0. OpenSpec 交付流程

- [x] 0.1 在 `AGENTS.md` 固定 OpenSpec 先行、初始 PR 仅含 OpenSpec artifacts、后续实现持续追加到同一分支与同一 PR 的规则。 [写入范围：`AGENTS.md`]

## 1. 候选契约与 fixture

- [ ] 1.1 选择可在本地评测的登录页 starter 和不可变源码提交；记录其公开行为为何不会泄露 `react.api.layered-design` 规则。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/candidate.yaml`]
- [ ] 1.2 创建候选的 `public/task.md` 和 `public/starter/`，仅描述可观察的登录行为；排除 Practice 文本、oracle 断言、evaluator 代码和旧轨道资产。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/public/`]
- [ ] 1.3 新增版本化的私有 `react.api.layered-design` Oracle Practice 卡、长度与模板匹配的无关对照，以及记录渲染长度和独立评审的元数据。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/practices/`]

## 2. 私有验收与候选验证

- [ ] 2.1 定义私有验收草案，包含确定性语义检查和不同于其的 Practice 遵循探针；记录预期 baseline 缺陷，但不得在公开材料中发布断言。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/evaluator/`、`incubator/practice-injection/login-page-layered-api-v1/private/oracle.yaml`]
- [ ] 2.2 在不调用模型的前提下，使用 reference 与 naive 实现校准私有验收草案；若检查无法区分功能行为与 Practice 遵循，则拒绝候选。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/calibration.md`]
- [ ] 2.3 审计题面、starter、提示和计划日志中的 Practice/oracle 泄露；使用 `bun run src/benchmark/snapshot.ts --write --incubator practice-injection login-page-layered-api-v1` 重新生成 `private/snapshot.json`。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/snapshot.json`]
- [ ] 2.4 运行 `bun run validate` 和 incubator 快照验证；仅在候选契约验证失败时修复相应源文件，然后再进入执行步骤。 [写入范围：除失败的候选验证所需修复外，不修改源码]

## 3. 四条件人工探针

- [ ] 3.1 创建私有条件清单，覆盖 `baseline`、`oracle-practice`、`lorelum-retrieval` 和 `irrelevant-practice`，固定候选快照、源码提交、模型/版本、提示哈希、工具策略、预算、工作区隔离和检索来源契约；在存在真实结果前将检索标为不可用。 [写入范围：`incubator/practice-injection/login-page-layered-api-v1/private/conditions.yaml`]
- [ ] 3.2 在相同的固定输入下准备独立干净工作区，并执行 baseline、Oracle 和无关对照尝试；本变更中不得执行 Pi、调用正式基础设施或创建正式 record。 [写入范围：仅限被忽略的 `artifacts/`]
- [ ] 3.3 为每次尝试保留提示输入、diff、测试输出、语义结果、质量结果、成本、时延、重试和有效性/排除状态；语义与遵循结果保持分离。 [写入范围：仅限被忽略的 `artifacts/`]
- [ ] 3.4 进行随机化且隐藏条件的相关性/利用率盲评，并将评审者身份、量表版本和标签与条件映射分开保存。 [写入范围：仅限被忽略的 `artifacts/`]

## 4. 决策与后续边界

- [ ] 4.1 应用预注册的决策规则：仅当 Oracle 优于 baseline 且无关对照不存在等效改善时才推进；否则将结果报告为诊断性或不确定。 [写入范围：`results/records/` 之外的评审记录]
- [ ] 4.2 在扩展候选池、集成 Lorelum 检索、修改 treatment/schema/runner、晋升 suite 或创建正式 run record 前，创建独立 OpenSpec 变更。 [写入范围：仅限新的 `openspec/changes/<未来变更>/`]
