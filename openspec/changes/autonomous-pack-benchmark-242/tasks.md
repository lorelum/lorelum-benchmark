# Tasks

## 1. 契约与候选

- [ ] 1.1 在 `schemas/` 定义版本化实验计划、Pack 身份、运行观测与结果契约，固定输入和失败语义。
- [ ] 1.2 在 `treatments/` 与 `environments/` 定义可复现 Pack 安装和空 Store 对照，首个对象为本地 `agentic-coding` 实际工作树快照；固定完整内容 hash、Lore、索引 profile、Agent 及环境身份。
- [x] 1.3 在 `incubator/` 构建多文件真实代码演进候选及 public starter，私有 oracle、校准和质量 rubric 不可进入 Agent 输入；记录生命周期和 snapshot 身份。

## 2. Evaluator 与 runner

- [ ] 2.1 在 `src/benchmark/` 增加版本化私有语义检查与质量证据路径，校准多个合理实现及缺陷解，不改变历史 evaluator。
- [ ] 2.2 增加独立的配对执行、Store 隔离、Pack 安装及索引校验，固定非 treatment 输入，不代替 Agent query/get 或注入 Practice。
- [ ] 2.3 增加自主查询、读取、空结果、失败、未调用及 trace 不完整的审计，并分开输出健康、功能、质量、成本与过程指标。
- [ ] 2.4 定义版本化实验计划、均衡重复、artifact hash 和结果汇总，严格区分 pilot 与正式记录。
- [ ] 2.5 强制用户确认的输入加输出严格总 token 上限，未能验证事前上界时拒绝模型请求，不将仅输出限额宣称为总预算。

## 3. 验证与使用文档

- [ ] 3.1 测试配对一致性、store 和 public/private 隔离、身份不匹配、检索状态、校准和失败分母；运行 `bun run validate` 及相关 contract tests。
- [ ] 3.2 在无外部模型的实际执行路径中 smoke 两组与失败路径；真实模型 smoke 需先完成门禁并取得明确授权，不将模拟 trace 作为自主检索证据。
- [ ] 3.3 增加 bench 使用文档并更新 `docs/README.md`，覆盖安装固定 Pack、环境、任务设计、实际命令、评测解读和复现。

## 4. 结果与生命周期

- [ ] 4.1 审计 public/private 泄露和不可变身份；仅在满足生命周期与授权时创建正式 record 或升级 revision，保留 pilot 和失败证据及限制。
