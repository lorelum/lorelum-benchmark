# login-page-judge-provider Specification

## Purpose
TBD - created by archiving change login-page-judge-provider. Update Purpose after archive.
## Requirements
### Requirement: Runner selects a candidate-declared deterministic judge provider
The diagnostic runner MUST resolve the judge provider declared by the candidate
(`conditions.yaml` `shared_execution.judge.provider`). When no provider is
declared, the runner MUST record each evaluated attempt's judge entry as
`not-run` with a reason and MUST NOT write a sidecar or fabricate mock scores.
The provider MUST be deterministic (no model call) and MUST return a
`judge-result/v1` sidecar validated by `assertJudgeResultV1`.

#### Scenario: Candidate declares practice-layered-api/v2
- **WHEN** a candidate declares `judge.provider: practice-layered-api/v2`
- **THEN** each evaluated attempt produces a `judge.sidecar.json` bound to the v2
  rubric hash with criterion-level results

#### Scenario: No provider declared
- **WHEN** a candidate does not declare a judge provider
- **THEN** each evaluated attempt's judge entry is `not-run` (with a reason) and
  no `judge.sidecar.json` is written

### Requirement: SourceMap construction is deterministic
The judge input SourceMap MUST be constructed from the candidate workspace/app by
collecting every file except generated directories (node_modules, dist,
test-results, playwright-report, .git, .vite, .practice-runtime, .run-workspaces,
logs), keyed by normalized relative path and sorted lexicographically. The same
workspace MUST produce the identical SourceMap and candidate_diff regardless of
file traversal order.

#### Scenario: File ordering does not change the input
- **WHEN** the same candidate workspace is enumerated in different orders
- **THEN** the constructed SourceMap, candidate_diff, and input_hash are identical

### Requirement: Judge sidecar and redacted summary per attempt
Each evaluated attempt MUST write `judge.sidecar.json` (full `judge-result/v1`)
and the diagnostic summary MUST include only redacted judge fields: judge id and
version, state, score, criteria, rubric_hash, input_hash, confidence, and reason.
Raw candidate source, private material, and the injected convention text MUST
NOT appear in the sidecar or summary.

#### Scenario: Redacted sidecar
- **WHEN** the runner records the judge result
- **THEN** the sidecar carries hashes and scores only, with no private markers or
  raw source

### Requirement: Indeterminate attempts stay in the denominator with a budget
Indeterminate judge attempts MUST remain in the judge-channel denominator (not
silently dropped). The judge-channel denominator is the set of evaluated attempts
that produced a judge record; semantic-fail attempts produce no judge record and
are not in the judge denominator (joint_pass semantics already excludes them from
quality reads). A candidate MAY declare a judge indeterminate budget (default
0.25); if a condition's indeterminate rate (indeterminate divided by judged
attempts) exceeds the budget, the judge channel for that candidate MUST be
reported as diagnostic-only.

#### Scenario: Indeterminate rate exceeds budget
- **WHEN** more than the declared budget of a condition's judged attempts are
  judge-indeterminate
- **THEN** the candidate's judge channel is reported diagnostic-only and the
  indeterminate count stays in the denominator

### Requirement: Frozen plan binds rubric hash, criterion table, and repetitions
Any frozen plan that selects the v2 judge MUST declare the v2 rubric hash, the
indeterminate handling, the criterion-level result table, and the repetition
count, and MUST interpret the baseline distribution before drawing conclusions.

#### Scenario: Frozen plan declares the v2 protocol
- **WHEN** a re-test pilot plan selects `practice-layered-api/v2`
- **THEN** the plan declares the rubric hash, indeterminate budget, criterion
  table, and repetitions

