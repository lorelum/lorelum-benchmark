# ci-runtime-modernization Specification

## Purpose

为 Lorelum Benchmark 提供可重建、可审计且不重复消耗资源的 runtime 与 CI 验证边界，同时保证跨平台 snapshot 输入的稳定 identity。

## ADDED Requirements


### Requirement: Exact runtime identity is synchronized

The repository MUST declare and validate one exact baseline runtime for the active development/CI/formal Pi path: Bun `1.4.2`, Node `24.21.0`, and `@earendil-works/pi-coding-agent` `0.85.1`. The package manifest, lockfile, formal image, active environment manifests, docs, and CI assertions MUST agree. Historical incubator condition pins and recorded provenance MUST NOT be rewritten by this change.

#### Scenario: Fresh install resolves the declared runtime

- **WHEN** a clean checkout runs `bun install --frozen-lockfile` and the runtime preflight
- **THEN** dependency resolution succeeds and Bun/Node/Pi report the exact declared versions without a model call

### Requirement: Pull request validation is single-run and cancellable

The fast validation workflow MUST run once for a pull request through `pull_request` and once for a post-merge `main` commit through `push`; feature-branch pushes MUST NOT create a duplicate full validation run. Runs for the same pull request or ref MUST share a concurrency group and cancel superseded runs.

#### Scenario: A commit is pushed to an open pull request

- **WHEN** a commit is pushed to a feature branch with an open pull request
- **THEN** only the pull request validation run is scheduled for that change, and a later commit cancels the earlier same-PR run

### Requirement: CI checks are separated by cost and relevance

Fast CI MUST retain deterministic validation and OpenSpec governance. Runner/coordinator integration, formal container, and realistic repository calibration checks MUST remain available with explicit timeouts and conservative path-trigger rules rather than being deleted or run redundantly for every unrelated PR. Candidate-specific smoke may be added only after the candidate is present in the base branch; this change MUST NOT depend on an unmerged candidate from another PR.

#### Scenario: An unrelated documentation change is submitted

- **WHEN** a PR changes only documentation outside runtime/runner/calibration contracts
- **THEN** fast required validation runs, while unrelated heavy container/calibration workflows do not block the PR

#### Scenario: A runner or formal environment change is submitted

- **WHEN** a PR changes runner, sandbox, environment, package/lockfile, or formal container inputs
- **THEN** the corresponding integration/container validation is scheduled and reports a bounded, diagnosable result

### Requirement: Snapshot identity is stable for declared text line endings

For v1 snapshot file manifests, snapshot generation and verification MUST normalize UTF-8 text line endings to LF before hashing, while preserving raw-byte hashing for binary/invalid UTF-8 files. This scoped behavior MUST NOT change shared exact-byte hashes or v2 byte-level canonical Merkle identity, and MUST preserve public/private exclusion boundaries.

#### Scenario: The same text tree is checked out with different line endings

- **WHEN** equivalent candidate text files contain LF, CRLF, or mixed CRLF/LF line endings under the repository's text policy
- **THEN** v1 snapshot generation produces the same file digests and snapshot ID, and verification succeeds on each representation

#### Scenario: Binary or invalid text is not normalized

- **WHEN** a candidate contains binary bytes or invalid UTF-8 bytes
- **THEN** snapshot hashing uses the original bytes and does not silently transform the input

### Requirement: Process-backed tests are bounded without weakening production budgets

Runner/coordinator black-box tests MUST set explicit test and subprocess budgets large enough for supported CI platforms and MUST retain process-tree termination and cleanup. The test fixture budget MUST NOT alter the production request budget contract or formal experiment policy.

#### Scenario: Windows process startup is slower than the default test timeout

- **WHEN** the process-backed contract fixture runs on Windows with Bun `1.4.2`
- **THEN** the test remains bounded, completes or fails with a diagnostic timeout, and cleans all generated paths without leaving a record
