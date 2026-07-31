## ADDED Requirements

### Requirement: Candidate repair classifies failures without private leakage

The repair workflow MUST reproduce the project-directory candidate failure in a clean candidate-scoped workspace and classify it as a public candidate behavior mismatch, evaluator-process contract failure, or probe/calibration failure. It MUST report only stable redacted categories, input identities, and pass/fail states; it MUST NOT expose Practice text, oracle material, private evaluator output, fixture content, or private paths.

#### Scenario: Nonzero evaluator exit is preserved as non-healthy
- **WHEN** the evaluator emits structured text and exits nonzero
- **THEN** the workflow records a non-healthy evaluator category and does not use the structured fields as condition-comparison evidence

### Requirement: Repair preserves the declared public task and treatment boundary

The repair MUST preserve the public project-directory task behavior and the existing relevant/irrelevant Practice pair, condition channels, and decision-rule meaning. A repair MAY change candidate-scoped implementation or private evaluation only when focused calibration proves that responsibility-equivalent implementations are accepted and declared anti-patterns are rejected.

#### Scenario: Evaluator repair accepts equivalent responsibility
- **WHEN** a private evaluator/probe assertion is changed
- **THEN** the reference and responsibility-equivalent calibration fixtures pass while the declared anti-pattern fixture fails

### Requirement: Repaired candidate receives new immutable identities

After a repair that changes candidate source, evaluator, calibration, or runtime inputs, the workflow MUST regenerate the candidate snapshot and create a new immutable execution-plan identity. It MUST NOT overwrite prior plans, snapshots, scratch results, or combine pre-repair and post-repair attempts.

#### Scenario: Repaired candidate re-enters a diagnostic gate
- **WHEN** all calibration, closure, and leakage checks pass for the repaired candidate
- **THEN** a new plan identity may run one redacted three-condition gate using the repaired snapshot and report diagnostic-only status
