## ADDED Requirements

### Requirement: Declarative Calibration Roles Without Domain Interpretation

The system MUST provide a shared offline calibration entry point that reads candidate/task-declared roles
(baseline, control, oracle and equivalent), invokes candidate/task-owned commands and compares observed
results against declared expectations. The entry point MUST NOT inspect candidate-specific domain strings,
AST rules, oracle content or quality-probe definitions. A candidate is rejected when an observed result
differs from its declared expectation.

#### Scenario: Run offline calibration

- **WHEN** a maintainer runs calibration for a declared candidate
- **THEN** the entry point reports each declared role's command result
- **AND THEN** a candidate is rejected when its observed result differs from its declared expectation
- **AND THEN** the entry point does not interpret the domain meaning of any role

### Requirement: Calibration Data Remains Private

Calibration source, private commands, Practice, oracle and quality-probe material MUST remain outside the
resolved agent workspace and public task input.

#### Scenario: Audit a materialized workspace after calibration setup

- **WHEN** a maintainer audits the workspace that would be given to an agent
- **THEN** no private calibration file or private evaluation identifier is present