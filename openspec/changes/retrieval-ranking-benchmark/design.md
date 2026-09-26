# Design

## Context

参见 `proposal.md` 与本 change 的 `retrieval-ranking-evaluation` spec。本 change 关联 benchmark Issue #222，并为主仓库 Lorelum #236 提供检索证据；不实现 Engine 排序。

当前 `schemas/suite.schema.json`、`schemas/run-manifest.schema.json` 和 `schemas/run-record.schema.json` 把 suite / task / agent / treatment 等编码任务字段设为必需项，run record 的 track 也固定为 `performance-skill-comparison`。retrieval batch 没有对应的真实 Agent/task 语义，因此新增 track-specific 契约，不虚构旧字段，也不改变旧 track。

### 上游 harness v1

主仓库最初在 commit `6bf1e1b390df3bffad13d4131939b84126b0242c`（`feat(retrieval): separate candidate and result widths`）拆开 N/K，保留原候选顺序；随后在 `caecc53694d3162bd145e30f3bc5628ee6902b0c` 修正 derived-cache 路由并记录 clean-checkout 复现。baseline 固定在 `caecc53694d3162bd145e30f3bc5628ee6902b0c`。协议文档是 `docs/development/semantic-retrieval-benchmark-harness.md`，从锁定 checkout 根目录启动：

```sh
bun packages/backend/src/benchmark/semantic-retrieval-harness.ts
```

每条 query 启动一个子进程；stdin 输入只包含：`query`、绝对 `storeRoot`、固定 `embeddingProfileId`、`candidateWidth`（N）和 `resultLimit`（K）。首版 N=20、K=5；协议版本 1 记入 provenance，不是 JSON 字段。成功是 exit 0 + 一行 `status: "ok"` JSON；结构化失败是非零 exit + `status: "error"` 和稳定 `errorCode`，不带名单。错误码包括 `invalid_request`、`profile_mismatch`、`runtime_unavailable`、`index_unavailable`、`store_busy`、`retrieval_failed`、`invalid_result`。Runner 还验证字段白名单、进程退出码、JSON 结构、名单无重复、candidate 长度不超过 N、final 长度不超过 K、final 是 candidate 子集、所有 ID 属于固定 corpus。协议/环境错误不得送入 scorer。

主仓库该 commit 的真实 smoke 使用 Profile `72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5`、win32-x64 native runtime、ready semantic index、8 条合成 Practice，exit 0 / `status: "ok"`，final 保留旧候选顺序。它只证明 harness/runtime/protocol 可以工作，不是 benchmark baseline；所有 `benchmark.practiceNN` 合成 IDs 禁止进入正式 query、labels 或结果。

Lorelum commit 已从 `lorelum/lorelum` origin 分支 fetch，并在独立、干净的 detached checkout 中重建后运行。Runner 仍要求指定本地 Lorelum git checkout 和 commit 并验证两者一致，且不能依赖 uncommitted working tree。

### 固定 corpus

首版 Pack 来源为 `lorelum/lorelum-packs` 的目录快照 `3a48b6a026554ce7f30caf1e7d52130e5eb01db3`：

| Pack | 来源提交 |
| --- | --- |
| `agentic-coding` | `954324cda7961ae899578649847aa32e1aa90a6f` |
| `issue-pr-etiquette` | `45484847e02ea11e8438c7f3c17d7b2eee5b4dfc` |
| `pack-creator` | `f144a5a5e69636a5a6cd97a8b519018d2941bac6` |
| `react-web-craft` | `293e6b1327b0d9b4c01a711748db14c610908655` |

这些 immutable commits 已通过 GitHub commit lookup 核实存在。Corpus builder 使用固定 Lorelum checkout 的 CLI machine-readable pack/index contracts，在显式 test-owned Store 安装四个精确 release，并核对解析出的 source commit / artifact digest 与 fixture pin；随后显式 build/status index，直到 Store-only semantic index 为 ready 且 Profile ID 匹配。只检查结构化 JSON 和退出码，不读取 CLI 调试文本；任何来源或 digest 漂移直接失败，不静默接受当前 Registry/local installed Store。语料正文不复制到 benchmark。

## Goals / Non-Goals

**Goals:**

