# practice-observation-diagnostics Specification

## Purpose
TBD - created by archiving change practice-observation-contract. Update Purpose after archive.
## Requirements
### Requirement: Profile diagnostics retain independent semantic, Practice, and health results
The profile diagnostic runner MUST retain semantic outcome, Practice
observation, and evaluator/execution health as independent result dimensions.
Semantic outcome MUST be one of `pass`, `fail`, or `not-run`. Practice
observation MUST be one of `observed`, `not-observed`, `indeterminate`, or
`not-run`. Evaluator/execution health MUST be represented independently by
`evaluated`, `invalid-output`, `execution-failed`, or `not-executable`.

The runner MUST mark a record `evaluated` when it receives a valid structured
evaluator result, regardless of semantic or Practice observation value. It MUST
NOT derive evaluator health from a Practice observation. `joint_pass`, if
reported, MUST be derived as semantic `pass` and Practice `observed`; it MUST
NOT be a task-completion, evaluator-health, or weighted-score field.

#### Scenario: Semantic completion without observed Practice evidence
- **WHEN** an evaluator emits semantic `pass` and Practice observation `not-observed`
- **THEN** the runner records evaluator health as `evaluated`, preserves both dimensions, and reports derived `joint_pass` as false

#### Scenario: Valid semantic failure
- **WHEN** an evaluator emits semantic `fail` and a valid Practice observation state
- **THEN** the runner records evaluator health as `evaluated` and does not relabel the evaluation as an evaluator failure

#### Scenario: Missing structured evaluator result
- **WHEN** evaluator execution completes without a result satisfying the diagnostic result contract
- **THEN** the runner records evaluator health as `invalid-output` with an audit reason and does not infer any Practice observation

### Requirement: Practice observation distinguishes negative evidence from unsupported classification
A Practice probe MUST emit `not-observed` only when it has calibrated,
candidate-declared evidence of an applicable anti-pattern or absence of the
declared responsibility. It MUST emit `indeterminate` with a stable reason when
it cannot reliably resolve, parse, or classify the relevant implementation.
Unsupported analysis, missing dependencies, and ambiguous module graphs MUST
NOT be encoded as `not-observed`.

#### Scenario: Unsupported import graph
- **WHEN** a probe cannot resolve a relevant relative import using its declared analysis capability
- **THEN** it emits Practice observation `indeterminate` and an audit reason rather than a negative Practice observation

#### Scenario: Calibrated anti-pattern
- **WHEN** a probe identifies the candidate's predeclared anti-pattern through its calibrated evidence
- **THEN** it emits Practice observation `not-observed` without changing semantic completion or evaluator health

### Requirement: Diagnostic summaries report contingency dimensions without a composite score
Profile diagnostic summaries and human-readable result tables MUST separately
report semantic pass, Practice observed, Practice not-observed, Practice
indeterminate, evaluator/execution health, and derived joint pass. They MUST
NOT replace those dimensions with a single Practice score, total score, or
evaluation-failed label.

#### Scenario: Reporting a three-condition diagnostic
- **WHEN** a maintainer reports baseline, relevant-Practice, and irrelevant-Practice diagnostic results
- **THEN** each condition includes independent counts for semantic, every Practice observation state, and joint pass, with no aggregate score claimed as task completion

