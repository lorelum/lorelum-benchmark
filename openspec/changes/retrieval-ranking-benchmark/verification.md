# Retrieval ranking baseline verification

## 冻结对象与证据位置

- benchmark revision：`retrieval-ranking/v2`，N=20、K=5。
- 正式 baseline record：`results/records/retrieval-ranking-v2-baseline-caecc53.json`。
- 独立 replay record：`results/records/retrieval-ranking-v2-baseline-caecc53-replay.json`。
- baseline result artifact：`artifacts/retrieval-ranking/retrieval-ranking-v2-baseline-caecc53.json`，SHA-256 `b0406f2951558664ad0c468ee08c254dd8e22ff264f5d213579fd677c590dc25`。
- replay result artifact：`artifacts/retrieval-ranking/retrieval-ranking-v2-baseline-caecc53-replay.json`，SHA-256 `0320e00d5b24fdea957663ee00b6ba1c21cedc2367868037ae2f1a88c49c09da`。
- `artifacts/` 按仓库规则忽略；Git 中的 record 保存 artifact 路径与 SHA-256。逐例 `candidateIds`、`finalIds` 和 scorer 原始证据在 result artifact 中；本文件保留失败案例的完整名单与全部 case 汇总。

两次运行的 `case_count` 都是 50、`successful_case_count` 都是 50、`failure_count` 都是 0、`retrieval_scored` 都是 true。50 条 case 的 `candidateIds`、`finalIds` 与 score 完全一致；artifact hash 不同只因 `runId` 和运行时间等运行身份字段不同。

### v1 生命周期修复

最初加入的 `retrieval-ranking-v1-baseline-6bf1e1b` 是失败运行记录，但当时的 `v1/corpus/inventory.json` 在 record 之后被加上 `artifactDigest` 并重算 digest。第一轮 review 确认这违反了“已有运行记录的 revision 不可修改”。修复后：

- `v1` 恢复到产生该失败 record 时的内容，README 与 inventory 均与 `ca1dbc8` 一致。
- `v1` 的 legacy corpus digest 固定为 `89209b7d0d9b5c180648bcc7b235b438a4a3e2237b5006eb462d86d45ca03998`；专项测试从 payload 重算并验证该值。
- `v1` 失败 record 未修改、未删除，仍由 record-binding validator 验证。
- 当前 artifact pin、50 条 query/label/scorer 和成功 baseline 位于 `v2`，所有 v2 文件在新 record 生成前冻结。
- 在 v1 被改写后生成的两次 v1 成功记录已从活动 `results/records/` 移除；它们不是合法历史结果，v2 baseline/replay 已用新 run ID 重新生成。

## 运行 provenance

| 项目 | 值 |
| --- | --- |
| Lorelum commit | `caecc53694d3162bd145e30f3bc5628ee6902b0c` |
| Lorelum repository | `lorelum/lorelum` |
| harness protocol | `1` |
| harness entrypoint | `packages/backend/src/benchmark/semantic-retrieval-harness.ts` |
| Pack snapshot commit | `3a48b6a026554ce7f30caf1e7d52130e5eb01db3` |
| corpus digest | `61176ea93dfa9cdd94193f1024e3a2a6ea8107c1a5e076330ddc60479ad79a69` |
| Practice count | 97 |
| embedding Profile | `72c7404af9d533dce3dd5f5e62987fcb225ffdfd180ae2951879d3a54044c2a5` |
| model | `granite-embedding-97m-multilingual-r2-GGUF`，version `7a8af1473a747268bbb3968b77d5b822a6506667+q4_0` |
| model file SHA-256 | `18e8ce8ce834790618e90d26bed465cca87362076f3042eb0d8eee0732596f59` |
| native runtime | `win32-x64` |
| native build identity | `11af927b69e5228248e0caef20e35df59c0165cc7d0d35a787bd2e44d71c08d7` |
| native recipe identity | `a356d1f361ec24dc9f3e3a6d67d91c25efafca38bdbe1b9827f709d2e92049ca` |
| native executable SHA-256 | `9d115af939951b1a06369c8753920fa97be9a7f8a1cde093e5887cdb6824f7e5` |
| semantic index artifact | `c8f271b7ef3eba96cbc18578a4a0d030a9a470a757b1e5a59b48b26afe93bab7`，`query-artifacts/v1/artifacts/semantic/<artifactId>/active.sqlite` |
| platform / Bun | `win32` / `x64` / `1.4.2` |

