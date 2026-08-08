# login-page-judge-rubric Specification

## Purpose

Define the versioned login-page JudgeAgent rubric and its offline calibration
(issue #136): path-independent quality dimensions (API/page responsibility
boundary, state handling, form experience, UI/UX), public-only judge input,
a private calibration matrix with reference / responsibilities-equivalent /
anti-pattern / boundary fixtures, and provenance and reporting rules for
judge-unavailable, low confidence, and score disagreement. Judge results are
soft quality signals only and never change semantic completion.
## Requirements
### Requirement: Versioned login-page rubric with path-independent dimensions

The login-page JudgeAgent rubric MUST be a versioned artifact referenced by an
independent rubric hash, and MUST define quality dimensions with max points
covering API/page responsibility boundary, state handling, form experience, and
UI/UX. Dimension descriptions MUST be expressed in terms of structural features
and observable behavior, and MUST NOT depend on specific filenames, directory
layouts, or helper names.

#### Scenario: Equivalent implementation judged consistently
- **WHEN** the rubric is applied to a responsibilities-equivalent implementation with different naming and directory layout
- **THEN** the same dimensions apply and its judgment stays within the calibrated tolerance of the reference

#### Scenario: Rubric has no path or helper binding
- **WHEN** a maintainer inspects the rubric artifact
- **THEN** it contains no fixed file paths, directory layouts, or helper names as scoring requirements

### Requirement: Judge input is limited to declared public material

The login-page judge input MUST contain only the public task card, public
starter, candidate diff or source snapshot, and explicitly declared public run
materials. It MUST NOT contain condition identifiers, Practice text, Oracle
content, or private evaluator material. Input construction MUST reuse the
repo-level allowlist and fail closed on any private marker.

#### Scenario: Redaction audit passes
- **WHEN** the judge input bundle is built from public-only material
- **THEN** a redaction audit asserts it contains no condition, Practice, Oracle, or private evaluator markers and all paths resolve under a public root

#### Scenario: Private material rejected
- **WHEN** an input candidate contains a private path or private marker
- **THEN** the constructor rejects it with a redacted reason and no provider call is made

### Requirement: Offline calibration matrix proves discrimination

The change MUST provide a private calibration matrix with reference,
responsibilities-equivalent (different naming and directory), anti-pattern, and
boundary samples. Reference and equivalent implementations MUST receive similar
judgments within a calibrated tolerance; the anti-pattern MUST receive an
explainable lower score. Calibration MUST run offline with the deterministic
mock provider and MUST NOT call a real model. Anchor-score instability MUST mark
the rubric for revision and MUST NOT enter a pilot.

#### Scenario: Reference and equivalent within tolerance
- **WHEN** the calibration matrix runs reference and equivalent fixtures
- **THEN** both are judged within the recorded tolerance and the difference is explainable

#### Scenario: Anti-pattern scores lower
- **WHEN** the anti-pattern fixture is judged
- **THEN** it receives an explainable lower score with a rationale, without changing semantic completion

#### Scenario: Anchor instability blocks pilot
- **WHEN** anchor scores are unstable across runs
- **THEN** the rubric is marked for revision and is not used to enter a pilot

### Requirement: Provenance pinning and repetition strategy

Each judge run for the login-page rubric MUST pin the rubric hash, input hash,
judge model and version, and the scoring repetition strategy (single score,
median of multiple scores, or a fixed small panel). Results MUST conform to the
`judge-result/v1` sidecar with complete provenance.

#### Scenario: Complete provenance result
- **WHEN** a provider returns a login-page judge result
- **THEN** it validates against `judge-result/v1` with rubric hash, input hash, judge identity, and the chosen repetition strategy recorded

### Requirement: Distinct reporting of unavailable, low confidence, and disagreement

`judge-unavailable` MUST be reported distinctly from `not-observed`.
Low-confidence scores and score disagreement across repetitions MUST be recorded
with a reason and per-repetition scores, and MUST NOT change the semantic hard
gate or `evaluator-result/v2`.

#### Scenario: Judge unavailable with semantic pass
- **WHEN** the judge provider is unavailable for a semantically passing run
- **THEN** the run reports `judge-unavailable` and keeps task completion passed

#### Scenario: Score disagreement recorded
- **WHEN** repeated judgments diverge beyond the recorded threshold
- **THEN** the sidecar records the disagreement with a reason and per-repetition scores, without fabricating a low score
