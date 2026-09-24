# Tasks

## 1. 上游接入基线与固定来源

- [x] 1.1 核实主仓库 commit `6bf1e1b390df3bffad13d4131939b84126b0242c`、harness protocol v1 和真实 smoke 证据；记录固定 Profile `72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5` 及 N=20/K=5。该 smoke 的 8 条合成 Practice 仅证明 harness/runtime 可用，不作为 benchmark cases、labels 或 baseline 输入
- [ ] 1.2 核验 `lorelum/lorelum-packs` 快照与四个 Pack source commits，准备 corpus inventory/digest 期望清单；失败或不一致时停止，不回退到本机已安装 Pack

## 2. 建立版本化 corpus、案例与独立 track 契约

写入范围：`suites/retrieval-ranking/`、`schemas/`、`src/benchmark/validate.ts` 及相关验证测试；不修改现有 Agent track schema 语义。

- [ ] 2.1 新增 retrieval-ranking suite revision 和 corpus builder：从固定四个 Pack release 构建 test-owned Store，检查安装回执的 source commit/artifact digest，build/status semantic index 并验证 ready/Profile 匹配；验证完整 ID inventory 与 corpus digest
- [ ] 2.2 新增版本化 query cases，覆盖 Issue #222 约定的场景；每例标共同必需 core IDs，并仅为高置信明确不适用项标 forbidden IDs；验证替代答案拆成独立案例、标签 IDs 属于完整 corpus
- [ ] 2.3 分离 query 输入与 private gold/scoring 文件；通过 fixture contract test 证明传给 harness 的当前案例请求不含任何标签字段或 gold ID 清单
- [ ] 2.4 新增 track-specific suite、batch manifest 与 batch record schemas 及 validator 分派；旧 Agent suite、manifest 和 record contract tests 继续通过

## 3. 实现确定性评分

写入范围：`src/benchmark/retrieval-ranking/scorer/` 与对应 contract tests。

- [ ] 3.1 从 core/forbidden IDs、candidateIds 与 finalIds 生成逐案例 Recall@N、core top-K 命中/rank、candidate miss / final-ranking miss 分类、forbidden top-K scope error 和同现时的相对顺序；单元测试覆盖未召回、召回但未进 K、多 core、forbidden 出现与不出现
- [ ] 3.2 生成保留原始逐例证据的批次汇总，不引入加权总分；测试证明未标注 Practice 单独出现不自动判错，结果不作 Agent 效果或全局生产准确率解释

## 4. 实现 runner 与协议 v1 边界

写入范围：`src/benchmark/retrieval-ranking/runner/` 与对应 runner contract tests；调用固定 Lorelum checkout 的本地 harness，不修改主仓库。

- [ ] 4.1 从固定 Lorelum checkout 根目录以每案例一个子进程启动 `bun packages/backend/src/benchmark/semantic-retrieval-harness.ts`；请求只包含 query、绝对 Store root、Profile ID、`candidateWidth`=N、`resultLimit`=K。用独立 fake harness 测试 stdin allowlist，不复用主仓库 smoke 的 `benchmark.practiceNN` IDs
- [ ] 4.2 验证协议 v1 退出码/status 对应（`0 + ok`；非零 + `error`）、单行 JSON、稳定错误码、无重复/语料外 IDs、N/K 长度、final 子集关系；错误码、进程错误、Profile/runtime/index 准备问题与相关性失败分开
- [ ] 4.3 验证每案例进程重新读取请求且金标不出现在 stdin/argv/env；只保留 ID-only candidate/final 输出，不记录 query echo、Practice 正文、相似度或内部 score；对成功/结构化失败/畸形响应作 contract tests

## 5. 批次记录、验证与完整 baseline

写入范围：`results/records/`、track-specific record/manifest validation、`package.json` 的必要验证脚本及集成测试。

- [ ] 5.1 实现整组 query 一条 batch manifest/record，记录 benchmark/corpus/query/label/scorer revision、Lorelum commit、protocol version、Profile/model/native runtime、平台、N/K、环境和 artifact hashes；验证 complete/failed/rerun 使用独立 run ID 且不能拼接
- [ ] 5.2 运行 `openspec validate retrieval-ranking-benchmark --type change --strict --json`、`bun run validate` 和相关 contract tests；审计无 gold-to-harness 泄漏
- [ ] 5.3 仅在完整 Pack Store/index 可复现、Profile/native runtime ready 且 Lorelum commit 可从干净固定 checkout 重建时，跑全量案例并生成一条改动前 baseline 和校验过的结果附件；锁定 N=20/K=5，不设检索分数门槛；禁止使用主仓库 8 条合成 smoke ID
