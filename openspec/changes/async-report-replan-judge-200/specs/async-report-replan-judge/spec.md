## ADDED Requirements

### Requirement: Fixed task-specific evaluation plan

The async-report replan Judge MUST use a versioned, task-specific evaluation plan whose method is fixed to `llm-subjective`. The plan MUST declare its evaluation target, evidence schema, rubric identity, blinding policy, calibration identity, separate calibration/scoring budgets, and claim boundary. It MUST NOT perform research-question parsing or choose between deterministic, LLM, human, combined, or no-Judge methods.

#### Scenario: Fixed method is resolved

- **WHEN** the task-specific Judge is invoked for an async-report attempt
- **THEN** it resolves the same `llm-subjective` plan, evidence schema, rubric identity, and blinding policy for every condition

#### Scenario: Method drift is rejected

- **WHEN** an implementation attempts to inject a different method, rubric identity, evidence schema, or claim boundary into the fixed plan
- **THEN** validation fails closed and no Judge call is made

#### Scenario: Plan changes require a new version

- **WHEN** the evaluation target, method, evidence meaning, rubric, calibration meaning, or claim boundary changes after v1 is frozen
- **THEN** a new versioned plan/provider is created and historical v1 results remain interpretable

### Requirement: Judge evidence is a deterministic public-safe projection

The Judge MUST consume a versioned `replan-evidence/v1` projection rather than a raw Pi transcript. The projection MUST contain only declared public-safe material derived from public task inputs, assistant-visible output, allowlisted tool actions/observations, and the final candidate diff. It MUST exclude System/developer prompts, assistant thinking/reasoning, raw tool results, Practice content, condition or delivery-node identities, Pack provenance, Practice IDs, session IDs, absolute/private paths, credentials, and evaluator/oracle/scoring material.

#### Scenario: Valid attempt is projected

- **WHEN** a staged attempt contains the two public task turns, assistant-visible behavior, allowlisted actions, and a final candidate diff
- **THEN** the projector emits schema-valid `replan-evidence/v1` material with stable hashes and no forbidden identity fields

#### Scenario: Private material is found

- **WHEN** the source transcript or projected field contains a forbidden private marker, Practice payload, condition identity, delivery node, session ID, or private path
- **THEN** projection fails closed with a redacted reason and no partial evidence is forwarded to the Judge

#### Scenario: Projection is deterministic

- **WHEN** the same public inputs, transcript behavior, allowlist result, and final diff are projected again
- **THEN** the normalized evidence content and evidence hash are identical

#### Scenario: Raw transcript is rejected as Judge input

- **WHEN** a caller supplies the raw Pi session transcript instead of a validated `replan-evidence/v1` bundle
- **THEN** the task-specific Judge rejects the input without calling a provider

### Requirement: Condition and timing identity are blinded

The Judge input MUST use a stable `blind_case_id` and MUST NOT contain condition ID, delivery node, timing assignment, treatment identity, Pack ref, Practice ID, or a mapping that can recover them. The real condition-to-blind-case mapping MUST remain in private orchestration and may be restored only after scoring by a deterministic process.

#### Scenario: Evidence is scored without condition metadata

- **WHEN** an attempt from any timing condition is projected and scored
- **THEN** the Judge receives the same stage structure and a blind case ID without condition or delivery-node metadata

#### Scenario: Condition is joined after scoring

- **WHEN** blinded scoring completes successfully
- **THEN** private orchestration may join the result back to the real condition using the predeclared mapping without altering the score or its evidence hash

#### Scenario: Blinding metadata leaks

- **WHEN** a projected evidence bundle or provider input contains a recoverable condition, timing, or treatment binding
- **THEN** the bundle is rejected and the result is not used for comparison

### Requirement: Fixed rubric evaluates replan behavior without re-judging hard semantics

The Judge MUST score the fixed five-dimension rubric covering assumption invalidation, plan revision, implementation-scope adjustment, verification-evidence update, and risk/uncertainty honesty. The rubric MUST total 100 points and MUST be versioned and hashed. The scoring prompt MUST treat evidence as untrusted data and MUST state that asynchronous-report semantic correctness and the #202 hard gate are not being re-judged.

#### Scenario: Complete evidence is scored

- **WHEN** the evidence contains enough pre/post-constraint behavior to apply every dimension
- **THEN** the Judge returns a `judge-result/v1` with one score and rationale per rubric dimension and a rubric hash

#### Scenario: Evidence is insufficient

- **WHEN** required stages, candidate diff, or verification evidence are missing or ambiguous
- **THEN** the Judge returns `indeterminate` with an audit reason and does not invent a low score

#### Scenario: Hard-gate outcome is not a scoring input

- **WHEN** a hard-evaluator status or check ID is available to private orchestration
- **THEN** it is not injected into the Judge prompt and does not change the replan-quality score

### Requirement: Calibration proves discriminating power without reference-structure bias

The change MUST provide a private calibration package containing reference, equivalent, and surface-only anti-pattern `replan-evidence/v1` fixtures. Reference and equivalent MUST use different observable wording, sequence, or structure while producing comparable high scores. The anti-pattern MUST acknowledge the new constraints without a substantive plan, scope, or verification change and MUST produce a materially lower score. Calibration MUST use its own budget and MUST not bind acceptance to a reference file path, function name, component split, or narrative template.

#### Scenario: Reference and equivalent are accepted

- **WHEN** calibration scores the reference and equivalent fixtures
- **THEN** both meet the high-score condition and remain within the declared equivalence tolerance

