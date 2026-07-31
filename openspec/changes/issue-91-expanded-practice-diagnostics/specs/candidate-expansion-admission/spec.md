## ADDED Requirements

### Requirement: Expansion prerequisites are ordered and fail closed

The #91 admission workflow MUST execute Pi/model preflight before any model task attempt, then execute the complete isolated calibration matrix for every candidate and only then permit a one-repeat diagnostic gate. A failed prerequisite MUST stop later stages and emit only a redacted failure category.

#### Scenario: Calibration failure blocks the diagnostic gate
- **WHEN** either candidate has a non-passing or incomplete calibration matrix
- **THEN** the workflow records the candidate as not eligible and does not invoke Pi for a diagnostic attempt

#### Scenario: Healthy prerequisites permit one-repeat screening
- **WHEN** preflight and both candidates' isolated calibration matrices pass
- **THEN** the workflow may construct the one-repeat baseline/oracle-practice/irrelevant-practice gate after planning confirmation

### Requirement: Diagnostic attempts are bound to the registered plan

The workflow MUST validate source commit, snapshot id, profile input hash, declared conditions, and schedule identity against the versioned plan before workspace creation or Pi invocation. It MUST retain the three-repeat denominator and MUST NOT accept candidate-local repetition or ordering overrides.

#### Scenario: Identity drift fails closed
- **WHEN** a candidate or plan identity differs in any bound field
- **THEN** the workflow records an invalid-plan reason and creates neither a workspace nor a model request

#### Scenario: Candidate-local repetition cannot change the plan
- **WHEN** `conditions.yaml` declares a different repetition count than the registered plan
- **THEN** the runner keeps the registered plan identity and rejects an override rather than silently changing the denominator

### Requirement: Dry-run evidence preserves health and privacy boundaries

The one-repeat diagnostic gate MUST produce redacted per-candidate and per-condition health, semantic, Practice-observation, joint-pass, and identity evidence. It MUST retain unhealthy attempts in denominators and MUST NOT include Practice text, private paths, evaluator/oracle material, or workspace paths in reported summaries.

#### Scenario: Unhealthy evaluator remains diagnostic evidence
- **WHEN** an evaluator times out, exits nonzero, or emits incomplete output
- **THEN** the attempt remains in the planned denominator without semantic, observation, or joint-pass inference

#### Scenario: Summary is redacted
- **WHEN** the gate writes its scratch summary
- **THEN** the summary contains only redacted condition and identity metadata and no private material

### Requirement: Admission conclusions are limited to observed evidence

The workflow MUST label one-repeat output diagnostic-only. It MAY mark a candidate eligible for the three-repeat phase only when calibration is healthy, all planned attempts are evaluated, and oracle joint-pass is strictly greater than both baseline and irrelevant-practice; otherwise it MUST report diagnostic or uncertain and keep #91 paused.

#### Scenario: Oracle strictly leads both controls
- **WHEN** all one-repeat attempts are healthy and oracle joint-pass is strictly greater than each control
- **THEN** the candidate is eligible for authorized three-repeat directional screening, with no causal or generalized claim

#### Scenario: No strict lead
- **WHEN** oracle joint-pass is equal to or below either control, or any required attempt is unhealthy
- **THEN** the candidate remains diagnostic or uncertain and is not admitted to expansion
