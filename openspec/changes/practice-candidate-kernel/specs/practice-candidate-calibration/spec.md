## ADDED Requirements

### Requirement: Declarative Calibration Roles

The system MUST allow a candidate to declare private paths for public starter, reference, responsibility-equivalent, and registered anti-pattern calibration roles, together with their expected semantic and quality-probe outcomes. The shared calibration entry point MUST invoke candidate-owned commands without requiring a shared domain oracle or shared quality rule.

#### Scenario: Run offline calibration

- **WHEN** a maintainer runs calibration for a declared candidate
- **THEN** the entry point reports each declared role's semantic and quality-probe result
- **AND THEN** a candidate is rejected when its observed result differs from its declared expectation

### Requirement: Calibration Data Remains Private

Calibration source, private commands, Practice, oracle, and quality probe material MUST remain outside the resolved agent workspace and public task input.

#### Scenario: Audit a materialized workspace after calibration setup

- **WHEN** a maintainer audits the workspace that would be given to an agent
- **THEN** no private calibration file or private evaluation identifier is present
