## MODIFIED Requirements

### Requirement: JudgeAgent and Practice quality signals are independent soft metrics

Quality signals MUST be reported as an independent dimension with at least the
states `observed`, `not-observed`, `indeterminate`, `not-run`, and
`judge-unavailable`. `judge-unavailable` MUST be distinguished from
`not-observed`: the former means the judging resource did not produce a
signal, the latter means calibrated negative evidence exists. Quality signals
MUST NOT change task completion.

JudgeAgent results MUST be produced by a repository-level judge capability
(`judgeagent-soft-scoring`) whose inputs contain only declared public material.
JudgeAgent results MUST be recorded through the versioned judge sidecar
(`judge-result/v1` or a confirmed newer version) with full provenance (judge
model/version, prompt hash, rubric hash, input hash, state, dimension scores,
rationale, and confidence). Tasks MAY reference judge results as an optional
quality artifact, but such references MUST NOT alter the semantic hard gate or
`evaluator-result/v2`.

#### Scenario: Judge unavailable
- **WHEN** a JudgeAgent provider is not available or produced no result for an otherwise healthy run
- **THEN** the record reports the quality state as `judge-unavailable` and keeps task completion determined by the semantic hard gate only

#### Scenario: Quality not observed with calibrated evidence
- **WHEN** a probe identifies a candidate-declared anti-pattern or absence of the declared responsibility with calibrated evidence
- **THEN** the record reports quality `not-observed` without changing semantic completion or execution health

#### Scenario: Task references a judge artifact
- **WHEN** a task declares an optional judge rubric and the run produces a provenance-complete judge result
- **THEN** the result is referenced as an independent quality sidecar artifact and does not modify the semantic hard gate