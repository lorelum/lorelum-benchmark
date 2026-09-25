# Retrieval ranking baseline verification

## 冻结对象与证据位置

- benchmark revision：`retrieval-ranking/v1`，N=20、K=5。
- 正式 baseline record：`results/records/retrieval-ranking-v1-baseline-caecc53.json`。
- 独立 replay record：`results/records/retrieval-ranking-v1-baseline-caecc53-replay.json`。
- baseline result artifact：`artifacts/retrieval-ranking/retrieval-ranking-v1-baseline-caecc53.json`，SHA-256 `74636841baaf9ea0118ff863fc3ce6441d0d0d50df78ecc6afc58be5450f3790`。
- replay result artifact：`artifacts/retrieval-ranking/retrieval-ranking-v1-baseline-caecc53-replay.json`，SHA-256 `891d5f157e6ead9cf645630403d16e95623f4c6c0836e718d31e18a45a583034`。
- `artifacts/` 按仓库规则忽略；Git 中的 record 保存 artifact 路径与 SHA-256。逐例 `candidateIds`、`finalIds` 和 scorer 原始证据在 result artifact 中；本文件保留失败案例的完整名单与全部 case 汇总。

两次运行的 `case_count` 都是 50、`successful_case_count` 都是 50、`failure_count` 都是 0、`retrieval_scored` 都是 true。50 条 case 的 `candidateIds`、`finalIds` 与 score 完全一致；artifact hash 不同只因 `runId` 和运行时间等运行身份字段不同。

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

## 验证命令

- `bun test src/benchmark/retrieval-ranking`
- `bun run validate`
- `bunx openspec validate retrieval-ranking-benchmark --type change --strict --json`
- `git diff --check`

执行结果见 PR #223 正文和 CI；baseline 记录只在上述完整 batch 成功、失败数为 0 且 replay 逐例一致后冻结。
