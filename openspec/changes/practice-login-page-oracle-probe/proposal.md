## 背景

Lorelum 需要先验证“给出正确的团队 Practice 是否改善同一编码任务的结果”，再判断真实检索是否足够好。当前仓库只有 Vercel React Skill 的 G0/G1 轨道，尚没有一个不泄露验收细节、可复现的 Practice 注入候选小试来隔离这一假设。

关联 issue：#74。

## 变更内容

- 在 `incubator/` 中定义一个登录页候选任务的可提交 fixture：仅包含 Agent 可见题面和 starter，以及与其隔离的私有验收草案；Practice 卡只能作为声明条件的私有运行时输入。
- 定义版本化的 `react.api.layered-design` Oracle Practice 卡、等长且呈现形式匹配的无关 Practice 对照卡，以及预留给真实检索输出的声明性接口。
- 预注册四个比较条件：无 Practice baseline、Oracle 相关 Practice、真实检索 Practice、无关 Practice；为首轮人工小试明确固定输入、有效运行、原始证据、私有注入与排除规则。
- 在仓库 `AGENTS.md` 固定 issue 先行、OpenSpec 先行、初始 PR 仅含 OpenSpec、未完成 change 不得合并初始 PR、后续实现持续追加至同一分支与同一 PR 的工作流；#73 的 issue 时序作为一次明确的引导例外，不得复用。
- 固定严格验证后的规划澄清门：先与需求方确认任务行为、区分度、Practice/对照、私有验收和运行边界，再创建候选 fixture。
- 明确本次初始 PR 不运行模型、不创建正式 suite revision 或结果 record，也不改变现有 G0/G1 treatment、Pi runner 或 schema。

## 能力范围

### 新增能力

- `login-practice-probe-fixture`: 登录页候选任务、Practice 卡和私有验收草案的版本化文件与公开/私有隔离契约。
- `practice-probe-comparison-protocol`: 四条件人工 Oracle 小试的固定变量、证据采集、有效性和排除规则。
- `openspec-pr-continuity`: OpenSpec change 从规范到实现持续使用同一分支与同一 PR 的证据链契约。

### 修改能力

- 无。

## 影响范围

- 在 `AGENTS.md` 固定变更交付流程；后续在 `incubator/` 下新增候选材料，不修改活跃 suite、任务版本、共享 evaluator、treatment、environment、schema 或 runner。
- 在 `openspec/` 下仅新增可评审的 OpenSpec 流程规范，在实现或模型执行前先固定契约。
