## ADDED Requirements

### Requirement: Practice-effect score measures only declared Practice responsibilities
The v2 login-page Practice judge MUST score only the API/page responsibility
boundary declared by `react.api.layered-design`: component transport isolation,
domain-operation delegation, boundary response translation, and raw-response
containment. Functional completion, form ergonomics, visual/UI quality, and
accessibility MUST remain independent semantic or optional quality fields and
MUST NOT contribute to the Practice-effect score.

#### Scenario: Functional success without Practice adherence
- **WHEN** a candidate passes all public login behavior tests but handles
  transport and raw responses in the component
- **THEN** semantic completion is recorded as pass while the Practice score
  records negative evidence independently

#### Scenario: Practice adherence without visual polish
- **WHEN** a candidate satisfies all four API boundary responsibilities but
  omits an optional UI polish signal
- **THEN** the Practice score is unaffected and the UI signal is reported
  separately

### Requirement: Equivalent implementation forms receive equivalent evidence
The v2 judge MUST analyze behavior and resolved data flow rather than exact
source spellings. It MUST accept intermediate expressions, brace-form control
flow, renamed helpers, aliases, alternate pending-state mechanisms, and local
directory layouts when their responsibilities are equivalent.

#### Scenario: Intermediate disabled binding
- **WHEN** controls use `disabled={disabled}` and `disabled` is derived from
  the pending state through a boolean expression
- **THEN** the judge awards the same disabled-control evidence as a direct
  pending-state binding

#### Scenario: Brace-form duplicate guard
- **WHEN** a submit handler uses `if (pending) { return; }`
- **THEN** the judge awards the same duplicate-submit evidence as
  `if (pending) return;`

#### Scenario: Alternate pending-state mechanism
- **WHEN** a candidate uses a calibrated reducer or custom hook that exposes
  equivalent pending, disable, and settle behavior
- **THEN** the judge accepts the implementation without requiring `useState`
  or a particular setter name

### Requirement: Unsupported analysis fails closed
The v2 evidence engine MUST resolve relevant imports and data-flow edges using
its declared analysis capability. An unresolved or ambiguous relevant module
graph MUST produce `indeterminate` with a stable audit reason and MUST NOT be
counted as either positive or negative Practice evidence.

#### Scenario: Unresolved alias
- **WHEN** the submit path imports a relevant operation through an alias that
  the declared resolver cannot resolve
- **THEN** the criterion state is `indeterminate` and no full boundary score is
  awarded

#### Scenario: Ambiguous boundary
- **WHEN** multiple invoked imports could be the submit boundary and the
  engine cannot identify one responsible path
- **THEN** the result is `indeterminate` with the ambiguity reason preserved

### Requirement: V2 calibration gates model comparison
Before any model run selects the v2 judge, calibration MUST include a passing
reference, at least two responsibility-equivalent implementations, a declared
anti-pattern, and an ambiguity fixture. The checks MUST compare raw criteria
and states, not only total scores.

#### Scenario: Calibration rejects equivalent syntax
- **WHEN** any equivalent fixture loses a Practice criterion solely because of
  syntax, naming, or directory layout
- **THEN** v2 calibration fails and model comparison is blocked

#### Scenario: Calibration accepts an anti-pattern
- **WHEN** a declared component-transport or raw-response anti-pattern receives
  the same positive evidence as the reference
- **THEN** v2 calibration fails and model comparison is blocked

#### Scenario: Calibration sees unsupported analysis
- **WHEN** the ambiguity fixture is classified as pass or not-observed instead
  of `indeterminate`
- **THEN** v2 calibration fails and model comparison is blocked
