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

Preflight MUST verify the frozen candidate snapshot/lifecycle, treatment/card provenance, prompt/evaluator/Judge identity, environment/model/budget, clean workspace, plan hash, and public/private separation. Judge provider/model/credential and explicit real-provider opt-in are required in `judge-scored` mode. In `diagnostic-only` mode, calibration reports, diagnostics sidecars, and attestation credentials are optional annotations: when supplied they MAY be verified, but absence, invalidity, attestation failure, or identity mismatch MUST be recorded as unavailable and MUST NOT block execution. Private evaluator, oracle, rubric, Pack body, and private runtime material MUST NOT enter the Agent workspace or Judge evidence input.

#### Scenario: Preflight passes

- **WHEN** all identity, hash, isolation, and mode-specific opt-in checks pass
- **THEN** the pilot MAY start an attempt in a fresh workspace and artifact root
- **AND** it MUST persist the preflight identity before the first Agent request.

#### Scenario: Preflight fails

- **WHEN** any identity, lifecycle, isolation, budget, or opt-in check required by the selected execution mode fails
- **THEN** the pilot MUST fail closed without starting an Agent attempt or attempt-level Judge call, and without writing `results/records/`
- **AND** it MUST preserve the failure reason and plan hash for diagnosis.

### Requirement: Long-running pilot execution MUST be gated by successful reachability and calibration checks

The `judge-scored` mode MUST run a target-model Pi probe, a complete plan dry-run, and the frozen #200 Judge calibration before starting any of the nine long Agent attempts; only a `qualified` calibration permits Judge scoring. An explicitly selected `diagnostic-only` mode MAY start the nine Agent attempts without qualified calibration only under the separate Diagnostic-only fallback requirement below. All non-Judge execution gates remain mandatory in both modes.

#### Scenario: All preflight gates pass

- **WHEN** the `local-pi/v4` identity, target-model probe, plan dry-run, Judge configuration, and qualified calibration all pass
- **THEN** the pilot MUST emit a human-readable preflight summary with the model, Pi, environment, plan, budget, calibration state, and cost estimate
- **AND** only then MAY it start the nine pre-registered Agent slots.

#### Scenario: A preflight gate fails

- **WHEN** a required non-Judge execution gate fails, or a Judge-scored mode has a failed provider/calibration gate
- **THEN** the pilot MUST emit a `preflight-blocked` or `invalid-plan` diagnostic state with a redacted reason
- **AND** it MUST NOT start any long Agent attempt, replace a failed slot, or write a formal run record.

### Requirement: Diagnostic-only fallback MUST be explicit and non-scoring

A `diagnostic-only` execution MUST be a deliberate operator-selected path, not an automatic fallback from failed Judge calibration. It MUST require all non-Judge execution gates passing and explicit `--run --diagnostic-only --confirm-start`. A complete, attested #200 v1 diagnostic report and matching private sidecar MAY be attached as optional diagnostic context; if absent, invalid, unattested, or mismatched, the run MUST record diagnostics as unavailable without blocking execution. This mode does not require Judge provider credentials, calibration attestation credentials, or `LORELUM_JUDGE_REAL=1`, and MUST issue no calibration or attempt-level Judge requests or use Judge scores in conclusions. The default `judge-scored` mode remains blocked unless calibration is currently `qualified`.

#### Scenario: Operator explicitly starts diagnostic-only pilot

- **WHEN** the operator supplies `--run --diagnostic-only --confirm-start` and all non-Judge gates pass, regardless of whether an optional calibration report/sidecar exists
- **THEN** the pilot MAY start the same nine pre-registered Agent slots and MUST run the deterministic hard evaluator per slot
- **AND** each slot MUST record Judge state `not-run`, reason `judge-scoring-disabled-diagnostic-only`, and `judge_score_usable=false`
- **AND** the run MUST record zero attempt-level Judge calls and MUST make no Judge quality or condition-comparison claim.

#### Scenario: No implicit downgrade or non-Judge preflight failure

- **WHEN** the operator omits any explicit start/mode flag or a non-Judge execution gate fails
- **THEN** the pilot MUST remain blocked without starting Agent attempts; optional Judge diagnostics that are missing or invalid MUST instead be marked unavailable and MUST NOT block
- **AND** it MUST NOT silently switch from Judge-scored to diagnostic-only mode.
### Requirement: The pilot MUST expose a redacted preflight summary before long execution

The preflight summary MUST show the selected execution mode, the fixed model and version, Pi version, environment identity, plan hash, budget, Judge model/calibration status, whether Judge scores are usable, and an explicit `allowed_to_start` boolean. `allowed_to_start=true` MUST be interpreted only with the displayed execution mode. It MUST NOT show credentials, raw API keys, private Practice body, Pack private paths, evaluator oracle, or private Judge calibration labels.

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

#### Scenario: Diagnostic-only execution has no Judge observation

- **WHEN** an attempt runs in explicitly selected diagnostic-only mode
- **THEN** the hard evaluator and execution/delivery observations MUST remain available independently
- **AND** the Judge result MUST be `not-run`, never an inferred pass/fail or synthetic score.
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

### Requirement: Judge failures MUST be diagnosable without changing the frozen Judge contract

The #201 runner MUST preserve per-call structured Judge calibration evidence and all calibration gate comparisons in a host-side private scratch artifact. It MUST NOT change #200 v1 scoring behavior, prompt, rubric, fixture identity, thresholds, call budget, or qualification result.

#### Scenario: Calibration completes or fails

- **WHEN** a calibration scoring call returns a structured result or a safe classified failure
- **THEN** the private diagnostic artifact MUST retain the opaque case identity, local repetition, total and criterion-level points/rationales, confidence, prompt/input hashes, duration, usage, and status for that call
- **AND** it MUST show every threshold predicate with its observed value, frozen threshold, and pass/fail result rather than only the first failed predicate
- **AND** it MUST NOT store credentials, full endpoint, raw prompt, full model response, or unsanitized exception text
- **AND** it MUST NOT add retries or calls beyond the frozen calibration budget.

#### Scenario: Preflight summary references private detail

- **WHEN** real calibration produces diagnostics
- **THEN** the human-readable preflight summary MUST point to the local private diagnostic artifact
- **AND** the summary MUST remain free of private calibration labels and criterion rationales.

#### Scenario: Imported report lacks per-call details

- **WHEN** preflight receives a cached calibration report without its sidecar
- **THEN** the runner MUST mark per-call detail unavailable and MUST NOT infer or fabricate it from aggregate medians.

### Requirement: Judge scoring failures MUST preserve a safe actionable category

The #201 runner MUST retain a non-secret failure category for a Judge scoring request that fails at transport, HTTP, response parsing, structured-output validation, or evidence/provenance validation. It MUST preserve the frozen Judge result and retry semantics.

#### Scenario: A scoring call fails

- **WHEN** an attempt's Judge call fails or its structured output is rejected
- **THEN** the private attempt artifact MUST include the safe stage/category and HTTP status when available
- **AND** it MUST NOT include credentials, endpoint query data, full prompt, full response, or unsanitized exception text.