baseline commit 已从主仓库 origin 分支 fetch 到独立 detached checkout，并在 `bun install`、`bun run build:native` 后运行。runner 使用 test-owned Store/cache 从固定 Pack 快照重建语料，核对 corpus digest 与安装 artifact digest，通过 `LORELUM_BENCHMARK_CACHE_ROOT` 将同一 derived cache 交给 harness。harness 输入不含 gold、scorer、仓库路径或 batch 身份。

## 批次结果

| 指标 | 结果 |
| --- | --- |
| case / core Practice | 50 / 50 |
| core candidate recall | 49/50 = 0.98 |
| core final top-5 hit | 42/50 = 0.84 |
| candidate miss | 1 |
| final-ranking miss | 7 |
| scope error case | 2 |
| forbidden 出现在 final top-5 | 2 |
| 未标注 Practice 出现在 final top-5 的 case | 50 |

该结果只适用于冻结 corpus、query/label revision、Profile 和 N/K；它不测量编码 Agent 效果，也不声明全局生产准确率。未标注近邻只是诊断信息，不计为错误。

## 非满分案例

### Candidate miss

`agentic-acceptance-direct`

- core：`agentic-coding.requirements.define-acceptance-and-non-goals`
- 判定：`candidate-miss`；core 不在 20 条 `candidateIds` 中。
- candidateIds：
  - `agentic-coding.verification.close-or-declare-evidence-gaps`
  - `agentic-coding.requirements.ground-user-goal`
  - `agentic-coding.verification.map-evidence-to-acceptance`
  - `react.server.no-module-request-state`
  - `agentic-coding.testing.classify-failure-before-changing-test`
  - `agentic-coding.implementation.confirm-product-surface-expansion`
  - `agentic-coding.planning.scale-work-to-risk-and-cost`
  - `agentic-coding.implementation.replan-on-material-drift`
  - `agentic-coding.implementation.inspect-and-reuse-existing-capability`
  - `agentic-coding.correction.restore-authoritative-baseline`
  - `agentic-coding.delivery.claim-only-supported-outcome`
  - `agentic-coding.testing.assert-observable-behavior`
  - `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`
  - `agentic-coding.verification.bind-evidence-to-artifact-state`
  - `agentic-coding.review.validate-findings-before-action`
  - `agentic-coding.planning.decide-scope-and-stop-conditions`
  - `agentic-coding.planning.plan-sufficient-evidence`
  - `agentic-coding.implementation.make-recovery-behavior-explicit`
  - `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`
  - `agentic-coding.testing.justify-regression-protection`
- finalIds：
  - `agentic-coding.verification.close-or-declare-evidence-gaps`
  - `agentic-coding.requirements.ground-user-goal`
  - `agentic-coding.verification.map-evidence-to-acceptance`
  - `react.server.no-module-request-state`
  - `agentic-coding.testing.classify-failure-before-changing-test`

### Core 已进入 candidate、但未进入 final top-5

| case | core | candidate rank |
| --- | --- | --- |
| `agentic-goal-paraphrase` | `agentic-coding.requirements.ground-user-goal` | 7 |
| `agentic-proportionate-validation` | `agentic-coding.planning.scale-work-to-risk-and-cost` | 13 |
| `agentic-reuse-before-build` | `agentic-coding.implementation.inspect-and-reuse-existing-capability` | 7 |
| `agentic-limit-investigation` | `agentic-coding.implementation.limit-investigation-to-current-decision` | 6 |
| `agentic-review-finding` | `agentic-coding.review.validate-findings-before-action` | 9 |
| `agentic-supported-claim` | `agentic-coding.delivery.claim-only-supported-outcome` | 6 |
| `issue-pr-readback-pack-context` | `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review` | 9 |

候选与最终名单：

`agentic-goal-paraphrase`

