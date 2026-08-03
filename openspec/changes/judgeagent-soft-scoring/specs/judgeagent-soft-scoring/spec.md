## ADDED Requirements

### Requirement: Judge input is restricted to declared public material

The JudgeAgent input constructor MUST accept only declared public material:
the task card `public/task.md`, `public/starter/`, the candidate diff or source
snapshot, and explicitly declared public run materials. It MUST reject inputs
that contain condition identifiers, Practice text, Oracle material, private
evaluators, private paths, or calibration material. Rejection MUST fail closed
with a redacted audit reason and MUST NOT forward partial or private input to a
provider.

#### Scenario: Private path in judge input
- **WHEN** an input candidate contains a private path, Practice text, Oracle content, or a condition identifier
- **THEN** the constructor rejects the input with a redacted reason and no provider call is made

#### Scenario: Public-only judge input
- **WHEN** an input contains only the declared public task, starter, and candidate diff
- **THEN** the constructor produces a redacted, allowlisted input bundle

### Requirement: Judge output is structured, versioned, and provenance-bound

JudgeAgent results MUST conform to the versioned judge result schema and carry
judge model/version, prompt hash, rubric hash, input hash, state, dimension
scores, rationale, and confidence. Missing hashes, invalid structured output,
or an unavailable provider MUST fail closed and MUST NOT fabricate a low score.

#### Scenario: Complete provenance result
- **WHEN** a provider returns a result with all required hashes, scores, and rationale
- **THEN** the result validates against the judge schema and is recorded as a quality sidecar artifact

#### Scenario: Missing hash fails closed
- **WHEN** a provider result omits a required input, prompt, or rubric hash
- **THEN** the result is rejected and recorded as `judge-unavailable` or `not-run` with an audit reason, never as a low score

### Requirement: JudgeAgent is a soft quality signal only

JudgeAgent results MUST NOT change task completion. Task completion remains
determined solely by the public-product semantic hard gate. A low judge score,
`not-observed`, or `judge-unavailable` MUST NOT mark a semantically passing run
as failed.

#### Scenario: Low judge score with semantic pass
- **WHEN** a candidate passes all semantic checks but receives a low judge quality score
- **THEN** the run records semantic completion as passed and reports the judge score as an independent soft signal

#### Scenario: Judge unavailable with semantic pass
- **WHEN** the judge provider is unavailable for a semantically passing run
- **THEN** the run records `judge-unavailable` and keeps task completion passed

### Requirement: CI and local default use a mock provider

The repository MUST provide a deterministic mock judge provider so that CI and
local validation do not call external models by default. Real providers MUST
require explicit opt-in and MUST NOT be executed in CI.

#### Scenario: Mock provider in CI
- **WHEN** CI runs contract or validation tests that exercise the judge path
- **THEN** the mock provider produces valid, schema-conforming results without network or model calls

#### Scenario: Real provider opt-in
- **WHEN** a real judge provider is requested
- **THEN** it requires an explicit environment flag or configuration and is not part of the CI default path