- 用独立 retrieval-ranking revision、schemas、validator、runner、deterministic scorer 和 batch record 完成一条评测链。
- 以完整固定 Pack corpus 为检索空间；query 输入与 gold 文件分开，runner 只将当前 query 与 harness 配置交给子进程。
- 分开报告 core 是否进入候选、是否进入 final top 5；明确标注的 forbidden 若进入 final top 5，报告 scope error。
- 主仓库排序变化前，使用完整首版案例跑出可复现 baseline。

**Non-Goals:**

- 修改 Lorelum Engine、普通 `lore query` 输出、公开 package exports 或产品 API。
- 扩展 React Skill / Practice-injection Agent 轨道，或评价 Agent 如何使用检索结果。
- 将全部 Practice 对每条 query 穷举标注、设秘密 holdout、每轮人工/LLM 判分、要求 top 5 只有 core，或产生掩盖逐例差异的加权总分。
- 将延迟或内存诊断解释为整体生产检索质量。

## Decisions

### 1. 新增独立 retrieval-ranking capability 和 track-specific schemas

使用 `suites/retrieval-ranking/v2/` 保存当前 suite revision、corpus/query 来源和完整 case inputs；`private/` 保存 labels/scorer config/snapshot。`v1/` 原样保留为已有 failed record 的历史 revision。新增 track-specific suite、batch manifest、batch record schemas 和 validator 分派，不改现有 Agent schema 的必需字段。

替代方案：把 query 放进现有 React / Practice-injection task。拒绝原因是那些轨道测试 Agent 行为，无法真实表示 Engine candidate/final IDs，且会诱发伪造 task/Agent 字段。

### 2. 固定来源而不复制 Pack 正文

Corpus fixture 锁定 pack repo snapshot commit、各 Pack source commit、安装 artifact digest、全部 Practice IDs 与内容 digest。Runner 建立 test-owned temp Store，通过 fixed Lorelum CLI 的 JSON Pack install 回执验证精确 source/artifact，使用 `index build/status/operation` 的 JSON 合同准备并验证 semantic index。查询 harness 使用同一 Store root，并通过 benchmark 专用 `LORELUM_BENCHMARK_CACHE_ROOT` 环境变量读取同一 derived cache；该变量不进入普通 CLI/API，也不携带 gold。不使用用户默认 Store、未锁定 Registry release 或当前 Installed Pack Catalog。Profile/model/native runtime 未准备好时停止为 environment failure；不允许 runner 静默下载模型或把准备错误记成检索错。

替代方案：复制 Pack 内容、依赖本机预装 Store，或直接调用 Engine/Store 私有源码。它们分别造成源数据重复、语料漂移或跨仓库私有实现耦合。

### 3. Query 与 oracle 分文件，runner 构造 allowlisted harness 输入

query set 文件只包含 case ID 与自然语言 query；private labels 保存 core IDs、严格 forbidden IDs 和标签说明。`private/` 表示评测材料不进入被测进程，不表示对仓库维护者保密。Runner 为每例新启子进程，只构造 v1 五字段请求，不序列化整个案例对象；不把 label/scorer/path/hash 等答案材料放到 stdin、参数或子进程环境。

替代方案：把完整 case 对象直接送入子进程、消费用户 CLI debug 输出或 import Engine 内部代码。前者泄露金标，后两者违反已确定接口边界。

### 4. 使用小而可解释的标签与原始指标

`coreIds` 是该例共同必需的答案；互相替代的答案拆成不同 case。`forbiddenIds` 只允许明确不适用当前 query/阶段的高置信标签；只对它们施加 top-K scope error。无标签普通近邻不判错。

Scorer 报告每个 core 的 Recall@N、final top-K/rank、candidate miss 与 ranking miss 分类；逐例统计 forbidden 出现在 final top-K 的 scope error，并在同现时记录其和 core 的相对顺序。报告所有原始逐例证据与清楚的分母，不产出加权总分或 Agent 效果结论。

替代方案：只看 final top-K 命中或给所有近邻自动判 forbidden。前者无法定位召回与排序故障；后者会把“top 5 允许有噪声”错误变成零噪声门槛。

### 5. 一个整批记录；运行健康与检索得分分开

一条 batch manifest/record 覆盖同一 benchmark revision 的全套 queries，固定 benchmark/query/labels/scorer、corpus digest、Lorelum commit、harness protocol version 1、Profile ID、model/native runtime、OS/arch、N/K 和 artifacts hashes。逐例结果只含 case ID、执行状态、candidate/final IDs 与可解释判断，不输出 query 回显、正文、similarity 或 score。validator 必须按 record 的 `suiteVersion/revision` 解析对应 revision 文件，比较 cases/labels/scorer hash、corpus digest、Pack 身份和 N/K；任何对已有 record revision 的原地改写都必须让 `bun run validate` 失败。

