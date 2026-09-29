# Lorelum Benchmark Agent Rules

本文件是 Lorelum Benchmark 仓库的根级 Agent 执行规范。它适用于所有目录、所有任务和所有自动化 agent，除非当前 Issue、OpenSpec change 或用户明确给出更窄且不冲突的范围。

本文件不复制 benchmark 协议、runner 契约或领域指南。需要执行具体工作流时，先按适用范围读取对应 canonical source。

## 1. 权威来源与冲突处理

发生冲突时，按以下优先级判断，不得自行挑选更容易执行的一份：

1. 用户当前明确目标；
2. 当前 Issue 与正在实施的 OpenSpec change；
3. 适用的 `openspec/specs/` stable capability 与 `schemas/` 机器契约；
4. 本文件 `AGENTS.md`；
5. 对应领域的维护指南；
6. `README.md`、示例、研究报告和历史材料。

补充规则：

- 任务或研究证据只解释特定对象和样本，不会自动升级为全仓库规则。
- 未跟踪文件、`.agents/`、`.codex/`、本地草稿和 agent skill 不属于已提交的仓库规范。
- 如果两个权威来源仍互相矛盾，停止静默实现，先指出冲突并请求修正权威来源。
- `docs/README.md` 是维护文档导航，不是第二套 benchmark 规范。

## 2. 仓库职责与目录所有权

本仓库提供可复现的 Agent 编程评测 contract、任务 fixture、runner、evaluator、运行记录和发布链路。它不实现 JudgeAgent 本身，也不把某个候选、模型或一次实验结果当作通用规则。

| 位置 | 所有权 |
| --- | --- |
| `protocol/` | 实验设计、对比、发布和共享结果表达的领域材料 |
| `schemas/` | 跨任务和跨进程的机器可读契约 |
| `openspec/specs/` | 已经评审、在声明范围内稳定适用的 capability |
| `openspec/changes/` | 当前 change 的设计、任务和验收，不作为新的全局默认规则 |
| `src/benchmark/` | validation、snapshot、runner、adapter、evaluator、judge、result interpreter |
| `cases/` | 尚未升级为 suite revision 的可复用任务素材 |
| `incubator/` | 已提交但尚未冻结的候选任务和诊断材料 |
| `suites/<suite>/` | 正式任务 revision、suite manifest、私有 evaluator 和 snapshot |
| `treatments/` | 版本化实验条件和 condition-scoped 交付契约 |
| `environments/` | 版本化 runtime、网络、权限和依赖固定信息 |
| `results/records/` | 不可变的正式运行元数据 |
| `releases/` | 已批准的发布 manifest、摘要和报告 |
| `artifacts/`、`scratch/`、`.run-workspaces/` | 被忽略的运行产品或一次性探针，不提交 |

目录归属不明确时，先找 canonical source 和现有 consumer。不要为了“方便”把任务、evaluator、runner 或结果写入其他目录。

## 3. 必须始终满足的仓库不变量

### 3.1 任务 revision 不可变

- 正式任务路径为：

```text
suites/<suite>/tasks/<task-slug>/v<version>/
```

- 一旦 revision 有运行记录，题面、starter、evaluator、oracle、snapshot、environment 或固定 evaluator version 都不得原地修改。
- 正确性变化必须创建新的 `vN`，并在 suite manifest 中登记。
- 退休版本从默认活动集合移除，但源码、snapshot 和记录必须保留；不得创建第二份可变归档。

### 3.2 public 与 private 严格隔离

- Agent 可见的题面、starter 和公开材料放在 `public/`。
- evaluator、oracle、scoring、private calibration、private rule mapping 和审查材料只能放在 `private/` 或适用的私有 channel。
- `private/` 内容不得复制到 Agent workspace、模型输入、公开题面或公开测试。
- treatment 只能按已声明的 condition-scoped contract 交付。
- 发现任何 public/private 泄露，停止扩大运行范围，先修复并审计影响。

### 3.3 语义硬门槛与质量软信号分开

- 任务完成只由题面声明的功能行为决定。
- `evaluator-result/v2` 的 semantic 结果是唯一任务完成信号。
- JudgeAgent、Practice probe 和质量信号只报告，不得翻转 semantic pass/fail。
- `joint_pass` 只是 `semantic=pass` 且 quality 已观察时的派生字段，不是任务完成、健康状态或加权总分。
- 不得引入隐藏权重，把所有语义和质量信号压成一个分数。
- `judge-unavailable`、`not-observed` 和 `not-run` 必须保持区分，不能静默归入失败或成功。

