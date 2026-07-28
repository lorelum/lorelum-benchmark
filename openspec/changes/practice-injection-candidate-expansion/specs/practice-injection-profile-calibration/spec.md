## ADDED Requirements

### Requirement: Declared Irrelevant-Practice Control Measurement

An `injection-calibration/v1` candidate MUST declare the irrelevant-Practice
control metric, oracle and irrelevant measured values, maximum permitted
relative difference, actual relative difference, and independent-review
status. The runtime MUST validate the declaration's arithmetic and reject a
control that exceeds its declared threshold. It MUST NOT infer semantic
relevance from the measurement.

#### Scenario: Accept a declared equal-length control
- **WHEN** a neutral profile fixture declares matching measurement metadata
  within its threshold and records independent review
- **THEN** profile calibration accepts the irrelevant-Practice control
- **AND THEN** it reports only the declared metric and values

#### Scenario: Reject an unmatched control
- **WHEN** the declared actual relative difference exceeds its maximum
- **THEN** profile calibration fails before the candidate can be compared

### Requirement: Decision Rule Remains Declarative

An `injection-calibration/v1` candidate MUST declare the metric, advance
criterion, and alternative outcome for its decision rule. The profile runtime
MUST preserve this declaration for offline calibration and resolved-input
binding, but MUST NOT execute a model or assert that the rule establishes a
benchmark conclusion.

#### Scenario: Validate a neutral decision rule
- **WHEN** a neutral fixture supplies a complete decision-rule declaration
- **THEN** profile calibration records it as declared input
- **AND THEN** no model call, retrieval call, record creation, or suite
  revision occurs

### Requirement: Neutral Profile Fixture

The repository MUST provide a neutral fixture that validates private injection
isolation, hash mismatch rejection, control measurement validation, and
decision-rule preservation without Practice or Skill domain semantics.

#### Scenario: Run neutral profile calibration
- **WHEN** maintainers run the profile's focused offline tests
- **THEN** the fixture validates the full private-profile path without a model
  provider, retrieval runtime, or concrete candidate fixture
