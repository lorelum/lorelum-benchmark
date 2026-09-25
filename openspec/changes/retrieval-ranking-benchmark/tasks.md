# Tasks

## 1. 锁定上游协议与实现 harness client

- [x] 1.1 核实主仓库 commit `6bf1e1b390df3bffad13d4131939b84126b0242c`、harness protocol v1 和真实 smoke 证据；记录固定 Profile `72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5` 及 N=20/K=5。该 smoke 的 8 条合成 Practice 仅证明 harness/runtime 可用，不作为 benchmark cases、labels 或 baseline 输入
- [x] 1.2 实现 protocol v1 的 pinned-checkout client 和 allowlisted stdin 组装；用 fake child-process contract tests 验证一次 query 一次进程、exit/status/error、ID 与 N/K 约束，且不使用主仓库 smoke 的合成 IDs

## 2. 固定完整 corpus 并建立案例 revision

写入范围：`suites/retrieval-ranking/`、`schemas/`、`src/benchmark/validate.ts` 及相关验证测试；不修改现有 Agent track schema 语义。

- [x] 2.1 核验 `lorelum/lorelum-packs` 快照和四个 Pack source commits，生成仅含 Practice IDs、来源路径和 digest 的完整 corpus inventory；测试证明 corpus 正文未复制到 benchmark 仓库
- [x] 2.2 新增 retrieval-ranking suite revision 与 corpus builder：从固定四个 Pack release 构建 test-owned Store，检查安装回执 source commit/artifact digest，build/status semantic index 并验证 ready/Profile 匹配，并通过 benchmark 专用环境变量把同一 derived cache 交给 harness；不使用用户默认 Store 或未固定的 Installed Pack
- [x] 2.3 新增版本化 query cases，覆盖 Issue #222 约定的场景；预计约 30–50 条但以场景覆盖为准，每例标共同必需 core IDs，只为高置信明确不适用项标 forbidden IDs，验证替代答案拆为独立案例且 labels 引用属于完整 corpus
- [x] 2.4 分离 query 输入与 private gold/scoring 文件；contract tests 证明可传给 harness 的请求没有标签字段或 gold ID 清单
- [x] 2.5 新增 track-specific suite、batch manifest 与 batch record schemas 及 validator 分派；旧 Agent suite、manifest 和 record contract tests 继续通过

## 3. 实现确定性 scorer

写入范围：`src/benchmark/retrieval-ranking/scorer/` 与对应 contract tests。

- [x] 3.1 从 core/forbidden IDs、candidateIds 与 finalIds 生成逐案例 Recall@N、core top-K 命中/rank、candidate miss / final-ranking miss 分类、forbidden top-K scope error 和同现时的相对顺序；单元测试覆盖未召回、召回但未进 K、多 core、forbidden 出现与不出现
- [x] 3.2 生成保留原始逐例证据的批次汇总，不引入加权总分；测试证明未标注 Practice 单独出现不自动判错，结果不作 Agent 效果或全局生产准确率解释

## 4. 实现完整 batch runner 与 immutable records

写入范围：`src/benchmark/retrieval-ranking/runner/`、`results/records/` 和相应验证测试；调用固定 Lorelum checkout 的本地 harness，不修改主仓库。

- [x] 4.1 对冻结 revision 的全部 query 逐条调用已验证的 protocol v1 client，并在 gold 仅留在 parent scorer 的前提下收集逐例执行状态和 ID-only lists
- [x] 4.2 实现整组 query 一条 batch manifest/record，记录 benchmark/corpus/query/label/scorer revision、Lorelum commit、protocol version、Profile/model/native runtime、平台、N/K、环境和 artifact hashes；验证 complete/failed/rerun 使用独立 run ID 且不能拼接
- [x] 4.3 验证任何 process/protocol/Profile/runtime/index 失败都不进入检索质量分母；只有有效 `0 + status=ok` 响应才可评分，forbidden/core 标签不进入 harness stdin/argv/env

## 5. 验证与完整改动前 baseline

- [x] 5.1 运行 `openspec validate retrieval-ranking-benchmark --type change --strict --json`、`bun run validate` 和全部相关 contract tests；审计无 gold-to-harness 泄漏
- [x] 5.2 仅在完整 Pack Store/index 可重建、Profile/native runtime ready 且 Lorelum commit 可从干净固定 checkout 重建时，运行全量案例并生成一条完整改动前 baseline 和校验过的结果附件；锁定 N=20/K=5，不设检索分数门槛，禁止使用主仓库合成 smoke IDs。主仓库 `caecc53694d3162bd145e30f3bc5628ee6902b0c` 修正 derived-cache 路由后，v2 的 50/50 case 完成；baseline 与 replay 的 candidateIds、finalIds 和 score 一致，记录与证据见 `verification.md`

## 6. 第一轮 review 修复

写入范围：`suites/retrieval-ranking/`、`schemas/`、`src/benchmark/retrieval-ranking/` 和 `results/records/`；不改变 query/label/scorer 语义。

- [x] 6.1 恢复 v1 为 failed record 产生时的原始内容并保留该 record；将 artifact pin、50 条 query/label/scorer 和正式 baseline 放入新 v2 revision
- [x] 6.2 扩展 suite manifest 的 revision 声明，并让 validator 按 record 的 suiteVersion/revision 校验 cases/labels/scorer hash、corpus digest、Pack 身份和 N/K
- [x] 6.3 捕获 Store/index 与 harness client setup 失败，写出带 `setup_failure` 的 failed artifact/record，且不保留部分候选/最终名单
- [x] 6.4 让存在 record 的 revision 必须处于 frozen 或后续 lifecycle，并增加对应回归测试
- [x] 6.5 用 v2 新 run ID 重跑 baseline/replay，更新冻结证据、revision 文档和 PR 说明