- candidateIds：`issue-pr-etiquette.issue.converge-on-one-problem-with-testable-acceptance-criteria`, `agentic-coding.verification.close-or-declare-evidence-gaps`, `agentic-coding.planning.plan-sufficient-evidence`, `agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.planning.map-plan-to-user-capability`, `agentic-coding.planning.derive-committed-set-from-concerns`, `agentic-coding.requirements.ground-user-goal`, `agentic-coding.implementation.surface-unconfirmed-assumptions`, `pack-creator.authoring.use-realistic-failure-mechanisms`, `agentic-coding.implementation.make-recovery-behavior-explicit`, `agentic-coding.testing.justify-regression-protection`, `agentic-coding.implementation.replan-on-material-drift`, `agentic-coding.requirements.resolve-source-authority`, `agentic-coding.planning.keep-acceptance-path-completable`, `agentic-coding.planning.scale-work-to-risk-and-cost`, `agentic-coding.testing.assert-observable-behavior`, `agentic-coding.correction.restore-authoritative-baseline`, `issue-pr-etiquette.issue.separate-direction-from-design-and-state-non-goals`, `agentic-coding.implementation.choose-smallest-sufficient-design`, `pack-creator.authoring.give-anti-pattern-and-example-distinct-jobs`
- finalIds：`issue-pr-etiquette.issue.converge-on-one-problem-with-testable-acceptance-criteria`, `agentic-coding.verification.close-or-declare-evidence-gaps`, `agentic-coding.planning.plan-sufficient-evidence`, `agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.planning.map-plan-to-user-capability`

`agentic-proportionate-validation`

