## Context

`src/benchmark/judge/judge-agent/generic/v1` 和 `v2` 已经证明可以用 LLM 生成 rubric、软打分并做校准，但每个实现都把证据投影、rubric、prompt、模型配置、汇总和 calibration 绑在一起。`async-report-replan/v1` 又把这条路径推进到任务专用 sidecar。它们都不能单独回答 #225 的问题：固定同一个本地 Judge core 后，换一种场景只需要新增场景适配材料，是否仍能得到可靠判断。

本 change 是一次预先声明边界的原型验证，不是新平台。它不接管 P1 runner，不改变语义硬门槛，也不把本地模型写入普通 CI。

## Goals / Non-Goals

**Goals:**

- 用一个不超过 3B 的本地模型 artifact，证明同一 core、同类 prompt 主体、同一输出协议和同一汇总规则可以跨证据形态复用。
- 在加入预先声明的 holdout 场景时，只新增 scenario profile、evidence adapter、固定 rubric 和 calibration labels；core 与 prompt 主体 zero-diff。
- 让本地模型只做窄判断，证据投影、schema、hash、汇总、abstain 和报告由确定性代码负责。
- 为每次判断保留可复核的 provenance，并保留原始指标、失败样例和不确定性，不用隐藏加权总分。
- 明确第一版只读固定 rubric，并明确未来接入 #209、公共 provider 或 runner 前必须另立 change。

**Non-Goals:**

- 不实现全领域自动 rubric、自动跨任务迁移、复杂权重学习、多模型路由或远端模型默认路径。
- 不修改 `judge-agent/generic/v1/v2`、`async-report-replan/v1`、`practice-layered-api/v2`、`skill-trigger-source-authority/v1/v2`、P1/Pi runner 或任何既有 task revision。
- 不新增或修改公共 schema、`JudgeProvider`、provider registry、`judge-result/v1`、suite/candidate 或正式 record。
- 不让本地 Judge 成为语义 oracle、唯一 acceptance oracle 或硬门槛；也不在普通 CI 下载、加载或调用模型。
- 不把一次 holdout 通过外推为所有领域的评分能力。

## Decisions

### 1. 独立原型，不复用 `generic/vN` 名称

实现放在新的 `src/benchmark/judge/offline-core/v1/` 原型路径中，并由显式 CLI 驱动。选择独立路径而不是 `generic/v3`，是为了避免把“尚未证明的 core 泛化”伪装成现有通用 judge 的升级，也避免修改冻结实现。

场景材料放在版本化 scenario 目录中，私有 labels 只进入 calibration/report 路径，不进入模型 prompt。具体 fixture 路径在 Plan mode 根据可用材料固定。

### 2. Core 与 scenario 强隔离

Core 只认识归一化后的 `ScenarioEvidence`、`RubricCriterion`、`EvidenceItem` 和 `PairCase`，不认识任务名、目录名、源代码语言、Practice 名称或场景特有字段。Scenario adapter 负责把原始材料投影为这些类型，并负责 public/private 边界。

CLI 通过显式 scenario 目录加载 profile，不维护需要随场景增长的中央 registry。新增 holdout 时允许新增 scenario 目录、adapter、rubric 和 labels，不允许修改 core、系统 prompt、判断协议或汇总规则。

选择 adapter 外置而不是让 core 理解多类原始输入，原因是前者能直接验证“core 是否通用”；跨场景能力不等于让一个 core 文件不断累加分支。

### 3. 固定 rubric，只做建议而不自动改写

第一版只消费 scenario 提供的固定 rubric，来源可以是公开任务材料或受控私有 policy。Core 校验 rubric 结构、hash 和证据维度，但不生成、不重写 rubric，也不把 rubric 之外的语义硬门槛塞进软评分。

自动 rubric 生成和“场景理解后建议评分标准”留作未来独立 change；本 change 只有在固定 rubric 迁移边界被证明后，才有足够基线判断自动建议是否增加价值。

### 4. 本地模型只回答两类窄任务

