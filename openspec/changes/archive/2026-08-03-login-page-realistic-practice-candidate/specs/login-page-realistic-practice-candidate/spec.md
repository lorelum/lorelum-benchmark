## ADDED Requirements

### Requirement: Realistic login page task statement without fixture paths

The candidate task statement MUST describe the product goal in natural,
task-like language: inspect the existing login API, wire up the login page,
handle form/UI/UX and layering, and run the existing tests. It MUST NOT
hard-code API documentation paths, test fixture paths, or benchmark language,
and MUST NOT reveal private acceptance structure.

#### Scenario: Task statement references only real project content
- **WHEN** a maintainer writes the candidate task statement
- **THEN** it refers to the API contract and tests that actually exist in the
  starter, without naming specific paths as requirements

#### Scenario: No benchmark leakage
- **WHEN** the public task card is rendered
- **THEN** it contains no evaluator, Oracle, Practice, or scoring language and
  no fixed fixture path

### Requirement: Starter provides a real API contract and test entry point

The candidate starter MUST contain a real, visible API contract and an
existing browser-test entry point so the agent can inspect and verify its work.
The API contract location MUST be determined by the actual starter content, not
invented by the task statement.

#### Scenario: API contract exists in the starter
- **WHEN** a maintainer materializes the candidate public starter
- **THEN** the starter contains the login API contract and a runnable
  `bun run test` browser-test entry point

### Requirement: Private evaluator verifies only declared observable behavior

The private evaluator MUST verify only the observable behaviors declared by the
task statement (for example login success/failure feedback and duplicate-submit
prevention). Layering, UI/UX, and form-quality dimensions MUST be reported as
quality signals, not as task-completion hard gates.

#### Scenario: Semantic checks match the task statement
- **WHEN** the private evaluator runs against a candidate workspace
- **THEN** its semantic checks correspond to the task-declared observable
  behavior, and quality dimensions are kept in the soft-signal channel

### Requirement: Candidate isolation and snapshot integrity

The new candidate MUST be an independent candidate in
`incubator/practice-injection/` with its own public/private material, private
snapshot, and calibration. It MUST NOT modify
`login-page-layered-api-v1` or its historical results, and MUST NOT enter the
default suite or create a formal record.

#### Scenario: Historical login candidate untouched
- **WHEN** the new candidate is added
- **THEN** `login-page-layered-api-v1` and its snapshot and records remain
  unchanged and the new candidate has its own snapshot

#### Scenario: No default suite or record
- **WHEN** the candidate is validated
- **THEN** it stays in incubator, does not enter the default suite, and no
  formal record is created