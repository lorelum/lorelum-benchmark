## ADDED Requirements

### Requirement: Execution health is an independent outcome dimension

The repository outcome contract MUST represent execution health independently
from semantic completion and quality signals. Execution health MUST be one of
`evaluated` (success), a failure state (`execution-failed`,
`invalid-output`, `not-executable`), or `indeterminate` when the run or
evaluator completion cannot be reliably determined. Health MUST be derived
only from run-link evidence and MUST NOT be inferred from semantic or quality
results.

#### Scenario: Healthy run with semantic failure
- **WHEN** an evaluator process completes successfully and emits a complete structured result with `semantic=fail`
- **THEN** the run records execution health as `evaluated`, semantic completion as failed, and does not relabel the run as an execution failure

#### Scenario: Indeterminate completion
- **WHEN** an evaluator or replay cannot reliably determine whether the run completed (for example a truncated result or unavailable dependency)
- **THEN** the run records execution health as `indeterminate` with a stable audit reason and MUST NOT count the attempt in any pass or observation numerator

#### Scenario: Non-healthy run stays in the planned denominator
- **WHEN** a run is `execution-failed`, `invalid-output`, `not-executable`, or `indeterminate`
- **THEN** the report keeps the attempt in the condition's planned denominator and counts its health state separately without adding it to semantic, quality, or joint-pass numerators

### Requirement: Public product semantics is the only task-completion hard gate

Task completion MUST be determined only by the public-product semantic hard
gate. `semantic=pass` completes the task; `semantic=fail` means the task is
not complete. Quality scores, JudgeAgent results, or Practice quality signals
MUST NOT by themselves flip task completion in either direction.

#### Scenario: Quality score cannot fail a functional task
- **WHEN** a candidate passes all semantic checks but receives a low quality score or a `not-observed` quality signal
- **THEN** the run records semantic completion as passed and reports the quality signal separately without marking the task incomplete

#### Scenario: Semantic failure remains a hard failure
- **WHEN** a candidate fails a public semantic check but receives a high quality score
- **THEN** the run records the task as not complete and MUST NOT use the quality score to mark it complete

### Requirement: JudgeAgent and Practice quality signals are independent soft metrics

Quality signals MUST be reported as an independent dimension with at least the
states `observed`, `not-observed`, `indeterminate`, `not-run`, and
`judge-unavailable`. `judge-unavailable` MUST be distinguished from
`not-observed`: the former means the judging resource did not produce a
signal, the latter means calibrated negative evidence exists. Quality signals
MUST NOT change task completion.

#### Scenario: Judge unavailable
- **WHEN** a JudgeAgent provider is not available or produced no result for an otherwise healthy run
- **THEN** the record reports the quality state as `judge-unavailable` and keeps task completion determined by the semantic hard gate only

#### Scenario: Quality not observed with calibrated evidence
- **WHEN** a probe identifies a candidate-declared anti-pattern or absence of the declared responsibility with calibrated evidence
- **THEN** the record reports quality `not-observed` without changing semantic completion or execution health

### Requirement: joint_pass is a derived reporting field

`joint_pass` MUST be derived only as semantic completion `pass` AND a quality
signal of `observed`. It MUST NOT be an evaluator input, a task-completion
field, an execution-health field, or a weighted total score. Reports MAY
present derived `joint_pass` counts but MUST NOT treat them as raw outcomes.

#### Scenario: Joint pass derives from both dimensions
- **WHEN** a run has `semantic=pass` and quality `observed`
- **THEN** the report derives `joint_pass=true` while retaining the raw semantic and quality fields unchanged

#### Scenario: Quality absent without joint pass
- **WHEN** a run has `semantic=pass` and quality `judge-unavailable`, `not-run`, or `indeterminate`
- **THEN** the report derives `joint_pass=false` and does not claim a quality observation

### Requirement: Raw scores, denominators, and failure reasons are preserved

Evaluator results, summaries, and records MUST preserve raw scores, probe
`points`/`max_points`, planned denominators, and failure reasons. Every `x/y`
value MUST explain its numerator, denominator, and pass meaning. The contract
MUST NOT introduce hidden weighted total scores and MUST NOT silently drop
non-healthy or indeterminate attempts from planned denominators.

#### Scenario: Raw probe scores survive summarization
- **WHEN** a report summarizes a condition with mixed health and quality states
- **THEN** it lists planned counts, evaluated counts, each health state, semantic counts, each quality state, and derived joint-pass counts with original probe values retained

#### Scenario: No hidden weighted total
- **WHEN** a maintainer writes a summary or record
- **THEN** the summary MUST NOT combine semantic, quality, and health dimensions into a single weighted score that hides the raw dimensions

### Requirement: New outcome states require an explicit versioned contract

The repository MUST adopt a new schema version or an independent sidecar
schema whenever `evaluator-result/v2` cannot express a required new outcome
state (for example JudgeAgent availability or soft-score provenance). The repository
MUST NOT silently extend `evaluator-result/v2` with new fields or semantics.
Existing v2 consumers and frozen records MUST remain interpretable.

#### Scenario: JudgeAgent result sidecar
- **WHEN** JudgeAgent results are recorded alongside an `evaluator-result/v2` outcome
- **THEN** the repository uses a separately versioned schema or sidecar (for example `judge-result/v1`) and does not add new fields to `evaluator-result/v2`

#### Scenario: New schema version
- **WHEN** the repository instead chooses a new schema version for the expanded outcome
- **THEN** it creates a new version (for example `evaluator-result/v3`), freezes the previous version, and documents the migration for consumers
