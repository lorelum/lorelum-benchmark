## ADDED Requirements

### Requirement: Pre-registered balanced diagnostic schedule
Before creating a workspace or invoking Pi, the profile diagnostic runner MUST
construct and validate a complete schedule for each candidate x
`profile_input_hash`. The schedule MUST record a schedule-only plan seed,
schedule algorithm identifier/version, source commit, snapshot ID, profile
input hash, repeat block, and intended condition order. Every block MUST
contain exactly one baseline, one oracle-practice, and one
irrelevant-practice attempt. The runner MUST reject an incomplete, duplicate,
unbalanced, or identity-mismatched schedule before execution and MUST NOT pass
the plan seed as a provider model parameter.

#### Scenario: Valid schedule is generated before execution
- **WHEN** a validated candidate with a declared plan seed and repeat count is
  prepared for a diagnostic dry run
- **THEN** the runner produces a complete identity-bound schedule with each
  executable condition exactly once in every repeat block before any workspace
  or Pi invocation exists

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

### Requirement: Actual execution order is auditable and redacted
The runner MUST preserve the pre-registered schedule and record actual
attempt order and execution block in its redacted scratch output. Schedule and
result output MUST include only condition IDs and existing redacted Practice
identity metadata; they MUST NOT include Practice text, private paths,
evaluator/oracle material, or workspace paths.

#### Scenario: Actual order can be compared with the plan
- **WHEN** the runner completes or isolates an attempt from a scheduled block
- **THEN** its redacted result identifies the planned block, planned position,
  and actual execution position without exposing private treatment content

#### Scenario: Schedule output preserves private isolation
- **WHEN** a schedule and diagnostic report are persisted to scratch output
- **THEN** neither artifact contains Practice text, a private filesystem path,
  evaluator/oracle content, or a workspace path

### Requirement: Stratified diagnostic analysis retains every planned attempt
The runner MUST report, by candidate x `profile_input_hash` and condition, the
planned denominator, raw `joint_pass` proportion, oracle-minus-baseline and
oracle-minus-irrelevant-practice differences, semantic outcomes, every
Practice observation state, and every evaluation-health state. Unhealthy,
incomplete, and `indeterminate` attempts MUST remain in planned denominators
and their own status counts; the runner MUST NOT exclude them or relabel them
as `not-observed`.

#### Scenario: Non-health result remains in the denominator
- **WHEN** an attempt is invalid-output, execution-failed, not-executable, or
  incomplete
- **THEN** the report retains it in the condition's planned denominator and
  reports its actual health status without adding it to a semantic or Practice
  observation numerator

#### Scenario: Indeterminate observation is retained
- **WHEN** an evaluated attempt has `practice_observation=indeterminate`
- **THEN** the report increments the indeterminate count and does not count it
  as `not-observed` or silently remove it from the comparison

### Requirement: Conclusion grade reflects diagnostic evidence
The diagnostic report MUST include a conclusion grade derived from the
pre-registered plan and observed completion, health, and calibration state.
Three repeats per condition MUST be labeled as directional screening only.
The runner MUST downgrade the conclusion to diagnostic or uncertain when a
planned attempt is incomplete, non-healthy, indeterminate in a required
comparison, or calibration is invalid. It MUST NOT emit causal, generalized,
or reproducible-direction language unless the separately pre-registered
independent-candidate count and uncertainty presentation requirements are
satisfied.

#### Scenario: Three-repeat result is limited to a directional screen
- **WHEN** a complete and healthy plan contains three repeats per condition
- **THEN** the report labels any qualifying difference as a candidate-level
  directional screen and does not label it causal, generalizable, or
  reproducible

#### Scenario: Incomplete plan downgrades the conclusion
- **WHEN** any planned condition attempt is missing or non-healthy
- **THEN** the report emits a diagnostic or uncertain conclusion and preserves
  the blocking status in its summary
