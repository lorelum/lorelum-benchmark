# practice-result-adapter Specification

## Purpose

Define how `profile-diagnostic-summary/v3` practice-injection results are adapted
into the channel-neutral `result-interpreter/v1` contract: per
candidate × profile_input_hash unit mapping (plan from `plan.schedule`,
entries from `entries`), the practice decision rule (oracle-practice strictly
above baseline and irrelevant-practice), fail-closed rejection of unknown or
private fields, and end-to-end login-page replay validation with strict
uncertainty on execution gaps.
## Requirements
### Requirement: Practice summary results are adapted into the neutral interpreter contract

The practice adapter MUST consume a `profile-diagnostic-summary/v3` document and produce a
`result-interpreter/v1` InterpretationInput with one unit per candidate × profile_input_hash.
It MUST derive the unit plan from `plan.schedule` (condition × 1-based repeat/block), map
each summary entry (evaluation_status → health, semantic → semantic, practice_observation →
quality, redacted trace and fixed identity → sample_unit/trace), and attach the practice
decision rule (active_condition=oracle-practice, controls=[baseline, irrelevant-practice],
strictly-greater-than-each-control).

#### Scenario: Login-page summary maps to interpreter units
- **WHEN** a v3 summary with login-page-auth-flow-v2 entries is adapted
- **THEN** each candidate × profile_input_hash unit carries a plan, mapped entries that pass
  interpreter validation, and the practice decision rule

#### Scenario: Unsupported schema fails closed
- **WHEN** the input schema_version is not profile-diagnostic-summary/v3
- **THEN** the adapter rejects the input and produces no units

### Requirement: Identity and redaction boundaries are preserved end to end

The adapter MUST NOT copy practice text, private paths, or workspace paths into the
interpreter input. Entries within a unit MUST share source_commit, snapshot_id, and
profile_input_hash; identity drift MUST be surfaced through the interpreter's identity gate
as an uncertain unit rather than a merged denominator.

#### Scenario: Private material never reaches the interpreter
- **WHEN** the source summary contains practice text or private path fields outside the
  allowed redacted trace fields
- **THEN** the adapter fails closed before interpretation and emits no private content

#### Scenario: Identity drift yields uncertain
- **WHEN** entries of one candidate × profile_input_hash disagree on source_commit or
  snapshot_id
- **THEN** the unit is reported uncertain with an identity-drift reason

### Requirement: Login-page scratch replay validates the adapter end to end

The login-page replay MUST run the adapter and interpreter over the existing
login-v2-three-condition-retest-v2 scratch summary and produce a redacted
`result-interpreter-summary/v1` with per-unit verdicts. The strict decision rule MUST be
applied: oracle joint-pass strictly above both baseline and irrelevant-practice yields
`signal` only when every planned attempt is evaluated; any execution gap (missing attempt,
non-evaluated, or indeterminate quality) yields `uncertain`.

#### Scenario: Oracle strictly leads both controls with all attempts evaluated
- **WHEN** every planned attempt is evaluated and oracle joint-pass is 3 vs baseline 1 and
  irrelevant-practice 2
- **THEN** the unit verdict is `signal` with the per-unit evidence

#### Scenario: Real replay reports execution gaps as uncertain
- **WHEN** the login-v2-three-condition-retest-v2 corpus contains an execution-failed
  oracle and baseline attempt
- **THEN** the unit verdict is `uncertain` with an unhealthy-attempt reason and the
  cross-unit output lists the execution gap

#### Scenario: Gap path stays uncertain
- **WHEN** a planned attempt is missing or a quality state is indeterminate
- **THEN** the unit verdict is `uncertain` with the specific reason

