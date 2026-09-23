# Design

## Context

参见 `proposal.md` 与本 change 的 `retrieval-ranking-evaluation` spec。本 change 关联 benchmark Issue #222，并为主仓库 Lorelum #236 提供检索证据；它不实现 Engine 排序。

当前 `schemas/suite.schema.json`、`schemas/run-manifest.schema.json` 和 `schemas/run-record.schema.json` 把 suite / task / agent / treatment 等编码任务字段设为必需项，run record 的 track 也固定为 `performance-skill-comparison`。retrieval batch 没有对应的真实 Agent/task 语义，因此新增 track-specific 契约，而不是虚构旧字段或改变旧 track。

上游依赖是主仓库 #236 的 N/K 分离和本地 benchmark harness。harness 必须在一次 Engine semantic retrieval 和同一 Store snapshot 中收集有效候选 IDs 与有序最终 IDs；本仓库只调用该 harness，并验证其结构化状态与名单，不读取普通 CLI 调试输出、不 import Engine 私有源码。

首版拟固定的 Pack 源码来自 `lorelum/lorelum-packs`：

| Pack | 来源提交 |
| --- | --- |
| `agentic-coding` | `954324cda7961ae899578649847aa32e1aa90a6f` |
| `issue-pr-etiquette` | `45484847e02ea11e8438c7f3c17d7b2eee5b4dfc` |
| `pack-creator` | `f144a5a5e69636a5a6cd97a8b519018d2941bac6` |
| `react-web-craft` | `293e6b1327b0d9b4c01a711748db14c610908655` |

Pack 仓库目录快照提交为 `3a48b6a026554ce7f30caf1e7d52130e5eb01db3`。这些 immutable commits 已通过 GitHub commit lookup 核实存在。正式 baseline 前仍须由 corpus builder 验证完整 ID inventory 和文件 digest；Pack README 状态描述或机器当前 Installed Pack Catalog 不覆盖这些锁定来源。

## Goals / Non-Goals

**Goals:**

- 用单独的 retrieval-ranking revision、schemas、validator、runner、deterministic scorer 和 batch record 完成一条完整评测链。
- 以完整固定 Pack corpus 为检索空间；query 数据和金标分开，runner 只将 query 与运行配置交给 harness。
- 分开呈现候选是否召回 core、core 是否进入 final top 5、core 与标注 scope-confuser 的相对顺序。
- 在主仓库排序变化前，使用全量首版案例跑出可复现 baseline。

**Non-Goals:**

- 修改 Lorelum Engine、用户 `lore query`、公开 package exports 或产品 API。
- 扩展 React Skill / Practice-injection Agent 任务轨道，或评价 Agent 如何使用检索结果。
- 将全部 Practice 对每条 query 穷举标注、维护秘密 holdout、每次人工或 LLM 判分、要求 top 5 零噪声，或产生一个掩盖逐例差异的加权总分。
- 把延迟或内存诊断信号解释为整体生产检索质量。

## Decisions

### 1. 新增独立 retrieval-ranking capability 和 track-specific schemas

使用 `suites/retrieval-ranking/` 下的 track revision，以及新的 suite、batch manifest 和 batch record schema；在 validator 中按 track 分派。不要修改旧 Agent schema 的必需字段，不要将一条 query 伪装成 task，也不创建 `agent`、`treatment`、`semantic` 或 `quality` 占位值。

替代方案：把 retrieval case 放进现有 React / Practice-injection suite。拒绝原因是那些轨道改变或观察 Agent 的行为，不能表示 Engine 在同一检索中的 candidate/final IDs，也会误导记录消费者。

### 2. 固定来源而不复制 Pack 内容

revision 保存 pack repo commit、四个 pack source commits、完整 Practice ID inventory 和内容 digest。Runner 在 benchmark 专用临时 Lorelum Store 中从固定 Pack 来源重建完整语料；不得依赖用户全局 Store，也不在 benchmark 仓库复制或改写 Knowledge-Pack 正文。

替代方案：提交 Pack 正文副本或仅记录本机当前 Pack 列表。前者重复维护源内容并可能漂移，后者不能证明运行使用完整且固定的语料。

### 3. Query 与 oracle 分文件，runner 构造 allowlisted harness 输入

revision 保存 user-like query 输入，私有评测材料另存 core / scope-confuser IDs、标签说明和评分配置。`private/` 表示 evaluator/oracle 与被测输入隔离，不表示对仓库维护者保密。Runner 逐条构造仅含 query、固定 Store/Pack、Profile、N 和 K 的 stdin payload，不序列化整个案例对象；harness 子进程不接收 label 文件路径、gold IDs、scorer 或评分字段。自动化测试检查真实序列化 payload 的字段集及金标不存在。

替代方案：让 harness 返回文本 / 分数，或让 runner 直接导入主仓库 Engine 源码。前者扩大上游接口并泄露不必要内部量；后者跨仓库耦合私有实现，且难以代表固定 checkout 的真实检索路径。

### 4. 使用小而可解释的标注与原始指标

