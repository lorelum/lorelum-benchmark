## 背景

Issue #74、任务与调研文档定义了一个面向登录页编码任务的首个人工 Oracle 试验。仓库当前只支持
`performance-skill-comparison` 的 G0/G1 轨道。提交 `b6b0310` 有意移除了此前的
Practice 有效性轨道及其 treatments、schemas、runner、fixtures 和 records。因此，本
变更必须建立独立的候选契约，不能恢复或重新解释已经移除的工作。

`incubator/` 是候选在成为 suite 任务前的仓库存放位置。`src/benchmark/snapshot.ts`
可以为 incubator 候选生成快照，但 `bun run validate` 不会强制候选卡的 schema。本变更
中的候选格式必须足以支持评审，同时保持在活跃 suite 和 Pi 请求路径之外。

## 目标与非目标

**目标：**

 - 在 `incubator/` 下定义一个具有清晰公开/私有边界和快照、可供评审的登录页候选。
 - 定义版本化且与任务相关的 `react.api.layered-design` Oracle Practice，以及长度和格式
   匹配的无关对照，二者均不得通过题面或 starter 暴露。
 - 预注册四个具名比较条件，以及判断 Oracle 效果是否有别于额外上下文所需的人工证据。
 - 保留语义、Practice 遵循、相关性/利用率、成本和时延的原始观测值，不使用加权总分。

**非目标：**

- 不重新引入已移除的 Practice 有效性 suite、此前的 fixtures、schemas、treatments、
  runner、protocol 或结果。
- 不调用模型、不运行 Pi、不从 Lorelum 检索、不创建正式 run record，也不宣称产品有效。
- 不修改活跃的 Vercel Skill 比较契约。

## 设计决策

### 1. 将完整候选置于 `incubator/practice-injection/` 下

实现会使用一个候选目录，例如
`incubator/practice-injection/login-page-layered-api-v1/` with `public/` and
`private/` 子树。公开子树仅包含 `task.md` 和 `starter/`；私有材料包含候选卡、Oracle
Practice、无关 Practice、evaluator 草案、相关性量表、条件清单和快照。该设计遵循工作区
可见性边界，防止 Practice 文本或 oracle 断言进入 Agent 工作区。

放入 `suites/` 的替代方案会让候选看起来已经活跃，并要求现有 suite manifest。根目录的
`practices/` 会在首个候选尚未证明需要前建立共享内容 API。两者均推迟处理。

### 2. 将首轮运行作为自动化之前的人工探针

候选会声明四个条件，但本步骤的交付序列只包含人工 baseline、Oracle 与无关对照运行。
`lorelum-retrieval` 条件保持已声明状态，并标记为 `status: unavailable` 和显式的必需输入
契约；不得以 Oracle 结果悄然替代它。这样先隔离 Practice 的价值，避免与检索质量混淆。

立即扩展 runner/schema 会把候选设计扩大为已移除轨道的重新实现。此举推迟到 Oracle 探针
通过决策门之后。

### 3. 将比较条件设为唯一的预期输入变量

条件清单将固定任务快照、源码提交、模型与模型版本、系统提示哈希、工具策略、时间/token
预算和干净工作区策略。Oracle 和无关 Practice 卡具有可比的渲染长度及相同的交付模板。
baseline 不接收 Practice。每次尝试都必须创建独立工作区，并保留提示输入、代码 diff、
测试输出、结构化观测、成本、时延和重试次数。

这排除了更长或不同格式的指令改善结果这一替代解释。拒绝使用单一合成分数：功能成功不得
掩盖 Practice 遵循失败。

### 4. 采用独立评测层并对定性评审盲化

私有 evaluator 草案将分别规定确定性的语义检查和 Practice 专属质量探针。独立评审者将对
随机化且隐藏组别的产物，盲标注注入内容相关性和生成代码的利用率。LLM 评判可辅助后续
分析，但不能作为唯一的验收 oracle。

任务提示仅陈述可外部观察的登录行为。它不得命名 `react.api.layered-design`、要求组件/API
分层，或暴露私有断言。在提示中写明该约束会让 baseline 接收到实验 treatment，因而使因果
对比失效。

### 5. 以同一 OpenSpec PR 保持变更证据链

每个 benchmark change 先由可追溯 issue 收敛单一问题、边界和验收口径，再创建一个仅含
OpenSpec artifacts 和必要流程约束的 PR。候选 fixture、
私有验收、验证和后续实现必须继续追加至该同一分支和同一 PR，而不是拆分到新的实现 PR。
这样评审者可以从 proposal、设计、规范和任务清单连续追溯至实现与验证证据。

未建立 issue 就创建 OpenSpec，会失去需求来源和验收依据；在首次 PR 合并前创建独立的实现 PR，
会打断设计与实现之间的证据链；在不改变 change 的前提下
切换分支，则可能遗漏已经评审的约束。两种做法均不采用。

## 风险与取舍

- [候选任务过易或过难，无法区分条件] -> 在人工/模型比较前进行确定性的私有校准；若
  baseline 与 Oracle 无法形成有意义的对比，则拒绝该候选。
- [对照在内容形状或长度上不同] -> 在条件清单中记录渲染字符数和标题；评审必须拒绝不匹配。
- [Practice 或 evaluator 细节泄露给 Agent] -> 限制暂存工作区仅含 `public/task.md` 和
  `public/starter/`，并在接受运行前审计提示、starter、trace 和日志。
- [人工执行的可复现性不足] -> 要求不可变哈希、版本化资产、记录的命令和原始产物；自动化
  是后续变更，并非本探针的既有属性。
- [意外复用旧移除轨道资产] -> 以当前 HEAD 为唯一真源；不得将历史私有 fixtures 或旧
  protocol 契约复制进候选。
- [实现被分散到多个 PR，评审难以追溯] -> 在 `AGENTS.md` 强制同一 change 使用同一分支和
  同一 PR，所有后续提交持续追加。
- [OpenSpec 缺少可追溯的问题来源] -> 在 `AGENTS.md` 强制先确认或创建 issue，并在 proposal
  和 PR 正文中记录 issue 编号。

## 推进与回退

1. 新增并快照 incubator 候选，随后进行泄露评审。
2. 不运行模型，校准私有语义检查和质量探针。
3. 仅在干净工作区中执行已声明的人工条件，并将产物存于受跟踪源码之外，直至正式 record
   变更获批。
4. 应用预注册的决策规则。只有 Oracle 相对于 baseline/对照呈现正向结果，才可推动一个
   独立 proposal，用于候选池、检索 adapter、treatment schema 或 Pi 自动化。
5. 放弃是正常结果：在后续变更中删除未记录的候选。候选晋升为冻结 suite revision 后，
   绝不重写。

## 待决问题

- 哪个具体登录页 starter 仓库及不可变源码提交，能提供可在本地评测公开行为的任务？
- 哪一张经过独立评审的无关 Practice，可以匹配最终 Oracle 卡的结构和渲染长度，且不共享
  同一行为？
- 谁将执行相关性/利用率盲评，人工探针期间脱敏产物将存放在哪里？
