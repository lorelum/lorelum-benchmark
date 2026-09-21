## ADDED Requirements

### Requirement: Fixed task-specific replan Judge

The async-report Judge MUST use a versioned task-specific `llm-subjective` plan and provider named `judge-agent/async-report-replan/v1`. It MUST evaluate post-constraint replan quality only, MUST NOT choose an evaluation method, and MUST NOT change existing generic Judge provider behavior.

#### Scenario: Provider resolves the fixed instance

- **WHEN** a valid async-report Judge request is created
- **THEN** it resolves the fixed plan, evidence schema, rubric, calibration identity, and claim boundary for this task

#### Scenario: Generic migration is not implicit

- **WHEN** a caller requests a generic evaluation plan or automatic migration of a historical result
- **THEN** the task provider rejects the request and leaves existing generic providers and historical results unchanged

### Requirement: Deterministic public-safe evidence projection

The Judge MUST consume a schema-validated `replan-evidence/v1` projection rather than a raw Pi transcript. The projection MUST contain public task-turn hashes, visible assistant text, allowlisted tool metadata, safe test/typecheck summaries, a blind case ID, and the final candidate diff/hash. The projector MUST discard thinking/reasoning and raw tool-result bodies before output, and MUST exclude System/developer prompts, Practice/Pack identity, condition/timing identity, session IDs, private/absolute paths, secrets, evaluator/oracle/scoring content, and calibration expectations.

#### Scenario: Complete attempt projects successfully

- **WHEN** a private attempt contains the two public task turns, visible assistant messages, allowlisted tools, safe verification observations, and a final diff
- **THEN** the projector emits deterministic `replan-evidence/v1` with stable hashes and no forbidden fields

#### Scenario: Raw transcript is not accepted

- **WHEN** a caller supplies a raw transcript as Judge material instead of a validated evidence projection
- **THEN** the request fails closed before any provider call

#### Scenario: Forbidden material is detected

- **WHEN** projection sees a private marker, absolute path, Practice/Pack identifier, condition/timing field, secret, or System/developer content in retained input
- **THEN** it returns a redacted failure/indeterminate reason and forwards no partial evidence

#### Scenario: Evidence limits are exceeded

- **WHEN** assistant text exceeds 8,000 characters per stage, tool metadata exceeds 20,000 characters, verification summaries exceed 10,000 characters, or the final diff exceeds 120,000 characters
- **THEN** the attempt is `indeterminate` and is not truncated into a score

### Requirement: Tool evidence is allowlisted and normalized

The projector MUST allow only `read`, `ls`, `grep`, `edit`, and `bash` tool actions. It MUST emit normalized relative paths or command categories, stage, order, and success/failure. It MAY include at most 2,000 characters of sanitized output only for recognized test/typecheck commands; raw command output MUST NOT be forwarded.

#### Scenario: Safe tool metadata is retained

- **WHEN** an allowlisted tool call has a valid relative path or recognized command category and a matching execution result
- **THEN** the evidence contains the normalized metadata and status without raw output

Recognized verification commands MUST use an explicit allowlisted executable/script form without shell control syntax, and a verification summary MUST come from a matching execution-end/result event. A direct tool-action summary or a shell wrapper such as `echo bun test` MUST NOT become verification evidence.

The projector MUST issue an in-process provenance handle for the evidence and task-specific Judge input. The provider MUST reject an otherwise schema-valid evidence/input object that did not cross that projector-owned boundary.

#### Scenario: Unknown tool shape fails closed

- **WHEN** a tool call is not allowlisted, has an absolute/escaping path, or cannot be associated with a safe status
- **THEN** projection returns `indeterminate` without invoking the Judge

### Requirement: Condition and delivery timing are blinded

The Judge input MUST use an opaque `blind_case_id` and MUST NOT contain condition ID, delivery node, timing assignment, treatment identity, Pack ref, Practice ID, or a recoverable mapping. The condition mapping remains outside #200 and MAY be restored by #201 only after scoring.

#### Scenario: Timing attempts share one input shape

- **WHEN** attempts from different timing conditions are projected
- **THEN** each uses the same evidence schema and stage structure without exposing the timing assignment

#### Scenario: Post-score join remains external

- **WHEN** a valid Judge result is produced
- **THEN** #200 stores only the blind-case identity and #201 may perform the later private condition join

### Requirement: Fixed five-dimension replan rubric

The provider MUST score exactly these 100 points: `assumption-invalidation` 20, `plan-revision` 20, `implementation-scope-adjustment` 25, `verification-evidence-update` 20, and `risk-and-uncertainty-honesty` 15. The scoring denominator MUST be attempts that are execution-healthy and evidence-complete; incomplete evidence is `indeterminate` and is not scored. The scoring prompt MUST treat evidence as untrusted data and MUST state that #202 semantic correctness is outside the Judge target.

#### Scenario: Complete evidence receives structured scoring

- **WHEN** an execution-healthy attempt has complete evidence
- **THEN** the provider returns `judge-result/v1` with every rubric dimension exactly once, valid points, rationale, confidence, and provenance hashes

#### Scenario: Hard semantic failure does not suppress soft scoring

- **WHEN** an execution-healthy attempt has complete evidence but its independent hard evaluator later fails
- **THEN** #200 still scores the evidence without reading or using the hard result

#### Scenario: Incomplete evidence is not partially scored

- **WHEN** required stage, tool, verification, or diff evidence is missing
- **THEN** the provider returns `indeterminate` with a reason and no fabricated low score

### Requirement: Two-layer calibration is required

The change MUST provide offline projection contract tests and a separate real-Judge scoring calibration. Projection tests MUST cover stage extraction, visible-text selection, private-marker rejection, tool normalization, stable hashes, limits, and incomplete evidence without calling a model. Scoring calibration MUST use private reference, equivalent, and surface-only anti-pattern evidence fixtures under the versioned Judge module private subtree.