- candidateIds：`agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.verification.bind-evidence-to-artifact-state`, `agentic-coding.review.run-subtractive-review-before-commit`, `agentic-coding.planning.plan-sufficient-evidence`, `pack-creator.evaluation.separate-structural-and-semantic-evidence`, `pack-creator.evaluation.verify-project-local-pack-activation`, `agentic-coding.verification.close-or-declare-evidence-gaps`, `react.rendering.derive-dont-mirror`, `pack-creator.evaluation.verify-resource-integrity-without-overclaiming`, `agentic-coding.testing.assert-observable-behavior`, `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`, `pack-creator.evaluation.test-retrieval-with-contrasting-queries`, `agentic-coding.planning.scale-work-to-risk-and-cost`, `agentic-coding.testing.anchor-tests-to-requirements`, `agentic-coding.testing.classify-failure-before-changing-test`, `pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `react.bundle.preload-on-intent`, `agentic-coding.delivery.claim-only-supported-outcome`, `agentic-coding.implementation.validate-at-the-owning-boundary`, `agentic-coding.implementation.replan-on-material-drift`
- finalIds：`agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.verification.bind-evidence-to-artifact-state`, `agentic-coding.review.run-subtractive-review-before-commit`, `agentic-coding.planning.plan-sufficient-evidence`, `pack-creator.evaluation.separate-structural-and-semantic-evidence`

`agentic-reuse-before-build`

- candidateIds：`issue-pr-etiquette.pull-request.title-and-commit-conventionally`, `pack-creator.authoring.create-a-project-local-pack`, `pack-creator.discovery.choose-project-local-or-registry-release`, `issue-pr-etiquette.pull-request.match-the-change-to-the-required-upstream-gate`, `pack-creator.release.preserve-versioned-content-and-provenance`, `issue-pr-etiquette.issue.converge-on-one-problem-with-testable-acceptance-criteria`, `agentic-coding.implementation.inspect-and-reuse-existing-capability`, `pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`, `agentic-coding.testing.justify-regression-protection`, `agentic-coding.review.run-subtractive-review-before-commit`, `pack-creator.authoring.write-concrete-guidance-and-stop-condition`, `pack-creator.design.compose-inherited-project-layers`, `issue-pr-etiquette.pull-request.keep-one-pr-to-one-declared-scope`, `pack-creator.authoring.use-realistic-failure-mechanisms`, `agentic-coding.verification.bind-evidence-to-artifact-state`, `pack-creator.authoring.choose-reference-asset-or-script`, `agentic-coding.requirements.define-acceptance-and-non-goals`, `issue-pr-etiquette.communication.write-in-the-repos-collaboration-language-with-clean-markdown`
- finalIds：`issue-pr-etiquette.pull-request.title-and-commit-conventionally`, `pack-creator.authoring.create-a-project-local-pack`, `pack-creator.discovery.choose-project-local-or-registry-release`, `issue-pr-etiquette.pull-request.match-the-change-to-the-required-upstream-gate`, `pack-creator.release.preserve-versioned-content-and-provenance`

`agentic-limit-investigation`

- candidateIds：`pack-creator.design.separate-neighboring-triggers`, `pack-creator.design.decompose-one-decision-per-practice`, `agentic-coding.requirements.resolve-source-authority`, `issue-pr-etiquette.pull-request.keep-one-pr-to-one-declared-scope`, `pack-creator.review.run-subtractive-content-review`, `agentic-coding.implementation.limit-investigation-to-current-decision`, `pack-creator.authoring.link-pack-resources-from-the-practice`, `issue-pr-etiquette.pull-request.title-and-commit-conventionally`, `agentic-coding.context.give-delegated-agents-decision-context`, `pack-creator.discovery.define-pack-decision-outcome`, `agentic-coding.review.run-subtractive-review-before-commit`, `pack-creator.authoring.write-discriminating-applies-when`, `agentic-coding.planning.derive-committed-set-from-concerns`, `pack-creator.design.keep-each-practice-standalone`, `pack-creator.authoring.choose-reference-asset-or-script`, `agentic-coding.recovery.validate-handoff-before-continuation`, `pack-creator.authoring.write-concrete-guidance-and-stop-condition`, `pack-creator.discovery.identify-retrieval-moments`, `agentic-coding.implementation.preserve-responsibility-boundaries`, `agentic-coding.implementation.replan-on-material-drift`
- finalIds：`pack-creator.design.separate-neighboring-triggers`, `pack-creator.design.decompose-one-decision-per-practice`, `agentic-coding.requirements.resolve-source-authority`, `issue-pr-etiquette.pull-request.keep-one-pr-to-one-declared-scope`, `pack-creator.review.run-subtractive-content-review`

`agentic-review-finding`

- candidateIds：`agentic-coding.implementation.replan-on-material-drift`, `agentic-coding.testing.classify-failure-before-changing-test`, `agentic-coding.review.run-subtractive-review-before-commit`, `agentic-coding.planning.scale-work-to-risk-and-cost`, `agentic-coding.implementation.surface-unconfirmed-assumptions`, `agentic-coding.recovery.validate-handoff-before-continuation`, `agentic-coding.verification.bind-evidence-to-artifact-state`, `issue-pr-etiquette.pull-request.match-the-change-to-the-required-upstream-gate`, `agentic-coding.review.validate-findings-before-action`, `agentic-coding.correction.restore-authoritative-baseline`, `agentic-coding.implementation.limit-investigation-to-current-decision`, `agentic-coding.implementation.inspect-and-reuse-existing-capability`, `agentic-coding.delivery.report-material-residuals`, `agentic-coding.requirements.resolve-source-authority`, `agentic-coding.testing.justify-regression-protection`, `agentic-coding.testing.anchor-tests-to-requirements`, `agentic-coding.implementation.confirm-product-surface-expansion`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `agentic-coding.context.give-delegated-agents-decision-context`
- finalIds：`agentic-coding.implementation.replan-on-material-drift`, `agentic-coding.testing.classify-failure-before-changing-test`, `agentic-coding.review.run-subtractive-review-before-commit`, `agentic-coding.planning.scale-work-to-risk-and-cost`, `agentic-coding.implementation.surface-unconfirmed-assumptions`

`agentic-supported-claim`

- candidateIds：`agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.implementation.confirm-product-surface-expansion`, `pack-creator.evaluation.verify-project-local-pack-activation`, `agentic-coding.review.validate-findings-before-action`, `react.server.authorize-server-actions`, `agentic-coding.delivery.claim-only-supported-outcome`, `pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `agentic-coding.testing.classify-failure-before-changing-test`, `pack-creator.evaluation.verify-resource-integrity-without-overclaiming`, `pack-creator.evaluation.separate-structural-and-semantic-evidence`, `agentic-coding.testing.assert-observable-behavior`, `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`, `agentic-coding.recovery.validate-handoff-before-continuation`, `agentic-coding.testing.anchor-tests-to-requirements`, `agentic-coding.implementation.validate-at-the-owning-boundary`, `agentic-coding.implementation.inspect-and-reuse-existing-capability`, `agentic-coding.testing.justify-regression-protection`, `agentic-coding.verification.bind-evidence-to-artifact-state`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `agentic-coding.requirements.define-acceptance-and-non-goals`
- finalIds：`agentic-coding.verification.map-evidence-to-acceptance`, `agentic-coding.implementation.confirm-product-surface-expansion`, `pack-creator.evaluation.verify-project-local-pack-activation`, `agentic-coding.review.validate-findings-before-action`, `react.server.authorize-server-actions`

