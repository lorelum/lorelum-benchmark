## ADDED Requirements

### Requirement: Staged execution preserves workspace isolation

The system MUST execute exactly two agent stages in the same app workspace, while keeping private evaluator, oracle, scoring configuration, and Stage 2 prompt outside the Stage 1 agent workspace. Stage 2 MUST run as a fresh no-session invocation and MUST NOT receive the Stage 1 conversation transcript. Every condition MUST start from the same Stage 1 public starter and task input.

#### Scenario: Stage 1 cannot observe Stage 2

- **WHEN** the runner materializes the Stage 1 workspace
- **THEN** the workspace contains only the declared Stage 1 public task and starter plus condition-scoped Practice delivery, and contains neither the Stage 2 prompt nor private calibration, evaluator, oracle, scoring, credential, or endpoint material

#### Scenario: Stage 2 reuses the artifact but not the conversation

- **WHEN** Stage 1 succeeds and passes its semantic gate
- **THEN** Stage 2 starts in the same app workspace as a fresh no-session invocation with the Stage 2 prompt and does not receive Stage 1 conversation state

### Requirement: Stage 1 snapshot is immutable and outside the agent input

The runner MUST create a Stage 1 snapshot after Stage 1 execution and before Stage 2. The snapshot MUST record canonical per-file SHA-256 hashes and a canonical tree hash, MUST exclude generated files such as `node_modules/`, `.git/`, logs, and test output, and MUST remain outside the agent workspace. Stage 2 MUST NOT mutate the snapshot. Missing files, invalid hashes, path escapes, or mutation MUST fail execution health rather than being reported as a structural fail.

#### Scenario: Valid snapshot allows Stage 2

- **WHEN** Stage 1 passes its semantic gate and the runner verifies the complete snapshot manifest and tree hash
- **THEN** Stage 2 may start and the snapshot remains available only to private evaluation

#### Scenario: Snapshot mismatch fails closed

- **WHEN** the Stage 1 snapshot is missing, contains a path outside its root, has an invalid hash, or changes during Stage 2
- **THEN** the attempt is recorded as execution unhealthy with a redacted reason and is not counted as a structural pass or fail

### Requirement: Structure observation is deterministic and unweighted

The evaluator MUST derive structure results from TypeScript AST, import graph, executable call/value edges, data flow, and Stage 1 -> Stage 2 diff classification. It MUST NOT infer pass/fail from file names, identifier names, documentation, or a weighted score. Results MUST be reported as per-check `pass`, `fail`, or `indeterminate` plus raw concentration metrics. Ambiguous evidence MUST remain `indeterminate`; documentation-only structure MUST NOT pass.

#### Scenario: Equivalent layout is accepted

- **WHEN** two implementations use different file names or module layouts but preserve the same executable boundaries and diff locality
- **THEN** both receive the same deterministic structure labels

#### Scenario: Ambiguity is not coerced

- **WHEN** the evaluator cannot establish handler, transport, policy, ledger, or executable edges from structural evidence
- **THEN** the affected check returns `indeterminate` with a redacted reason and is not converted to pass or fail

### Requirement: Offline fixture matrix validates each label independently

The private calibration matrix MUST include at least oracle reference, equivalent reference, baseline scatter, anti-pattern, docs-only, public starter, and ambiguous source. Each fixture MUST declare expected labels for semantic health, snapshot behavior, and every deterministic structure check. Calibration MUST compare per-check labels, not an aggregate score. A functional but scattered implementation MUST fail structure checks; an equivalent implementation MUST NOT fail because of naming differences.

#### Scenario: Per-check calibration passes

- **WHEN** the offline matrix runs without a candidate or judge model
- **THEN** every fixture's expected semantic, snapshot, and structure check labels match the observed labels

#### Scenario: Docs-only cannot pass

- **WHEN** the docs-only fixture adds architecture documentation but does not create or maintain the required executable boundaries
- **THEN** its structure result is not a pass

### Requirement: Saturation is explicit and thresholds are frozen

The report MUST preserve planned denominators, evaluated attempts, unhealthy attempts, indeterminate attempts, semantic outcomes, structure outcomes, and raw concentration metrics. If a later authorized model pilot shows that baseline and oracle-practice both almost completely pass Stage 2 structure checks, or oracle-practice does not strictly exceed both controls, the result MUST be recorded as `saturated / no discriminability`. Thresholds and fixtures MUST NOT be changed after observing model output to manufacture separation.

#### Scenario: No discriminability is recorded

- **WHEN** baseline and oracle-practice both reach the pre-registered high-pass region and oracle-practice does not strictly exceed both controls
- **THEN** the conclusion is `saturated / no discriminability`, with no threshold or fixture adjustment

#### Scenario: Uncertainty is not promoted

- **WHEN** an attempt is unhealthy, ambiguous, or outside the indeterminate budget
- **THEN** it remains in the planned denominator and the report remains diagnostic or uncertain rather than directional

### Requirement: No model calls or formal benchmark products in this change

This change MUST NOT call candidate models or judge models, run formal experiments, create formal records, upgrade suite revisions, or modify frozen benchmark history. Offline runner tests MUST use controlled command doubles, and calibration MUST run without real model providers.

#### Scenario: Offline implementation gate

- **WHEN** the change is implemented and validated
- **THEN** candidate model calls and judge model calls are zero, and no formal experiment, formal record, or suite revision exists