### 3.4 运行记录与模型调用有门禁

- 未经授权的本地测试、诊断或 smoke 不得创建正式 record，也不得升级 suite revision。
- OpenSpec strict validation、public/private 泄露审计和生命周期门禁未通过前，不得执行正式模型运行或创建正式 record。
- 正式 record 必须引用不可变 run manifest、源码 commit、任务版本、snapshot、environment、treatment 和 artifact 校验和。
- 实验配对 seed 不是模型采样参数；只有 adapter 实际传递且 provider 支持时，才可写入模型参数。

### 3.5 evaluator helper 版本化

- 共享 evaluator helper 在 `src/benchmark/` 下按版本维护。
- 修改已被任务引用的 helper 行为时，创建新版本目录，不重写旧版本。
- 每个任务固定自己的 evaluator version。

## 4. 变更分类与前置门禁

### 4.1 直接 PR 例外

以下工作可以直接在独立分支提交 PR：

- 不改变评测语义、任务身份、snapshot 身份、record 或结论解释的 runner、validation、流程或文档修复；
- 按既有已批准决定消除 stable spec 的文字冲突，且不改变适用范围或允许行为；
- 当前用户明确授权且不产生正式 record 的本地测试或诊断。

直接 PR 的正文必须说明：

- 根因；
- 修复边界；
- 实际验证命令和结果；
- 为什么没有改变 benchmark contract。

### 4.2 Benchmark contract change

以下内容的新增或修改属于 contract change：

- suite；
- 任务 revision；
- schema；
- evaluator；
- runner；
- treatment；
- environment；
- 实验协议；
- record；
- stable OpenSpec capability。

Contract change 必须：

1. 先确认关联的单一 GitHub Issue；
2. 创建 `openspec/changes/<change-name>/` 并通过 strict validation；
3. 从最新 `main` 创建 `codex/<change-name>`；
4. 初始 PR 先放 OpenSpec artifacts 和必要流程约束，不包含 fixture、runner、模型调用或 record；
5. 在实现前按 `docs/CHANGE_WORKFLOW.md` 进入 Plan mode 或等效规划阶段，向需求方说明范围、效果、验证和非目标；
6. 获得确认后，在同一分支和 PR 继续实现、验证和勾选任务；
7. 合并前完成 `docs/PR_REVIEW.md` 规定的两轮独立只读 review。

不得为同一 change 另开实现 PR，不得迁移到另一分支，也不得把未完成 change 直接归档。

### 4.3 正式运行

正式运行不是普通验证。发起前必须读取适用的 runner、sandbox、environment 和 smoke 指南，并确认：

- 任务已经冻结为正式 revision；
- snapshot、environment、treatment 和 source commit 一致；
- runner 和 evaluator 版本固定；
- public/private 隔离已审计；
- 所需 runner label、artifact storage、网络 allowlist 和凭据边界已就绪；
- 当前操作已有明确授权。

## 5. Agent 工作方式

### 5.1 开始前

1. 读取当前 `git status`，识别未提交和未跟踪文件，不覆盖或顺手纳入用户工作。
2. 确定本次变更属于直接修复、contract change、本地诊断、review 还是正式运行。
3. 读取对应的 canonical source。Contract change 读取 `docs/CHANGE_WORKFLOW.md`；PR review 读取 `docs/PR_REVIEW.md`；领域工作再读取对应指南。
4. 明确任务范围、非目标、依赖和验收方式。信息不足且会改变方案时暂停询问，不自行补设定。
5. 不因某个历史文件、示例或一次实验而扩大为全仓库规则。

### 5.2 实施中

- 保持单一声明范围，发现无关改动时立即拆分。
- 按 `tasks.md` 的依赖顺序工作，完成一项就更新状态。
- 优先复用 canonical contract 和已有 helper，不复制一套并行语义。
- 不修改冻结 revision，不绕过 snapshot，不把生成产物提交到 Git。
- 用户纠正时，修正当前理解和交付；单次纠正不自动新增全局规则。
- 不反复追问已经澄清的点，不把未确认的推断写成仓库规则。

### 5.3 结束前

