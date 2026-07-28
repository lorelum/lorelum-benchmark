## ADDED Requirements

### Requirement: Private Injection-Calibration Condition Contract

The system MUST provide a profile-owned runtime parser for
`injection-calibration/v1`. A kernel-backed Practice candidate MUST declare a
private condition document containing `baseline`, `oracle-practice`, and
`irrelevant-practice`; it MUST declare retrieval as unavailable until a
versioned retrieval runtime is introduced. The parser MUST reject malformed,
duplicate, unsupported, or incomplete condition declarations.

#### Scenario: Parse declared controls
- **WHEN** a maintainer resolves a valid injection-calibration candidate
- **THEN** the profile runtime returns the declared baseline, oracle-Practice,
  irrelevant-Practice, and unavailable retrieval condition metadata
- **AND THEN** kernel core does not parse the condition semantics

#### Scenario: Reject incomplete controls
- **WHEN** a condition document omits a required declared control or marks
  retrieval available without a versioned runtime
- **THEN** profile resolution fails before calibration or snapshot generation

### Requirement: Condition-Scoped Private Practice Injection

The profile runtime MUST resolve a selected Practice only through the
`condition-scoped-private-runtime` channel. It MUST verify the declared
Practice SHA-256 before returning a private runtime payload. It MUST NOT copy
Practice text or its private path into the materialized workspace, public task
input, resolved workspace artifact, or public trace.

#### Scenario: Inject an oracle Practice privately
- **WHEN** a maintainer resolves the `oracle-practice` condition
- **THEN** the private runtime receives the declared Practice payload only for
  that condition after its hash verifies
- **AND THEN** the materialized public workspace contains no Practice file or
  private Practice path

#### Scenario: Practice content changes
- **WHEN** the bytes of a declared Practice change without a matching hash
  update
- **THEN** profile resolution fails before execution
