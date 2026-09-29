# Lorelum #236 后续分析交接（2026-09-26）

## 当前授权与下一步

用户要求继续优化，不把剩余失败简单作为可接受遗留项结束。但先分析原因、提出方案，再确认实施。此次交接不授权修改检索算法、冻结题库、labels、scorer 或历史 records，也不预选复杂 reranker。

本工作关联 benchmark Issue #222 / Draft PR #223 / OpenSpec `retrieval-ranking-benchmark`。先读当前 AGENTS.md、docs/CHANGE_WORKFLOW.md 及本 change。现有评测基础与后续主仓库优化分开处理；CI 通过不代表独立审查或合并完成。

## 已有证据

- benchmark revision：retrieval-ranking/v2；50 query，4 Pack / 97 Practice，N=20/K=5。
- baseline Lorelum：caecc53694d3162bd145e30f3bc5628ee6902b0c。
- candidate Lorelum：09e64be914dc93124230f06483c8dfc4c164a61a。
- 两版 core candidate recall 49/50；core final top-5 42/50 → 48/50；candidate miss 1 → 1；final-ranking miss 7 → 1；scope error case 2 → 2。
- candidate 与 replay 均为 50/50 成功，无运行失败，逐例名单与评分一致。原有 42 条 top-5 命中未丢失，但若干仍命中的案例名次下降，不应说“没有任何退步”。
- 四份完整结果附件已在 `results/evidence/retrieval-ranking-v2/` 随 Git 保存；对应 records 在 `results/records/`。先验证同名附件 SHA-256，不依赖 record 中原机器的绝对路径。
- 具体固定输入、模型/native 身份及原始证据见 `verification.md` 和 records。两版 semantic artifact ID 相同，但仅凭 ID 相同不足以证明运行中每一项行为都没变；还需逐例核对候选集合。

## 需要先核实，不能沿用为事实的旧说法

1. `agentic-limit-investigation` 的 core 在返回 candidateIds 中位置 6 → 11，但两版 final top-5 都没有它。需查候选观察点是否被原地重排影响；确认前不能把该位置称为原始语义召回名次或完整最终排名。
2. “decision 等泛化词把 Pack 创作类 Practice 顶上来”只是原因假设，不是已验证结论。
3. 旧报告的 forbidden-before-core 2 → 0 把“forbidden 在前五且 core 不在前五”也计入。冻结 scorer 的同现 pairwise order 不包含这种情况，不能把该数字直接当作 scorer 的同现 inversion 计数。应分别报告同现顺序和 forbidden 入选五而 core 缺席。
4. `agentic-acceptance-direct` 是 candidate miss。根因是否是投射、修正是否改变 Profile，尚需查明。被测配置变化不自动要求改题库 revision；如配置变化，需重新声明比较条件，不能假装只改排序。
5. scope error 仍有两例；正确答案排得更靠前，不等于不适用结果已退出前五。

## 主仓库负责的分析

- 查 candidate 收集与 final 排序的真实边界，确认 harness v1 名单语义。
- 对 `agentic-limit-investigation` 分析原始相似度差距、任务加分及其字段/词来源，区分基础召回信号与重排的影响。
- 同时检查已改善的六例、仍命中但名次下降的例子、两条 scope error，避免单例调参。
- 将 `agentic-acceptance-direct` 的候选缺失独立诊断，不要求 final rerank 解决候选不存在的问题。
- 优先评估修正现有任务信号是否足够；证据表明不足时，再比较更明确的任务适用性 rerank。禁止按 query 或 Practice ID 写特例。
- 内部分数分析留在主仓库测试中，不扩大 harness、普通 CLI、公开 exports 或产品 API。

## Benchmark 负责的分析

- 逐例比较 baseline/candidate 的候选集合与顺序，不能只凭总 recall 相同认定候选没变。
- 整理改善、未解决、名次下降、scope error 和原始附件引用。
- 保持 v2 fixtures、scorer 与历史记录不变；不为本轮优化改答案，不把未标注近邻临时判错。
- 与主仓库一起提出验收方案：目标案例改善、全套案例变化与退步都需报告。用户未要求给这 50 条写死特例或宣称生产准确率。
- 方案确认、主仓库提供新固定 SHA 后，按声明条件用新 run ID 重跑完整案例，不覆盖既有结果。

## 下一份交付应回答

1. 哪一层有问题，证据是什么，哪些仍是猜测？
2. 推荐改哪里、为什么，有哪些替代方案？
3. 对已通过案例、scope error、成本和可维护性有什么风险？
4. 哪些条件保持固定；若需改变 Profile/投射，如何重新建立有效对照？

此后再按仓库工作流同步 Issue/OpenSpec、确认计划、开始实施。PR #223 还需在固定新 SHA 上完成两轮独立只读 review；本交接不是审查通过记录。

## 跨设备入口

在 lorelum/lorelum-benchmark 获取 `codex/retrieval-ranking-benchmark` 分支，不要只打开 main。本说明和全部结果可直接从 GitHub PR #223 分支读取，无需旧聊天记录或作者的本机 worktree。另一设备重新运行需自行准备兼容环境；读证据不需要下载模型。
