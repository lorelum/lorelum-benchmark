## MODIFIED Requirements

### Requirement: Pre-registered balanced diagnostic schedule
Before creating a workspace or invoking Pi, the profile diagnostic runner MUST
construct and validate a complete schedule for each candidate x
`profile_input_hash`. An ordinary diagnostic plan MUST use a repeat count
divisible by three and `cyclic-latin-square/v1` so every condition occupies
every execution position. The schedule MUST record a schedule-only plan seed,
schedule algorithm identifier/version, source commit, snapshot ID, profile
input hash, repeat block, and intended condition order. Every block MUST
contain exactly one baseline, one oracle-practice, and one
irrelevant-practice attempt. The runner MUST reject an incomplete, duplicate,
unbalanced, or identity-mismatched schedule before execution and MUST NOT pass
the plan seed as a provider model parameter.

An exception is permitted only for an explicit
`execution_gate.kind=one-repeat-re-admission` plan. Such a plan MUST declare
exactly one candidate, `repetitions: 1`, one of each declared condition, a
parent balanced-plan identity, and the candidate and block being re-admitted.
It MUST retain all normal candidate identity checks and MUST reject every
other non-balanced repeat count.

#### Scenario: Valid schedule is generated before execution
- **WHEN** a validated candidate with a declared plan seed and repeat count is
  prepared for a diagnostic dry run
- **THEN** the runner produces a complete identity-bound schedule with each
  executable condition exactly once in every repeat block before any workspace
  or Pi invocation exists

#### Scenario: Explicit re-admission gate schedules one condition block
- **WHEN** a plan declares `one-repeat-re-admission` with exactly one valid
  candidate and `repetitions: 1`
- **THEN** the runner schedules exactly one baseline, one oracle-practice, and
  one irrelevant-practice attempt before any workspace or Pi invocation exists

#### Scenario: Identity mismatch fails closed
- **WHEN** a persisted schedule is presented for a different source commit,
  snapshot ID, candidate, or `profile_input_hash`
- **THEN** the runner records an invalid-plan reason and does not reorder,
  regenerate, create a workspace, or invoke Pi

#### Scenario: Schedule seed is not a model seed
- **WHEN** the runner constructs a diagnostic invocation from a scheduled
  attempt
- **THEN** the plan seed is retained only in schedule metadata and is absent
  from provider model parameters and Pi model arguments

### Requirement: Conclusion grade reflects diagnostic evidence
The diagnostic report MUST include a conclusion grade derived from the
pre-registered plan and observed completion, health, and calibration state.
Three repeats per condition MUST be labeled as directional screening only.
The runner MUST downgrade the conclusion to diagnostic or uncertain when a
planned attempt is incomplete, non-healthy, indeterminate in a required
comparison, or calibration is invalid. It MUST NOT emit causal, generalized,
or reproducible-direction language unless the separately pre-registered
independent-candidate count and uncertainty presentation requirements are
satisfied. A `one-repeat-re-admission` plan MUST always emit
`diagnostic-only` for its candidate and overall result and MUST NOT emit a
directional-screen, expansion, or comparison conclusion.

#### Scenario: Three-repeat result is limited to a directional screen
- **WHEN** a complete and healthy plan contains three repeats per condition
- **THEN** the report labels any qualifying difference as a candidate-level
  directional screen and does not label it causal, generalizable, or
  reproducible

#### Scenario: One-repeat gate remains diagnostic-only
- **WHEN** a complete and healthy `one-repeat-re-admission` plan has a higher
  oracle joint-pass count than either control
- **THEN** the candidate and overall report conclusion remain
  `diagnostic-only` and no expansion eligibility is emitted

#### Scenario: Incomplete plan downgrades the conclusion
- **WHEN** any planned condition attempt is missing or non-healthy
- **THEN** the report emits a diagnostic or uncertain conclusion and preserves
  the blocking status in its summary