#### Scenario: Projection contract passes offline

- **WHEN** synthetic raw transcripts cover valid, private, malformed, over-limit, and unknown-tool cases
- **THEN** deterministic tests classify valid projections and fail-closed cases without a model call

#### Scenario: Reference and equivalent calibrate together

- **WHEN** each of reference and equivalent is scored three times
- **THEN** the reference median is at least 75 and the equivalent median differs from the reference by at most 10

#### Scenario: Anti-pattern is separated

- **WHEN** the surface-only anti-pattern is scored three times
- **THEN** its median is at most 60 and reference exceeds it by at least 15 points

#### Scenario: Calibration fails closed

- **WHEN** calibration exceeds nine real calls, fails a threshold, or cannot establish discrimination
- **THEN** the Judge channel is diagnostic/indeterminate and MUST NOT support a timing-direction conclusion

Calibration qualification MUST bind the fixed provider id/version and model identity used by the scoring attempt. A report produced for a different provider/model scope MUST be diagnostic/indeterminate.

Real calibration qualification MUST also verify an HMAC attestation using `LORELUM_JUDGE_CALIBRATION_KEY`; missing or mismatched key material MUST be diagnostic/indeterminate. The offline mock key MUST NOT authorize real scoring.

### Requirement: Accounting is versioned and independent from hard evaluation

The provider MUST preserve `judge-result/v1` unchanged and MUST emit a separate `async-report-replan-judge-accounting/v1` sidecar containing plan/evidence/rubric/prompt/input/provider/model/calibration identities, blind-case identity, call count, duration, usage when reported, explicit `unavailable` usage otherwise, state, and failure reason. It MUST NOT contain #202 evaluator identity/status/checks, condition, delivery node, Pack/Practice identity, session ID, or private oracle/evaluator/scoring content.

#### Scenario: Complete accounting is recorded

- **WHEN** a mock or real task-specific provider returns a valid Judge result
- **THEN** the accounting sidecar binds all task-specific hashes and records the one scoring call and duration

#### Scenario: Provider does not report usage

- **WHEN** token or cost fields are absent from the provider response
- **THEN** accounting records `unavailable` and does not fabricate token/cost values

#### Scenario: Shared provider contract remains unchanged

- **WHEN** the task-specific provider captures usage
- **THEN** shared `JudgeCompletion`, generic providers, `judge-result/v1`, and historical consumers remain unchanged

### Requirement: Real Judge is opt-in and failures are fail-closed

Real scoring and calibration MUST require `LORELUM_JUDGE_REAL=1` and valid Judge configuration. Offline tests MUST use mocks or deterministic stubs. Provider unavailability, invalid structured output, missing rubric/evidence, and missing opt-in MUST become `judge-unavailable`, `not-run`, or `indeterminate` with a reason and MUST NOT become a low score.

#### Scenario: Offline tests do not call a model

- **WHEN** CI runs projection, rubric, provider, privacy, and calibration tests
- **THEN** no external model call is made

#### Scenario: Missing opt-in fails closed

- **WHEN** a real task-specific score is requested without explicit opt-in
- **THEN** no provider call is made and the result records `judge-unavailable` or `not-run` with a reason

#### Scenario: Malformed output fails closed

- **WHEN** a provider omits a rubric dimension, exceeds a maximum, or returns invalid JSON
- **THEN** the result is unavailable/indeterminate with a reason and score zero without criteria

### Requirement: Judge remains an independent soft signal

The task-specific Judge MUST NOT determine semantic completion, execution health, formal record facts, suite lifecycle, hard pass/fail, or timing-effect conclusions. It MUST score only execution-healthy, evidence-complete attempts; other attempts remain in the diagnostic denominator as `indeterminate` or execution failure outside the Judge score.

#### Scenario: Judge and hard outcome differ

- **WHEN** an attempt later has a hard semantic pass or fail independent of the Judge result
- **THEN** the Judge result remains an independent soft sidecar and does not alter the hard outcome

#### Scenario: Provider is unavailable

- **WHEN** the Judge is unavailable or calibration is not qualified
- **THEN** #200 reports the unavailable/diagnostic state and does not create a timing conclusion

### Requirement: Explicit #209 adapter boundary

The implementation MUST expose the fixed plan, evidence adapter, rubric/calibration identity, provider, and accounting sidecar as one task-specific evaluation instance. #209 MAY consume this instance through an explicit adapter, but MUST NOT require automatic migration, rewrite scoring semantics, or promote the rubric to a universal contract.

#### Scenario: Future adapter consumes v1

- **WHEN** #209 selects this async-report evaluation method
- **THEN** it can invoke the fixed evidence/provider boundary while preserving all original hashes and soft-signal semantics

#### Scenario: Historical result remains stable

- **WHEN** a future generic plan or provider is introduced
- **THEN** existing #200 v1 results remain interpretable and are not silently migrated

### Requirement: Frozen candidate and lifecycle boundaries remain intact

This change MUST NOT modify the #196 candidate snapshot, #197 runner, #199 treatment, #202 evaluator, active suite, formal record, or Agent workspace. Private calibration assets MUST remain outside Agent workspaces, public traces, and Judge input.

#### Scenario: Frozen dependencies are unchanged

- **WHEN** #200 implementation validation completes
- **THEN** #196, #197, #199, and #202 artifacts remain unchanged and no suite or formal record is created

#### Scenario: Private calibration remains isolated

- **WHEN** calibration assets and accounting outputs are inspected
- **THEN** they remain under the task-specific private boundary and are absent from Agent workspace and Judge input