每个案例有一个或多个共同必需的 `corePracticeIds`；如只是互相替代的正确答案，写成不同案例。只标注与当前决策/阶段不匹配、但容易因领域背景进入结果的 `scopeConfuserIds`，不逐 query 给所有 Practice 评分。

Scorer 自动报告：core ID 的 Recall@N；core ID 是否进入 K 及其排名；逐案例是 candidate miss 还是 final-ranking miss；当 core 与 scope-confuser 同时出现于 final IDs 时是否发生 pairwise inversion。Scope-confuser 进入 top K 本身不失败；若它排在 core 之前则报告排序倒置。多个 core 同时必要时逐 Practice 报告命中，并报告全 core 是否均进入 K。对照词和普通近邻仅作解释，不混入隐式加权总分。

替代方案：只报告 final top-k 命中，或只报告单个 MRR/nDCG 总分。拒绝原因是无法定位 candidate recall 与 final ranking 的责任，也无法反映 #236 指出的“当前任务不匹配但领域相似”的倒置。

### 5. 一个整批记录；运行健康与检索结果分开

一份 batch manifest/record 对应一个 benchmark revision 的完整 query 集。Manifest 固定 benchmark、queries、labels、scorer、Pack source/digest、Lorelum checkout commit、embedding Profile/model、N/K、运行环境和输入/输出 hash。逐 query artifact 只含 case ID、状态、candidate IDs、final IDs 与派生诊断；不返回 Practice 正文、query 回显、similarity 或内部 score。

只有所有案例都有效完成才记为完整运行；失败或缺失案例使 batch 保持 incomplete/failed。重跑创建新 run ID，禁止把不同 run 的部分 query 拼成一条完整结果。运行状态（可否解读）与检索表现（指标）是不同字段。

替代方案：每条 query 创建一条 Agent run record，或把多次部分 run 合并。前者错误套用现有 task lifecycle，后者丢失同次配置和失败证据。

### 6. 固定评测条件，但不设置效果分数门槛

首版 `N=20`、`K=5`；确切 embedding Profile/model version 和运行环境在实施 Plan 与 baseline 前固定并进入 manifest。先依赖主仓库完成 N/K 边界拆分与本地 harness；baseline 使用改排序前的 Lorelum commit。比较变更时固定 benchmark revision、Pack corpus、queries/labels、scorer、Profile、N/K 和环境；若有意更换 Profile，报告为整体配置变化，不与原配置伪装成单一排序变化。

首版预计约 30–50 条 query、约 8–10 类场景是容量规划，不作为硬门槛；完成性由场景覆盖和固定语料完整性决定。完整 baseline 不设“分数必须达标”要求，因为其职责是提供改动前的可信证据。

## Risks / Trade-offs

- [上游 harness 未交付或契约变化] → Runner/scorer 实现被阻塞；在主仓库 N/K 与 ID-only harness 完成且回归验证前，不造本地替代接口。
- [Pack source 与描述性版本文字不一致] → 以锁定 commit、完整 Practice ID inventory 和 digest 为准；差异写进 provenance，不使用全局安装视图。
- [人工金标对边界案例存在判断差异] → 每条标签绑定具体当前任务/阶段与选中 Practice IDs，替代答案拆开；标签在首个正式 baseline 前冻结，之后修订升 benchmark revision。无需每轮人工判分。
- [固定 query 不能代表所有生产查询] → 报告结论限定为该 corpus 和案例集上的相对观测，不宣称全局生产准确率。
- [模型/Profile/环境漂移] → baseline 前锁定并写入 manifest；缺少 provenance 的结果不能计为有效完整运行。

## Stable Capability Applicability

`retrieval-ranking-evaluation` 是跨 revision 的仓库能力，不是本版本的 Pack/query/profile 说明：

- 独立于 Agent outcome 的 track 语义对未来任何检索排名批次都成立，避免未来语料/模型变化后再次借用不相干的 Agent 字段。
- 固定 corpus/case/oracle 版本适用于每个新检索数据集；本版 Pack commits、Practice ID inventory 和 query/label revision 仅在本 change 的 fixture contract 中固定。
- gold 与 harness 输入隔离适用于任何被测检索版本，防止系统直接读取答案；本版具体进程 payload 由上游 #236 harness 协议约束。
- candidate recall 与 final ranking 分开报告是检索流水线的通用可观测边界；N/K 数值、core/confuser 标签和指标配置仍属于具体 benchmark revision。
- batch provenance 与运行状态/检索结果分离适用于任何未来批次重跑和版本比较；本版具体 Profile、运行环境和 artifact layout 仍在 change/manifest 中固定。

该 stable capability 不要求未来 benchmark 采用本版的 Pack、场景、N/K 或 embedding Profile。
## Migration Plan

本 change 仅添加新的 retrieval-ranking track、schemas、validator 和批次记录，不迁移或重写现有 Agent suite、schemas 或记录。正式对比始于完整 baseline；之后 query、labels、corpus inventory 或 scorer 语义改变时创建新 benchmark revision，历史 run 及 artifact 保持不变。