只有所有 query 都以合法 `status=ok` 完成才是完整 batch。结构错误、退出码/status 不匹配、Profile/runtime/index 准备失败、harness error 或缺失 case 让 batch 不完整且不进入相关性分母；重跑给新 run ID，不拼接 partial results。Store/index 或 harness client 在 case 执行前 setup 失败时，runner 仍必须写出 immutable `failed` batch artifact/record，记录 `setup_failure` 阶段和稳定 errorCode，不能只抛出进程错误。

已有 record 的 revision 若为 `candidate` 或 `pilot`，validator 必须拒绝，因为它们与实际冻结生命周期矛盾。

替代方案：一条 query 一条 Agent record，或将多轮结果拼成一个完整集。二者都破坏了真实运行单位与配置/故障的可追溯性。

### 6. 固定比较条件；实现与 baseline 分阶段

runner/protocol contract tests 先在模拟 harness 上完成，再对固定协议 v1 开发 corpus setup、scorer 与批次 schema。v1 首轮失败后没有原地改题：`v1` 恢复为失败 record 产生时的内容，`v2` 承载 artifact pin、50 条 query/label/scorer 和正式 baseline。正式完整 baseline 使用可重建的 Lorelum commit `caecc53694d3162bd145e30f3bc5628ee6902b0c`、固定 Pack Store/index、Profile `72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5`、native runtime 和完整 labels/query revision。合成 smoke IDs 未被复用。baseline 不设效果门槛；排序改动在 baseline 冻结后进行，并在同一 benchmark revision/config 下对比。

固定 Lorelum CLI 的 Store-only semantic artifact 发布在 derived cache，而最初 harness 直接以 Store root 读取 semantic index。主仓库已在 baseline commit 中让 harness 从 benchmark 专用 `LORELUM_BENCHMARK_CACHE_ROOT` 读取同一 content-addressed artifact，未设置时回退默认 cache；五字段 stdin、N/K 和输出字段保持不变。该修正后的完整 baseline 与 replay 逐例名单和 score 一致，详见 `verification.md`。

首版预计 30–50 queries、约 8–10 场景组是规划估计，不是硬性数量门槛；以 scenario coverage、完整语料和标签可验证为准。

## Stable Capability Applicability

`retrieval-ranking-evaluation` 只固化跨数据版本仍成立的规则：track 与 Agent outcomes 分开；固定并版本化 corpus/case/oracle；harness 输入不得接收 gold；候选召回、最终排名与明确 forbidden scope error 分开；完整批次及其 provenance 不可被部分重跑拼接。这些要求对未来更换 Pack、query 集或 Lorelum build 的 retrieval-ranking revision 仍适用。本版 commit、Pack pins、Profile、N/K、label 条件和模型/runtime identity 留在本 change 的 design、suite revision 与 manifest，不扩展为所有 benchmark 的稳定规则。

## Risks / Trade-offs

- [历史 v1 与当前 v2 同时存在] → suite manifest 声明全部 revision 及其 lifecycle；validator 按 record 的 revision 解析历史文件，v1 failed record 与 v2 baseline 都保留。
- [Pack Registry descriptor/ref 漂移或无法访问] → 对每个安装回执核对 source commit 和 artifact digest；任意不符即停止，不使用当前机器已安装内容替代。
- [Profile/native model/runtime/index 不可用] → preflight/CLI 状态归类为运行环境问题；不产生 candidate miss/排名分数，不自动下载模型。
- [forbidden 标签主观] → 只为高置信明确不适用 Practice 标注；普通近邻保持 unlabelled，且不要求逐语料穷举负标。
- [固定 query 不能代表所有生产 query] → 结果只对冻结 corpus/case set 的相对变化负责，不宣称全局生产准确率。

## Migration Plan

本 change 添加独立 track、schema、validator、runner、scorer 和 batch record；不迁移或重写现有 Agent suite/schema/records。`v1` 保留为已有 failed record 的历史 revision，`v2` 是当前活动 revision 和正式 baseline。之后 query、labels、corpus inventory 或 scorer 语义变化时创建新 benchmark revision，历史 run/artifacts 保持不变。
