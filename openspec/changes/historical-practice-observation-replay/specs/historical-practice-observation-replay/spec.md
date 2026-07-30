## ADDED Requirements

### Requirement: Historical workspaces are replayed without executing an agent
The diagnostic system MUST accept explicit historical workspace inputs for the
two declared #90 candidates and evaluate only their existing candidate output
with the current v2 evaluator. It MUST NOT invoke Pi, a model, retrieval, or a
new clean-workspace execution, and it MUST NOT modify the historical workspace.

#### Scenario: Available historical workspace
- **WHEN** an explicitly declared #90 workspace is readable and its candidate
  identity matches the replay plan
- **THEN** the system evaluates it in place, writes only new diagnostic output
  under ignored scratch, and records the v2 result without an agent invocation

#### Scenario: Missing historical workspace
- **WHEN** a planned historical workspace is unavailable or unreadable
- **THEN** the system records a `not-executable` replay entry with a stable
  reason and does not run a replacement execution

### Requirement: V2 replay reports preserve independent evidence dimensions
The system MUST write a distinct `profile-diagnostic-summary/v2` alongside the
unchanged historical v1 summary. For every planned candidate, historical input
identity, condition, and repetition, it MUST independently record `semantic`,
`practice_observation`, `evaluation_status`, derived `joint_pass`, and a
stable audit reason when applicable.

#### Scenario: Valid negative Practice observation
- **WHEN** the current evaluator returns semantic `pass` and Practice
  observation `not-observed`
- **THEN** the report records `evaluation_status=evaluated`, preserves the
  independent fields, and does not classify the replay as an evaluator failure

#### Scenario: Invalid evaluator output
- **WHEN** the replayed evaluator output is malformed or does not satisfy the
  v2 result contract
- **THEN** the report records `evaluation_status=invalid-output`, does not
  infer a semantic or Practice result, and retains the planned denominator

### Requirement: Replay reporting is redacted and provenance-bound
The v2 summary MUST retain source commit, historical snapshot identity,
profile-input hash, condition, repetition, and redacted Practice
ID/version/hash. It MUST NOT contain Practice text, private evaluator or oracle
material, private paths, agent workspace paths, or raw private evaluator logs.

#### Scenario: Redacted trace generation
- **WHEN** a replay entry is serialized
- **THEN** it contains only the declared redacted identity fields and stable
  audit categories needed to reproduce the diagnostic classification

### Requirement: Expansion entry decision is bounded and conservative
The diagnostic system MUST conclude `eligible-for-expansion`,
`adjust-before-expansion`, or `indeterminate` independently for each of the
two historical #90 candidates. It MUST retain per-candidate and per-input
denominators, identify the qualified candidate subset for #91, and MUST NOT
combine replay entries with future #91 executions or claim a causal Practice
effect.

#### Scenario: Strict directional signal
- **WHEN** calibration and leakage audits pass, every planned replay for one
  candidate is `evaluated`, and its relevant Practice condition has a strictly
  greater raw joint-pass count than both controls under the same input identity
- **THEN** the report concludes `eligible-for-expansion` for that candidate
  only, and #91 may include that qualified candidate without including an
  ineligible candidate

#### Scenario: No candidate qualifies
- **WHEN** neither historical candidate is `eligible-for-expansion`
- **THEN** the report directs #91 to remain paused and requires a separate
  candidate, Practice, or probe adjustment issue before a new expansion plan

#### Scenario: Incomplete or unhealthy replay
- **WHEN** a candidate has a missing planned workspace, a replay is not
  evaluated, or a required calibration or leakage audit fails
- **THEN** the report concludes `indeterminate` for that candidate and excludes
  it from #91 without making a condition comparison
