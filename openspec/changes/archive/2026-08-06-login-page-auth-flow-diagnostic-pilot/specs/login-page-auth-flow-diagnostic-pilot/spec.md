# login-page-auth-flow-diagnostic-pilot Specification

## ADDED Requirements

### Requirement: Frozen three-condition execution plan with identity binding

The diagnostic pilot MUST run the three declared conditions (baseline,
oracle-practice, irrelevant-practice) with the same repetition count, public
starter, model identifier, task prompt, tool policy, and time budget, and with
`lorelum-retrieval` unavailable. The plan MUST be frozen and validated before
execution: candidate source commit, private snapshot, login-page rubric hash,
profile hash, model, prompt hash, budget, and repetitions. Every attempt MUST
record runner and model identity plus the pinned SHA-256 values so results are
traceable.

#### Scenario: Plan is frozen before execution
- **WHEN** the pilot executor starts
- **THEN** it validates source commit, snapshot, rubric hash, profile hash, model, prompt hash, budget, and repetitions before any model call

#### Scenario: All three conditions share the same setup
- **WHEN** an attempt is created for any condition
- **THEN** it uses the same clean workspace template, model, prompt, tool policy, and budget, differing only by the condition-scoped Practice injection

### Requirement: Clean workspace with runtime-only Practice injection

Each attempt MUST use a fresh workspace containing only `public/task.md` and
`public/starter/`. Practice text MUST be injected through a runtime channel
(condition-scoped private system prompt) and MUST NOT be written into the agent
workspace. The pilot MUST NOT materialize private evaluator, oracle, Practice,
calibration, or scoring material into the workspace.

#### Scenario: Private material never reaches the workspace
- **WHEN** the workspace is prepared for an attempt
- **THEN** a public/private audit finds no private, oracle, Practice, calibration, or evaluator content in it

### Requirement: Preflight gates before model and JudgeAgent execution

The pilot MUST run plan dry-run, public/private audit, runner/evaluator
preflight, and JudgeAgent preflight before executing the model and the judge.
Any failed gate MUST stop the pilot without model calls.

#### Scenario: Preflight failure blocks execution
- **WHEN** a preflight gate fails
- **THEN** the pilot reports the failed gate and does not invoke the model or judge

### Requirement: Per-attempt semantic, judge, and health reporting

Each attempt MUST record the semantic evaluator result, the JudgeAgent
`judge-result/v1` sidecar with raw dimension scores, the execution failure
category (if any), and identity binding. Judge results MUST be soft quality
signals only and MUST NOT change semantic completion; execution failures MUST
NOT be disguised as low quality scores.

#### Scenario: Complete attempt record
- **WHEN** an attempt finishes
- **THEN** it records semantic result, judge raw dimensions with provenance hashes, failure category or health, and identity binding

#### Scenario: Judge unavailable is distinct from low quality
- **WHEN** the judge provider is unavailable
- **THEN** the attempt records `judge-unavailable` with an audit reason and never fabricates a low score

### Requirement: Diagnostic-only conclusions in ignored scratch

The pilot MUST write pi logs, evaluator output, judge sidecars, candidate diffs,
and a redacted summary under the ignored `scratch/` directory and MUST NOT create
formal records, artifact indexes, or external storage objects. Conclusions MUST
be diagnostic or uncertain only: signal when oracle joint-pass strictly exceeds
both controls, otherwise no-obvious-signal or uncertain, and MUST NOT be
presented as formal benchmark, product, or cross-candidate conclusions.

#### Scenario: Oracle condition leads
- **WHEN** oracle joint-pass count strictly exceeds baseline and irrelevant-practice
- **THEN** the summary marks signal and suggests expanding the local sample

#### Scenario: No discrimination or insufficient health
- **WHEN** oracle does not strictly exceed the controls, or healthy samples are insufficient, or the judge is unavailable
- **THEN** the summary reports no-obvious-signal or diagnostic/uncertain and does not upgrade conclusions
