# Retrieval-ranking benchmark protocol

本文定义本仓库的独立 `retrieval-ranking` 轨道。它测量固定 Knowledge-Pack 语料上的 semantic retrieval 候选召回、最终 top-K 排名和明确的范围错误，不测量编码 Agent 的任务效果。

轨道的行为契约以 [`retrieval-ranking-evaluation`](../openspec/changes/retrieval-ranking-benchmark/specs/retrieval-ranking-evaluation/spec.md) 为准；本文说明如何执行和读取一次批次。

## 固定对象

首版 revision 是 `suites/retrieval-ranking/v1/`：

- `corpus/inventory.json` 固定完整 Practice ID 清单、来源路径、内容 digest 和每个 Pack 的安装 artifact digest，不复制 Pack 正文。
- `cases/queries.json` 只保存 case ID 和自然语言 query。
- `private/labels.json` 保存 `coreIds`、高置信 `forbiddenIds`、覆盖类别和标签理由。
- `private/scorer.json` 固定 N=20、K=5 和报告指标。

查询、标签和 scorer 一起构成 revision。任何会改变含义的修改都必须创建下一个 revision；已经产生结果的 revision 不再改写。

## 被测进程边界

runner 从锁定的 Lorelum checkout 启动主仓库本地 harness：

```sh
bun packages/backend/src/benchmark/semantic-retrieval-harness.ts
```

每条 query 一个子进程。stdin 只含：

```json
{
  "query": "...",
  "storeRoot": "/absolute/test-owned/store",
  "embeddingProfileId": "72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5",
  "candidateWidth": 20,
  "resultLimit": 5
}
```

Gold labels、期望 ID、scorer 状态、仓库路径和 batch 身份都不进入 harness stdin、参数或环境。成功响应必须是退出码 `0` 加 `status: "ok"`，并且包含同一检索快照的 `candidateIds` 和有序 `finalIds`。失败响应不带部分名单。

harness 子进程另外只接收一个 benchmark 专用配置变量 `LORELUM_BENCHMARK_CACHE_ROOT=<absolute test-owned cache root>`。它指向与 `index build --cache-root` 相同的 derived cache，让 harness 读取本次 Store-only semantic artifact；它不携带 gold、query、正文、期望 ID 或 scorer 状态。普通 CLI 和产品 API 不依赖这个变量。

## Test-owned Store

runner 不读取用户默认 Store，也不使用当前机器上未固定的 Installed Pack。它从 `lorelum/lorelum-packs` 的固定快照重建语料：

1. 按 `suite` 固定的 release 版本安装四个 Pack 到显式 Store。
2. 校验安装回执的 source commit、artifact digest 和 Practice ID 清单；任一 digest 与固定 inventory 不一致时停止。
3. 使用固定 Profile 构建 semantic index，等待并确认 status 为 `ready`。
4. 任一安装、digest、Profile、模型、native runtime 或 index 前置条件失败时停止为环境/运行问题，不产生召回或排名失败。

## 运行批次

从本仓库根目录执行：

```sh
bun run src/benchmark/retrieval-ranking/runner/run.ts \
  --lorelum-root /absolute/lorelum-checkout \
  --lorelum-commit caecc53694d3162bd145e30f3bc5628ee6902b0c \
  --store-root /absolute/test-store \
  --cache-root /absolute/test-cache \
  --model-id <model-id> \
  --model-version <model-version> \
  --native-runtime <target>
```

可选 `--profile-id`、`--artifact`、`--record` 和 `--run-id`。默认 Profile 是首版固定值；默认结果附件路径是 `artifacts/retrieval-ranking/<run-id>.json`，批次记录路径是 `results/records/<run-id>.json`。

Runner 只有在一个 revision 的全部 case 都返回合法 `0 + status=ok` 时才评分。任何 process、protocol、Profile、runtime 或 index 失败都会让 batch 为 `failed`，结果附件保留逐例执行失败但不保留候选/最终名单，也不进入相关性分母。重跑使用新的 run ID，不拼接 partial results。

## 冻结 baseline

首版 baseline 使用 Lorelum commit `caecc53694d3162bd145e30f3bc5628ee6902b0c`。该 commit 已让 harness 从 `LORELUM_BENCHMARK_CACHE_ROOT` 读取与 Store-only CLI 相同的 derived content-addressed semantic artifact，未设置该变量时回退 `defaultQueryArtifactCacheRoot()`；五字段 stdin、N/K、普通 `lore query` 和公开 API 不变。

- 正式 batch：`retrieval-ranking-v1-baseline-caecc53`，50/50 case 完成，失败为 0。
- replay：`retrieval-ranking-v1-baseline-caecc53-replay`，50/50 case 完成，逐例 `candidateIds`、`finalIds` 和 score 与正式 batch 一致。
- 结果：core candidate recall 49/50；core final top-5 hit 42/50；1 个 candidate miss；7 个 final-ranking miss；2 个 scope error case。
- 记录：`results/records/retrieval-ranking-v1-baseline-caecc53.json` 和同名 `-replay.json`。
- artifact：`artifacts/retrieval-ranking/<run-id>.json`。按仓库规则，大 artifact 保持忽略，Git 记录路径与 SHA-256；baseline artifact hash 为 `74636841baaf9ea0118ff863fc3ce6441d0d0d50df78ecc6afc58be5450f3790`，replay artifact hash 为 `891d5f157e6ead9cf645630403d16e95623f4c6c0836e718d31e18a45a583034`。

逐例失败名单、native/model/index provenance 和复现证据见本 change 的 [`verification.md`](../openspec/changes/retrieval-ranking-benchmark/verification.md)。baseline 冻结后，后续对比只更换预先声明的 Lorelum build；benchmark revision、corpus、Profile、模型、native runtime 和 N/K 必须保持相同。

## 逐例判定

runner 在 harness 返回后才在父进程读取 gold labels，并生成：

- 每个 `coreId` 是否进入 `candidateIds`，以及候选名次。
- 每个 `coreId` 是否进入 `finalIds`，以及 final 名次。
- `candidate-miss`、`final-ranking-miss` 或 `final-hit` 分类。
- 每个明确 `forbiddenId` 是否进入 final top-K；进入即 scope error。
- core 与 forbidden 同现时的 pairwise relative order。
- 出现在 final top-K 的未标注 Practice ID，仅作诊断，不自动判错。

批次汇总报告 candidate recall、final hit、miss 分类、scope error 和逐例原始证据。它不产生加权总分，不声称 Agent 效果或全局生产质量。

## 记录与复现

一条完整评测是一条 immutable retrieval batch record。记录包含：

- benchmark revision 与 cases/labels/scorer hash；
- Pack 快照、source commit、artifact digest 和 corpus digest；
- Lorelum commit、harness protocol version 1 和 entrypoint；
- embedding Profile、model identity、native runtime；
- 平台、架构、Bun 版本、N/K；
- 结果附件路径与 SHA-256；
- execution 状态、失败分类和是否评分。

Baseline 只能在完整语料可重建、固定 Profile/native runtime ready，并且 Lorelum commit 能由干净 checkout 重建时记录。Baseline 不设有效果门槛；改进前后的比较必须保持同一 revision、corpus、Profile 和 N/K，只改变预先声明的 Lorelum build。

## 非目标

本轨道不修改主仓库检索算法，不读取普通 `lore query` 调试文本，不跨仓库 import Engine 私有源码，不扩展公开 CLI/API，也不把检索排名与下游编码任务质量合成一个分数。