- 运行适用验证，不使用“应该可以”代替证据。
- 检查 `git diff` 只包含本 PR 范围。
- 检查 public/private 边界、snapshot、版本和 record 状态。
- 更新 Issue、OpenSpec tasks 和 PR 正文。
- 回读 GitHub 实际保存的标题、正文和评论，确认 Markdown 没有被压平。

## 6. 验证矩阵

根验证入口：

```sh
bun install --frozen-lockfile
bun run check:runtime
bun run validate
bun run test:contracts:core
```

OpenSpec 或流程治理变更追加：

```sh
bun run validate:openspec
bun run test:openspec-purpose
```

Pull request 场景还要按基线 SHA 运行 purpose check：

```sh
bun run check:openspec-purpose -- <base-sha>
```

以下检查按改动范围运行：

```sh
bun run test:contracts:runner
bun run test:realistic-repo
bun run test:local-sandbox
bun run test:sandbox
```

验证要求：

- 记录逐字命令、实际结果和未执行原因。
- 本地通过不能代替 CI；CI 的 change classifier 决定需要运行的 heavy jobs。
- 不把跳过、空检查、吞异常或只打印成功文字当作验证。
- 正式模型调用不得进入普通 CI。

## 7. Issue、分支、PR 与协作

- 面向协作者的 Issue、PR 标题、正文、review 和重要状态评论默认使用中文。
- Issue 只收敛单一问题，说明边界、依赖、验收和已知非目标。
- 分支使用 `codex/<change-name>`，从最新 `main` 创建。
- 一个 PR 只声明一个范围，正文说明改了什么、为什么、怎样验证、延期了什么。
- PR 必须披露 AI assistance，并记录独立 review 或 self-check 的区别。
- Contract PR 只做只读 review，不在 review 过程中顺带修改实现。
- 修复 review finding 时创建新的 commit，不重写已经发布的提交历史。
- 不把用户未跟踪文件、临时研究稿或本地 skill 混入 PR。

## 8. Review 要求

触及 benchmark contract 的 PR 必须执行两轮独立 review：

1. `ai-code-review`：评测有效性、可复现性、public/private 隔离、生命周期、门禁与流程合规。
2. `thermo-nuclear-code-quality-review`：第一轮 must-fix 修复后的最新 diff，检查 abstraction、结构质量、dead logic、canonical 复用和文件体量。

独立性要求：

- reviewer context 必须与实现 context 隔离；
- 不得 fork 实现线程；
- 不得把实现过程、失败尝试或作者自评作为审查前提；
- 以固定 commit SHA 为审查对象；
- 目标 SHA 变化后必须在新 reviewer context 重新审查；
- 每轮 review 都是只读。

## 9. 规则维护

普通用户纠正只修正当前任务。只有以下任一条件满足时，才启动规则沉淀评估：

1. 同一错误模式在两个有可核验证据的独立任务或对话中复现；
2. 一次高风险事件暴露规范缺失、冲突或入口不可发现；
3. 用户明确要求把经验提升为可复用规则。

触发评估不等于新增规则：

- 先检查现有规则、stable spec、指南和当前 change；
- 优先合并、替换、收窄或删除，不为提高服从率堆叠同义条款；
- 当前任务决定留在 Issue/OpenSpec；
- benchmark 契约进入 stable spec/schema；
- 领域方法进入对应指南；
- 只有跨任务、高频或高后果的 agent 工作方式进入根 `AGENTS.md`。

详细路由和回归要求见 `docs/AGENT_GUIDANCE_MAINTENANCE.md`。

## 10. 快速检查清单

开始修改前：

- [ ] 已确认工作树状态，未触碰用户未跟踪文件；
- [ ] 已确认变更类别和权威来源；
- [ ] Contract change 已有 Issue、OpenSpec 和规划授权；
- [ ] 已读取适用范围对应的维护指南。

提交 PR 前：

- [ ] diff 只包含声明范围；
- [ ] 冻结 revision、snapshot 和 record 未被破坏；
- [ ] public/private 隔离仍成立；
- [ ] 验证命令和结果已记录；
- [ ] OpenSpec tasks 和 PR 正文已更新并回读。

发起正式运行前：

- [ ] 已有明确授权；
- [ ] task、snapshot、environment、treatment 和 runner 版本一致；
- [ ] 凭据、网络和 artifact 边界符合正式环境契约；
- [ ] 当前结果不会被误写成正式 record 或 benchmark 结论。
