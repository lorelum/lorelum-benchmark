## 0. Planning Gate

- [x] 0.1 After this initial PR passes strict validation, confirm the kernel architecture, profile naming,
  core scope, artifact rule, documentation carrier, track key and verification fixture with the requirements
  owner; answers written to Issue #98 and this design/tasks.
  - 架构：分层 core + profile。
  - profile 命名：按 condition 模型名（injection-calibration、	reatment-comparison）。
  - 首版 core 范围：预留 materializer_kind，首版实现 eact-vite。
  - 文档载体：新建 docs/KERNEL.md。
  - 生成物规范：core 强制 starter 只提交 manifest+lockfile+源码。
  - 轨道区分依据：kernel.profile 字段。
  - 首版验证 fixture：中性 contract fixture。
- [x] 0.2 Confirm #98 scope split: repo-level kernel stays in #98; practice track-specific content moves
  to a new issue and the practice-injection-candidate-expansion change.

## 1. Core v1 And Materializer

- [ ] 1.1 Add src/benchmark/kernel/core/v1/ types with materializer_kind, materialize/isolate/hash/
  calibrate contracts. Core MUST NOT interpret domain fields. [Write scope: src/benchmark/]
- [ ] 1.2 Implement eact-vite/v1 materializer producing a runnable workspace (incl. un install) from
  declared starter source + lockfile. [Write scope: src/benchmark/]
- [ ] 1.3 Add focused materialization and public/private leakage tests, including private-path traversal
  rejection and generated-output exclusion from the repo starter. [Write scope: src/benchmark/]

## 2. Calibration And Snapshot

- [ ] 2.1 Add the shared, candidate-declared offline calibration entry point that reports candidate-owned
  semantic and quality-probe outcomes without interpreting domain rules. [Write scope: src/benchmark/]
- [ ] 2.2 Add the resolved candidate/workspace snapshot contract binding core version/hash, profile
  declaration, materializer_kind, input hashes and materialized public output hashes; preserve existing
  suite and #75 snapshot behavior. [Write scope: src/benchmark/]
- [ ] 2.3 Add focused calibration and snapshot tests for source changes, resolved-output changes,
  generated-output exclusions, public/private isolation, and frozen-task immutability. [Write scope:
  src/benchmark/]

## 3. Profile Contracts And Documentation

- [ ] 3.1 Define injection-calibration/v1 and 	reatment-comparison/v1 profile contract types (contract
  only; do not migrate frozen tasks). [Write scope: src/benchmark/]
- [ ] 3.2 Author a neutral contract fixture (no Practice/Skill domain semantics) validating the full core
  chain: materialize -> isolate -> hash -> calibrate. [Write scope: src/benchmark/]
- [ ] 3.3 Create docs/KERNEL.md with versioning system, compatibility matrix, artifact rule and usage
  guide (track key, author workflow, selection decision tree, reader reproduction). [Write scope: docs/]

## 4. Validation And Handoff

- [ ] 4.1 Run un run validate, focused tests and strict OpenSpec validation; document evidence and
  non-executed model boundaries in PR #99.
- [ ] 4.2 After #98 merges, the practice-injection-candidate-expansion change rebases onto the merged
  contract to migrate #89 candidates and clean committed generated output. Do not invoke Pi, a model
  provider, retrieval, or create records in this change.