### Scope error

`issue-pr-body-scope-conflict`

- core：`issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`，final rank 2。
- forbidden：`react.server.request-dedup-cache`，final rank 1；forbidden 排在 core 之前，形成 scope error。
- candidateIds：`react.server.request-dedup-cache`, `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `react.server.no-module-request-state`, `issue-pr-etiquette.review.address-feedback-with-new-commits-and-freeze-during-review`, `react.rendering.hydration-consistency`, `agentic-coding.review.run-subtractive-review-before-commit`, `issue-pr-etiquette.pull-request.match-the-change-to-the-required-upstream-gate`, `issue-pr-etiquette.pull-request.keep-one-pr-to-one-declared-scope`, `react.state.ref-for-nonrendered-values`, `agentic-coding.context.write-decision-dense-checkpoint`, `react.state.share-one-owner`, `issue-pr-etiquette.pull-request.title-and-commit-conventionally`, `react.async.suspense-boundary-scope`, `agentic-coding.implementation.limit-investigation-to-current-decision`, `react.rendering.update-priority`, `agentic-coding.context.give-delegated-agents-decision-context`, `react.rendering.resource-hints-scripts`, `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`, `pack-creator.review.run-subtractive-content-review`
- finalIds：`react.server.request-dedup-cache`, `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `react.server.no-module-request-state`, `issue-pr-etiquette.review.address-feedback-with-new-commits-and-freeze-during-review`

`issue-pr-readback-pack-context`