对每个 criterion/evidence projection，模型只返回：

- 证据关系：`supports | contradicts | insufficient`；
- 成对偏好：`A | B | tie | insufficient`。

输出可以带诊断用 `confidence: low | medium | high`，但 confidence 不参与决策。Core 不请求自由文本分数，不接受开放式 rationale 作为结构化字段；如保留简短 explanation，只作为审计文本，不参与汇总。

选择 pairwise 而不是绝对分数作为主要校准信号，是因为“好 vs 坏能否稳定选对”比小模型给出稳定绝对值更接近可用判据。criterion verdict 用于解释冲突和证据不足，不合成隐藏权重总分。

### 5. 模型 artifact、runtime 和离线边界

首版只允许一个 `<=3B` 本地模型 artifact。模型文件不入库，只记录模型 id、artifact hash、量化、tokenizer、上下文预算、chat template、runtime 版本、启动参数、温度、seed 和可复现 locator。

模型调用只允许通过显式本地运行入口连接到已启动的 loopback runtime；命令本身不得下载权重、访问远端 API 或在 artifact 缺失时静默降级。具体 runtime 和模型在 Plan mode 固定；可评估 llama.cpp 兼容 GGUF 或其他单机离线方案，但必须同时满足 Windows CUDA、8GB 显存、可完整记录 identity 和无网络运行。

改变模型 artifact、量化、runtime、prompt、温度、seed、上下文预算、schema、阈值或汇总规则都会产生新的实验 identity，不能沿用旧结果宣传 holdout 通过。

### 6. 确定性代码负责 evidence、schema、汇总和 abstain

Core 在调用模型前必须完成：

- adapter 输出结构校验；
- public/private 路径与内容边界检查；
- evidence item 稳定 id 和 hash 计算；
- prompt 输入选择与 token 预算检查；
- rubric/evidence 维度匹配检查。

Core 在调用模型后必须完成：

- 输出 schema 校验；
- 未知 verdict、缺字段、未知 evidence id、非法 confidence 的 fail closed；
- evidence citation 校验；
- criterion verdict 与 pairwise verdict 的冲突检查；
- `insufficient`、模型不可用、投影失败、hash 不匹配时的 abstain/not-run。

模型输出不合法不得变成低分；证据不足不得变成确定反对。

### 7. 校准与通用性协议

开发场景：

- Gateway v3：源码和运行时关系证据、固定 rubric、命名变体与 anti-pattern；
- Source-authority：公开任务和受控私有 policy 形成 rubric，验证私有 rubric 只读适配。

预先声明的 holdout：

- Compaction 摘要：自然语言证据、保留/污染判断和 abstain。

在 holdout 运行前，Plan mode 必须固定 claim、样本、thresholds、聚合规则、模型/runtime identity 和报告解释。Holdout labels 在运行前冻结，不用于 prompt 调参。若 holdout 材料不足以形成可辩护 labels，标记 `holdout-not-ready`，不得临时换更简单的场景。

每个场景至少记录 pairwise accuracy、等价对稳定性、A/B 顺序交换一致性、abstain rate、evidence reference validity、schema validity 和 high-confidence errors。样本不足时结论为 `indeterminate`，不以阈值碰巧通过代替证据。

### 8. Provenance 与 report

每次 run 的 provenance 至少包含：

- core source hash；
- system prompt 和输出协议 hash；
- model artifact hash、量化、tokenizer、runtime、参数、seed；
- scenario profile、adapter、rubric、labels、evidence 和 input hash；
- 每个 decision 的 criterion、evidence ids、原始 verdict、解析后 verdict、confidence 和失败原因；
- 校准 threshold、运行命令和 run identity。

Generalization report 必须列出 dev 与 holdout 的原始结果、失败样例、abstain 样例、core/prompt zero-diff 证据、允许新增的 adapter diff 边界和未解决问题。报告只对已测试场景范围作结论。

### 9. 与固定任务 rubric 和现有 runner 的迁移边界

