# profile-diagnostic-evaluator-health Specification

## Purpose

Define evaluator-process health for Practice profile diagnostics so a partial
or failed evaluator process cannot produce condition-comparison evidence.

## Requirements
### Requirement: Profile diagnostic health requires successful evaluator completion

The profile diagnostic runner MUST record `evaluation_status=evaluated` only
when the evaluator process completes without timeout or launch failure, exits
with code zero, emits a valid complete structured diagnostic result, and uses
a verified candidate-scoped evaluator runtime closure. Semantic and Practice
observation fields MUST NOT be inferred from evaluator stdout when the
evaluator process or its runtime closure is non-healthy.

#### Scenario: Structured output followed by a nonzero evaluator exit
- **WHEN** an evaluator emits a syntactically valid diagnostic result but exits
  with a nonzero code
- **THEN** the runner MUST record `evaluation_status=execution-failed` with a
  stable redacted reason and omit semantic, Practice observation, and joint
  pass fields

#### Scenario: Successful evaluator with a semantic failure
- **WHEN** an evaluator exits with code zero and emits `semantic=fail` with a
  valid Practice observation state
- **THEN** the runner MUST record `evaluation_status=evaluated`, preserve both
  result dimensions, and derive joint pass as false

#### Scenario: Runtime closure verification failure
- **WHEN** evaluator runtime closure verification or isolated reconstruction
  fails before evaluator completion
- **THEN** the runner MUST record `evaluation_status=execution-failed` with a
  stable redacted runtime category and MUST NOT infer semantic, Practice
  observation, or joint pass fields

### Requirement: Evaluator process failure remains redacted diagnostic evidence

The runner MUST redact evaluator-process failures in every diagnostic summary.
The runner MAY retain evaluator stdout and stderr in ignored scratch artifacts
for local diagnosis. Public traces and summaries MUST expose only a stable
failure category and MUST NOT expose evaluator output, private paths, Practice
text, oracle material, or calibration material.

#### Scenario: Historical workspace lacks evaluator dependencies
- **WHEN** an evaluator-only replay cannot complete because its historical
  workspace lacks a required dependency
- **THEN** the replay MUST report a non-healthy evaluator result and MUST NOT
  repair the workspace, rerun a model, or use the partial output in a condition
  comparison