- core：`issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`，candidate rank 9，未进入 final top-5。
- forbidden：`pack-creator.release.preserve-versioned-content-and-provenance`，final rank 4，形成 scope error。
- candidateIds：`pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `issue-pr-etiquette.communication.write-in-the-repos-collaboration-language-with-clean-markdown`, `pack-creator.review.run-subtractive-content-review`, `pack-creator.release.preserve-versioned-content-and-provenance`, `pack-creator.discovery.define-pack-decision-outcome`, `pack-creator.discovery.choose-project-local-or-registry-release`, `pack-creator.authoring.link-pack-resources-from-the-practice`, `pack-creator.evaluation.verify-resource-integrity-without-overclaiming`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `pack-creator.authoring.create-a-project-local-pack`, `pack-creator.evaluation.separate-structural-and-semantic-evidence`, `issue-pr-etiquette.pull-request.title-and-commit-conventionally`, `pack-creator.authoring.write-concrete-guidance-and-stop-condition`, `pack-creator.authoring.use-realistic-failure-mechanisms`, `pack-creator.evaluation.verify-project-local-pack-activation`, `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `agentic-coding.recovery.reground-after-context-loss`, `pack-creator.discovery.identify-retrieval-moments`, `issue-pr-etiquette.pull-request.keep-secrets-and-private-material-out-of-the-diff`, `pack-creator.authoring.choose-reference-asset-or-script`
- finalIds：`pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `issue-pr-etiquette.communication.write-in-the-repos-collaboration-language-with-clean-markdown`, `pack-creator.review.run-subtractive-content-review`, `pack-creator.release.preserve-versioned-content-and-provenance`, `pack-creator.discovery.define-pack-decision-outcome`

## 候选 build 对比（Lorelum Issue #236）

baseline 冻结后，主仓库交付只改 Engine 最终排序的 build `09e64be914dc93124230f06483c8dfc4c164a61a`（排序本体是父提交 `63ec664`）。按 design 第 6 条，本轮比较只更换预先声明的 Lorelum build：v2 revision、corpus、Profile、model/native runtime、N=20/K=5、scorer 与既有 baseline record 全部保持不变。

- candidate record：`results/records/retrieval-ranking-v2-candidate-09e64be.json`
- candidate artifact：`artifacts/retrieval-ranking/retrieval-ranking-v2-candidate-09e64be.json`，SHA-256 `3420b8048233d15184db1e5a06bf641f4ec356d2385de8d48a619ed60523343e`
- replay record：`results/records/retrieval-ranking-v2-candidate-09e64be-replay.json`
- replay artifact：`artifacts/retrieval-ranking/retrieval-ranking-v2-candidate-09e64be-replay.json`，SHA-256 `09b29632b76358700886f35d6417a223b010a5a101a6cacea276878b7459c252`

两次运行的 `case_count` 都是 50、`successful_case_count` 都是 50、`failure_count` 都是 0、`retrieval_scored` 都是 true；50 条 case 的 `candidateIds`、`finalIds` 与 score 完全一致，没有运行、协议、Profile、index 或 setup 失败。

### 语料与索引身份

候选 build 使用自己的 test-owned Store/cache 从同一固定 Pack 快照独立重建语料与 semantic index，产出的 derived artifact 仍是 `c8f271b7ef3eba96cbc18578a4a0d030a9a470a757b1e5a59b48b26afe93bab7`，与 baseline 相同；两次候选运行也都是该 artifact。因此这次差异只来自最终排序，不含 embedding 模型、semantic projection、index schema 或 Profile identity 变化。

### 汇总对比

| 指标 | baseline `caecc53` | candidate `09e64be` | 变化 |
| --- | --- | --- | --- |
| core candidate recall | 49/50 = 0.98 | 49/50 = 0.98 | 不变 |
| core final top-5 hit | 42/50 = 0.84 | 48/50 = 0.96 | +6 |
| candidate miss | 1 | 1 | 不变 |
| final-ranking miss | 7 | 1 | −6 |
| scope error case | 2 | 2 | 不变 |
| forbidden 出现在 final top-5 | 2 | 2 | 不变 |
| forbidden 排在 core 之前 | 2 | 0 | −2 |
| 运行 / 协议失败 | 0 | 0 | 不变 |

这组数字只适用于本 change 冻结的 revision、corpus、Profile 和 N/K；它不测量编码 Agent 效果，也不声明全局生产准确率。baseline 的 42 个 final top-5 命中没有一个在本轮丢失：逐例比对没有 case 的 core final 命中数下降。

### core 从 final-ranking miss 变为 final-hit（6 例）

| case | core | baseline candidate rank | baseline final | candidate candidate rank | candidate final rank |
| --- | --- | --- | --- | --- | --- |
| `agentic-goal-paraphrase` | `agentic-coding.requirements.ground-user-goal` | 7 | miss | 2 | 2 |
| `agentic-proportionate-validation` | `agentic-coding.planning.scale-work-to-risk-and-cost` | 13 | miss | 3 | 3 |
| `agentic-reuse-before-build` | `agentic-coding.implementation.inspect-and-reuse-existing-capability` | 7 | miss | 1 | 1 |
| `agentic-review-finding` | `agentic-coding.review.validate-findings-before-action` | 9 | miss | 3 | 3 |
| `agentic-supported-claim` | `agentic-coding.delivery.claim-only-supported-outcome` | 6 | miss | 1 | 1 |
| `issue-pr-readback-pack-context` | `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review` | 9 | miss | 2 | 2 |

### 仍是 candidate miss（1 例）

`agentic-acceptance-direct`：core `agentic-coding.requirements.define-acceptance-and-non-goals` 在 baseline 和 candidate 两次运行中都不在 20 条 `candidateIds` 中。它是 candidate pool 问题，本轮 final 排序变化不能修复。

### 仍是 final-ranking miss（1 例）

`agentic-limit-investigation`：core `agentic-coding.implementation.limit-investigation-to-current-decision`，baseline candidate rank 6、未进入 final top-5；candidate candidate rank 11、仍未进入 final top-5。命中状态未变，但候选名次比 baseline 更低，如实保留为未解决且局部变差的案例。

### scope error 的变化

两例 forbidden 仍出现在 final top-5，但相对顺序都从「forbidden 排在 core 之前」变为「core 排在 forbidden 之前」，因此 forbidden-before-core 计数从 2 降到 0。

`issue-pr-body-scope-conflict`

- core `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`：final rank 2 → 1。
- forbidden `react.server.request-dedup-cache`：final rank 1 → 2。
- baseline finalIds：`react.server.request-dedup-cache`, `issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `react.server.no-module-request-state`, `issue-pr-etiquette.review.address-feedback-with-new-commits-and-freeze-during-review`
- candidate finalIds：`issue-pr-etiquette.pull-request.write-the-pr-body-for-a-cold-reviewer`, `react.server.request-dedup-cache`, `issue-pr-etiquette.review.address-feedback-with-new-commits-and-freeze-during-review`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `react.server.no-module-request-state`