固定任务 rubric 通过只读 adapter 进入原型，不被重写；语义硬门槛仍由公开产品测试决定。原型结果不参与 P1/Pi runner 判定，也不写正式 record。

只有通用性结论成立后，才另开 change 评估是否进入 #209、公共 provider 或 schema。该 change 必须说明旧 `generic/v1/v2`、任务专用 sidecar 和已有 record 的解释如何保持稳定。

### 10. 决定分类

会改变本 change 评测语义、必须重新规划的决定：

- 改变 score 含义、verdict 集合、abstain 条件、汇总规则或 success thresholds；
- 改变 rubric 来源、允许 rubric 自动改写、将 criterion verdict 合成加权总分；
- 改变 dev/holdout 划分、holdout 标签、模型规模上限或 core/prompt zero-diff 规则；
- 将本地 Judge 接入语义硬门槛、P1/Pi runner、正式 record 或公共契约。

只是工程实现的决定：

- 文件路径、测试组织、CLI 参数、缓存和日志位置；
- 在已批准 runtime family 内选择具体 runner/library；
- 不改输入输出的 parser、hash helper、报告渲染和本地性能优化；
- 不改变 prompt 语义的代码拆分或命名。

模型 artifact 或 runtime 变化不是“纯工程”变化：只要可能改变判断结果，就必须形成新的实验 identity，并重新校准。

## Risks / Trade-offs

- [Holdout 被反复调参而失去独立性] → 运行前冻结 core、prompt、模型、thresholds 和 labels；运行后任何改动触发失败或新版本，不覆盖原报告。
- [少量样本让指标偶然过线] → 预声明最小样本和阈值；样本不足直接 `indeterminate`，不扩大场景后倒推结论。
- [3B 以下模型能力不足] → 这就是实验要回答的问题；失败保留为结果，不自动切远端或多模型路由。
- [adapter 承载了过多判断，导致 core 看起来通用] → adapter 只能做确定性投影、字段映射和边界检查；所有语义 verdict 必须来自同一 core 协议，adapter 不得内嵌场景专用标签或启发式打分。
- [私有 labels、路径或 Practice 文本进入模型] → adapter 只输出白名单证据；调用前 fail closed；测试覆盖路径、marker 和 hash 泄漏。
- [本地 runtime 结果不完全确定] → 固定温度、seed、上下文和解析规则；报告重复运行差异；不能收敛时降低 claim 或 abstain。
- [原型被误认为正式通用 judge] → CLI、report 和 artifact 名称都声明 prototype/diagnostic；不接入 provider registry、runner 或 record。

## Migration Plan

1. Plan mode 固定模型/runtime、场景材料、holdout labels、thresholds、路径和成功/失败解释，并回写 issue 与本 change 的 design/tasks。
2. 先实现确定性 types、projection、schema、abstain、provenance 与 mock tests，不调用真实模型。
3. 接入 Gateway v3 和 Source-authority 开发校准，记录原始指标。
4. 冻结 core、prompt、模型和协议，记录 hash；加入 Compaction holdout 的 adapter/profile/rubric/labels。
5. 显式运行本地 holdout，生成 raw results 与 generalization report；若失败则按预先声明结论关闭，不通过改 prompt 重跑。
6. 回读报告、审计私有边界并运行 `bun run validate`；未通过任何门禁时保留原型为 diagnostic，不进入公共契约。

## Open Questions

- 具体 `<=3B` 模型、量化文件、license、artifact hash 和本地 runtime 在 Plan mode 固定。
- Compaction holdout 的最小 fixture、公开/私有材料、labels 和最小样本量在 Plan mode 确认；材料不足则标记 `holdout-not-ready`。
- 各场景的 pairwise accuracy、等价稳定性、顺序一致性、abstain 和 high-confidence error thresholds 在查看 holdout 前固定。
- 原型场景材料最终放在独立源码目录还是 `incubator/calibration-bases/`，以及 raw report 的提交位置，在 Plan mode 按现有布局和泄露审计要求确定。
