## ADDED Requirements

### Requirement: Practice evaluator runtime uses a candidate-scoped reproducible closure

Every Practice candidate that runs a private evaluator or calibration MUST
declare a versioned evaluator runtime closure. The closure MUST identify its
source, locked dependency inputs, integrity identifier, resolution root, and
rebuild procedure. The repository MUST retain the declaration and locked
inputs, but MUST NOT commit installed dependency trees or runtime output.

The runtime MUST be rebuildable in CI and offline from the declared inputs.
Changing its dependency versions, locked input, source, integrity identifier,
or resolution rules MUST create a new closure version and update the candidate
snapshot that covers those inputs.

#### Scenario: Clean materialized calibration resolves TypeScript
- **WHEN** a candidate evaluator parses TypeScript in an isolated materialized
  calibration environment
- **THEN** the parser MUST resolve from that candidate's verified closure and
  the evaluator MUST not require repository-root or host-installed dependencies

#### Scenario: Closure is missing, modified, or version-incompatible
- **WHEN** the closure declaration, lock input, integrity identifier, or
  declared version cannot be verified
- **THEN** calibration MUST fail closed as a runtime execution failure and
  MUST NOT derive semantic or Practice observation results from evaluator output

#### Scenario: Host dependency is available
- **WHEN** a repository ancestor or host global installation provides a parser
  that the candidate closure does not provide
- **THEN** the evaluator MUST reject that source and produce the same result as
  the clean materialized environment

### Requirement: Evaluator runtime closure remains private and auditable

The system MUST keep the closure, private evaluator, oracle, Practice, and
calibration fixture contents in the private runtime boundary. Those contents
MUST NOT be copied to an agent workspace, public task prompt, public trace,
issue, or PR summary. Public diagnostics MAY expose only closure
version, integrity identifier, stable runtime failure category, and health
state. The materialized public workspace MUST contain no private runtime input.

#### Scenario: Public/private leakage audit
- **WHEN** a candidate is materialized and its evaluator/calibration is run
- **THEN** the leakage audit MUST confirm that the public workspace and public
  diagnostic summary contain no private runtime, evaluator, oracle, Practice,
  or calibration content