`issue-pr-readback-pack-context`

- core `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`：candidate rank 9、final 无 → candidate rank 2、final rank 2。
- forbidden `pack-creator.release.preserve-versioned-content-and-provenance`：final rank 4 → 4，仍构成 scope error，但已在 core 之后。
- candidate finalIds：`issue-pr-etiquette.communication.write-in-the-repos-collaboration-language-with-clean-markdown`, `issue-pr-etiquette.communication.read-back-your-post-before-requesting-review`, `pack-creator.release.verify-the-supported-install-path-before-claiming-release`, `pack-creator.release.preserve-versioned-content-and-provenance`, `pack-creator.review.run-subtractive-content-review`

### 未改变 top-5 命中、但 final 名次变化（诊断，12 例）

这些 case 的 core 在 baseline 和 candidate 都进入 final top-5，只是位置移动，命中数不变；它们是诊断信号，不构成失败：

`agentic-scope-direct` 4→2、`agentic-scope-paraphrase` 4→2、`agentic-shared-rule-owner` 4→2、`agentic-temporary-assumption` 4→1、`agentic-validate-handoff` 5→4、`issue-pr-one-scope` 2→1、`pack-creator-neighbor-boundary` 2→1、`react-derive-not-mirror` 5→4、`agentic-evidence-plan` 2→5、`agentic-tests-from-acceptance` 2→5、`agentic-declare-gap` 3→4、`issue-pr-upstream-gate-scope-conflict` 2→3。

未标注的近邻 Practice 仍出现在全部 50 例的 final top-5 中；按 scorer 规则这是诊断信息，不计为错误，本 track 不要求 top-5 只包含 core 或已标注 ID。

## 验证命令

- `bun test src/benchmark/retrieval-ranking`：26 pass / 0 fail。
- `bun run validate`：通过；同时验证历史 v1 failed record、v2 baseline/replay 以及 v2 candidate/replay 与当前 revision 文件的绑定。
- core contract group：169 pass / 0 fail。
- `bun run test:contracts:runner`：138 pass / 0 fail。
- `bunx openspec validate retrieval-ranking-benchmark --type change --strict --json`：通过。
- `git diff --check`：通过。
- setup failure 回归测试覆盖 `prepare-store` 与 `create-client` reject：都生成 `failed` artifact/record，`retrieval_scored=false`，且不含部分候选名单。
- candidate 与 replay 用各自 test-owned Store/cache、同一 `--lorelum-commit 09e64be914dc93124230f06483c8dfc4c164a61a` 运行，逐例 `candidateIds`、`finalIds` 与 score 一致；artifact SHA-256 由 runner 记录并由独立 `Get-FileHash` 复核。

执行结果见 PR #223 正文和 CI；baseline 记录只在上述完整 batch 成功、失败数为 0 且 replay 逐例一致后冻结，candidate/replay 记录同样在完整 batch、失败数为 0 且逐例一致后才计入对比。

## 结论边界

- candidate build 让 core final top-5 hit 从 42/50 变为 48/50、forbidden-before-core 从 2 变为 0，且没有丢失任何 baseline 命中；这些是冻结 revision 上的相对结果，不是全局生产准确率，也不是下游 Agent 效果。
- 仍未解决的是 `agentic-acceptance-direct`（candidate miss，属于持久化/候选生成问题）和 `agentic-limit-investigation`（final-ranking miss，本轮候选名次反而更低）。
- 本 change 只记录对比证据；主仓库之后的检索改动必须再声明新 build 并重复同一条件，不得改写这两条 candidate record。
