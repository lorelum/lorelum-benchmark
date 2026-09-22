## ADDED Requirements

### Requirement: The pilot MUST pre-register one immutable 3-by-3 timing plan

The pilot MUST define one versioned plan that fixes the candidate source/snapshot, public task and follow-up hashes, Pack-sourced treatment identity, runner/evaluator/Judge identities, model/environment/budget, claim boundary, and a deterministic schedule containing exactly three attempts for each of `task_start`, `constraint_followup`, and `first_implementation_checkpoint`.

#### Scenario: Complete plan is accepted

- **WHEN** the plan parser receives the declared plan and its canonical hash matches
- **THEN** it MUST expose exactly nine planned attempt slots and the same fixed identities to every slot
- **AND** it MUST record the plan hash as the join key for delivery, evaluation, Judge, cost, and retrospective artifacts.

#### Scenario: Drifted or expanded plan is rejected

- **WHEN** a plan has an identity/hash drift, missing node, extra condition, duplicate slot, or a repetition count other than three per timing node
- **THEN** preflight MUST fail before any Agent or Judge call
- **AND** it MUST emit an auditable invalid-plan state without creating a formal run record.

### Requirement: Preflight MUST prove lifecycle and isolation before execution

Preflight MUST verify the frozen candidate snapshot/lifecycle, treatment/card provenance, prompt/evaluator/Judge identity, environment/model/budget, clean workspace, plan hash, explicit real-provider opt-in, and public/private separation. Private evaluator, oracle, rubric, Pack body, and private runtime material MUST NOT enter the Agent workspace or Judge evidence input.

#### Scenario: Preflight passes

- **WHEN** all declared identity, hash, isolation, and opt-in checks pass
- **THEN** the pilot MAY start an attempt in a fresh workspace and artifact root
- **AND** it MUST persist the preflight identity before the first Agent request.

#### Scenario: Preflight fails

- **WHEN** any identity, lifecycle, isolation, budget, or opt-in check fails
- **THEN** the pilot MUST fail closed without calling the model or writing `results/records/`
- **AND** it MUST preserve the failure reason and plan hash for diagnosis.

### Requirement: Long-running pilot execution MUST be gated by successful reachability and calibration checks

The pilot MUST run a target-model Pi probe, a complete plan dry-run, and the frozen #200 Judge calibration before starting any of the nine long Agent attempts. A failed probe, invalid environment/plan, missing real opt-in, unavailable provider, or unqualified calibration MUST block the long pilot.

#### Scenario: All preflight gates pass

- **WHEN** the `local-pi/v4` identity, target-model probe, plan dry-run, Judge configuration, and qualified calibration all pass
- **THEN** the pilot MUST emit a human-readable preflight summary with the model, Pi, environment, plan, budget, calibration state, and cost estimate
- **AND** only then MAY it start the nine pre-registered Agent slots.

#### Scenario: A preflight gate fails

- **WHEN** the Pi/model probe, plan dry-run, Judge provider check, or calibration fails
- **THEN** the pilot MUST emit a `preflight-blocked` or `invalid-plan` diagnostic state with a redacted reason
- **AND** it MUST NOT start any long Agent attempt, replace a failed slot, or write a formal run record.

### Requirement: The pilot MUST expose a redacted preflight summary before long execution

The preflight summary MUST show the fixed model and version, Pi version, environment identity, plan hash, budget, Judge model/calibration status, and an explicit `allowed_to_start` boolean. It MUST NOT show credentials, raw API keys, private Practice body, Pack private paths, evaluator oracle, or private Judge calibration labels.

#### Scenario: Summary is safe and actionable

- **WHEN** preflight completes successfully or is blocked
- **THEN** the summary MUST distinguish `allowed_to_start=true` from the blocking reason
- **AND** its serialized contents MUST pass public/private leakage checks.

### Requirement: Each planned attempt MUST use one same-session delivery

Each timing attempt MUST reuse the #197 runner semantics, deliver the same fixed Practice card at only its assigned node, and preserve the same Agent session across task start, scripted constraint follow-up, checkpoint stop, and resume. The pilot MUST NOT query, reorder, replace, or re-deliver the Practice based on intermediate output.

#### Scenario: Timing attempt completes

- **WHEN** a planned node reaches its declared delivery boundary and the card/session acknowledgement succeeds
- **THEN** the attempt MUST record delivery status, session binding, treatment version, private provenance, public redacted trace, and terminal execution health
- **AND** no other node may receive a Practice payload in that attempt.

#### Scenario: Delivery or session fails

- **WHEN** the node is unsupported, the payload/hash drifts, acknowledgement is absent, or resume changes the session id
- **THEN** the attempt MUST stop and be marked failed/unsupported/indeterminate and non-comparable
- **AND** it MUST NOT silently move delivery to another node or replace the slot.

### Requirement: Hard and soft outcome channels MUST remain independent

The pilot MUST run #202 deterministic hard evaluation and #200 task-specific Judge through separate, versioned adapters. Judge input MUST be limited to public-safe `replan-evidence/v1` with an opaque blind case id; condition, delivery node, Practice/Pack provenance, session id, private paths, evaluator oracle, and raw tool-result bodies MUST be excluded from the Judge prompt.

#### Scenario: Both channels observe a healthy attempt

- **WHEN** the hard evaluator and blinded Judge each return a structured result
- **THEN** the join MUST report execution health, hard semantic status, Judge state/score, delivery status, and each channel's provenance/usage independently
- **AND** Judge MUST NOT rewrite the hard gate or create a hidden joint score.

#### Scenario: Judge or evaluator is unavailable

- **WHEN** the hard evaluator fails or Judge calibration/scoring is unavailable, indeterminate, or over budget
- **THEN** the pilot MUST preserve that state and its cost/usage evidence
- **AND** it MUST NOT manufacture a score, classify the attempt as a hard pass, or backfill a missing trace.

### Requirement: Results MUST be diagnostic-only and auditable

The pilot MUST retain one auditable record per planned slot, including failed and indeterminate slots, and MUST produce a redacted retrospective that separates observation, uncertainty, cost, and claim boundary. It MUST NOT create a formal record, suite revision, or general/product conclusion.

#### Scenario: Nine slots are fully accounted for

- **WHEN** all planned slots have terminal states and the post-run checks pass
- **THEN** the retrospective MUST state the observed node-specific signals, failures/indeterminate outcomes, cost ledger, limitations, and whether a separate follow-up experiment is justified
- **AND** it MUST explicitly remain bounded to this candidate, treatment, task, model, and nine diagnostic attempts.

#### Scenario: Sample is incomplete or non-comparable

- **WHEN** model access, delivery, evaluator, Judge, budget, or provenance failure prevents a complete comparable matrix
- **THEN** the retrospective MUST label the pilot diagnostic/indeterminate
- **AND** it MUST NOT fill missing slots or promote the result to a timing effect conclusion.