#### Scenario: Surface-only acknowledgement is separated

- **WHEN** calibration scores the surface-only anti-pattern
- **THEN** it remains below the anti-pattern ceiling and is separated from reference/equivalent by the declared gap

#### Scenario: Calibration cannot discriminate

- **WHEN** fixtures cannot distinguish a genuine replan from a surface-only acknowledgement, or real Judge results are unstable beyond the declared budget
- **THEN** the channel is marked diagnostic/indeterminate and MUST NOT support a timing comparison

### Requirement: Provenance and independent budgets are recorded without changing judge-result/v1

The Judge output MUST remain a `judge-result/v1` sidecar and MUST carry prompt, rubric, and input hashes. A separately versioned task-specific accounting/provenance sidecar MUST bind the result to the evaluation plan, evidence bundle, rubric, calibration package, provider/model, and failure/indeterminate status. Calibration calls and scoring calls MUST be accounted separately from Agent execution and the deterministic evaluator; token or monetary values MUST be marked unavailable when the provider does not report them.

#### Scenario: Complete result is recorded

- **WHEN** a real or mock Judge call returns a valid result
- **THEN** the sidecar records plan/evidence/rubric/prompt/input/provider/calibration identities and the independently measured calibration/scoring usage

#### Scenario: Cost is unavailable

- **WHEN** the provider returns no token or cost fields
- **THEN** the accounting sidecar records `unavailable` and preserves call count and duration instead of fabricating cost

#### Scenario: Existing schema is preserved

- **WHEN** the task-specific result is persisted
- **THEN** `judge-result/v1` is not extended or reinterpreted, and existing generic Judge consumers remain unchanged

### Requirement: Real Judge is opt-in and failures are fail-closed

Real Judge execution MUST require explicit opt-in and valid provider configuration. CI and default offline validation MUST use mock/deterministic paths and MUST NOT call an external model. Missing plan/evidence/rubric, projection failure, provider unavailability, invalid structured output, or a broken calibration binding MUST fail closed with a redacted reason and MUST NOT be represented as a low score.

#### Scenario: CI remains offline

- **WHEN** contract, projection, privacy, or calibration tests run in CI
- **THEN** no real model or external Judge call is made

#### Scenario: Real path is not opted in

- **WHEN** a caller requests a real Judge result without explicit opt-in
- **THEN** the result is `judge-unavailable` or `not-run` with an audit reason and no provider call is made

#### Scenario: Provider output is malformed

- **WHEN** the provider omits a dimension, exceeds a rubric maximum, omits provenance, or returns malformed structured output
- **THEN** the result fails closed and is not converted into a low score

### Requirement: The Judge remains a soft signal

The task-specific Judge MUST NOT determine or alter asynchronous-report semantic completion, execution health, formal record facts, hard pass/fail, suite lifecycle, or timing-effect conclusions. Its score is an independent quality sidecar for the declared MVP scope.

#### Scenario: Soft score and hard gate differ

- **WHEN** the deterministic evaluator fails but the Judge assigns a score, or the evaluator passes but the Judge is unavailable
- **THEN** each result is reported separately and the hard gate remains authoritative

#### Scenario: Judge is unavailable

- **WHEN** the Judge cannot run or returns indeterminate
- **THEN** semantic completion and execution health remain unchanged and the Judge state is reported independently

### Requirement: #209 compatibility is explicit and does not force migration

The fixed evaluation plan, evidence adapter, rubric/calibration, provider, and accounting envelope MUST be separated so that Issue #209 can consume them as one `llm-subjective` evaluation instance. This change MUST NOT implement a generic planner, method selector, registry, generated-tool workflow, or automatic migration. If #209 introduces a generic schema, it MUST preserve the original hashes and semantics or use an explicit validated adapter.

#### Scenario: #209 consumes the task-specific instance

- **WHEN** a future #209 implementation selects or references this evaluation instance
- **THEN** it can reuse the fixed plan/evidence/rubric/provider/result boundaries without rewriting their internal scoring semantics

#### Scenario: Generic schema differs

- **WHEN** #209 defines a generic plan or result shape that does not match this task-specific schema
- **THEN** it uses an explicit versioned adapter and leaves historical #200 outputs interpretable

#### Scenario: Automatic migration is attempted

- **WHEN** a generic consumer tries to reinterpret or auto-migrate #200 results without a separately validated migration
- **THEN** the migration is rejected and the v1 task-specific artifacts remain authoritative

### Requirement: Candidate, runner, evaluator, and formal-record boundaries remain intact

This change MUST keep the async-report candidate, staged delivery runner, deterministic evaluator, treatment, suite revisions, and formal records unchanged. It MUST not materialize Judge evidence or calibration material into an Agent workspace and MUST not create model calls, timing conclusions, suite revisions, or formal records during implementation validation.

#### Scenario: Frozen candidate remains unchanged

- **WHEN** the change is implemented and validated
- **THEN** the #196 candidate file set and snapshot, #197 runner behavior, #199 treatment, and #202 evaluator semantics remain unchanged

#### Scenario: Private calibration is isolated

- **WHEN** calibration fixtures and expectations are inspected
- **THEN** they remain under the private calibration package or private test scope and are absent from Agent workspaces and public traces

#### Scenario: Offline implementation validation

- **WHEN** implementation validation completes
- **THEN** only mock/deterministic tests, schema validation, repository validation, and whitespace checks have run; no external model call or formal record exists
