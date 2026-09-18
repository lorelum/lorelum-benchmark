## ADDED Requirements

### Requirement: Evaluator is versioned and bound to the immutable candidate identity

The deterministic evaluator MUST live under `incubator/practice-injection/async-report-lifecycle-v1/private/evaluator/v1/` and MUST bind to candidate id `async-report-lifecycle-v1`, source commit `74962ee0c98f7775b0eb626f7b49b878035d8778`, and candidate snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`. It MUST have its own versioned source snapshot, oracle mapping, and fixture provenance. Changing evaluator behavior, oracle mapping, or fixtures after they have been used for validation MUST create a new evaluator version rather than rewrite v1.

#### Scenario: Candidate identity matches the frozen anchor

- **WHEN** the evaluator starts against a candidate workspace
- **THEN** it validates the candidate id, #196 source commit, and candidate snapshot id before executing any behavior check

#### Scenario: Identity or source snapshot drifts

- **WHEN** the candidate anchor, evaluator manifest, oracle mapping, fixture provenance, or evaluator source hash does not match the versioned evaluator identity
- **THEN** the evaluator returns `indeterminate` and does not execute a passing hard gate

#### Scenario: Evaluator behavior changes after validation

- **WHEN** a maintainer needs to change a check, result meaning, oracle expectation, or fixture
- **THEN** the change creates a new evaluator version and leaves the prior version and identity intact

### Requirement: Semantic checks are deterministic and externally observable

The evaluator MUST verify the public task contract without requiring a specific internal directory, class, function, module count, import graph, or reference implementation. It MUST use the public HTTP endpoints, worker CLI, and persisted JSON behavior to execute the following stable checks: `lifecycle-queued-processing-completed`, `lifecycle-failure-and-retry`, `progress-persistence`, `pause-at-checkpoint`, `resume-preserves-progress`, `v1-v2-overlap-preserves-safe-state`, `rollback-preserves-extension-fields`, `unsafe-state-preserved-and-rejected`, and `concurrent-workers-serialize-progress`. Checks MUST NOT depend on wall-clock delays, randomness, external network, models, or an LLM judge.

#### Scenario: Lifecycle behavior is evaluated

- **WHEN** a report is created and advanced through the documented worker path
- **THEN** queued, processing, completed, and failed outcomes are observable with the persisted progress and stable error behavior declared by the public task

#### Scenario: Pause and resume are checkpoint-bound

- **WHEN** a pause request is made between worker checkpoints and the report is later resumed
- **THEN** the evaluator observes that pause applies at the next checkpoint and that completed progress is retained after resume

#### Scenario: Equivalent implementation keeps entrypoint behavior

- **WHEN** an implementation uses a different internal organization but preserves the public API, worker CLI, and persisted behavior
- **THEN** the same checks pass without source-layout assertions

### Requirement: Compatibility and rollback are hard semantic gates

The evaluator MUST verify that v1 and v2 readers/writers and old/new workers can overlap without silently dropping compatible state, that an application rollback preserves safe extension fields, and that corrupt, missing-required, id-mismatched, or unsupported state is rejected without replacing the original persisted bytes. These checks MUST be part of semantic pass/fail and MUST NOT be delegated to a quality probe or JudgeAgent.

#### Scenario: V1 and V2 participants overlap

- **WHEN** a v2-created report is read and safely written through the v1 path while the extension fields are still compatible
- **THEN** the v2 extension fields remain present and the report remains readable by both API versions

#### Scenario: Application rollback preserves state

- **WHEN** application code falls back to the old path while newer persisted state remains present
- **THEN** the old path either safely preserves or explicitly rejects the state according to the public contract and never silently overwrites it with a lossy state

#### Scenario: Unsafe state fails closed

- **WHEN** a state is corrupt JSON, unsupported schema, missing required fields, or bound to a different report id
- **THEN** the evaluator observes a stable rejection and verifies that the original state bytes are unchanged

### Requirement: Behavior fixtures prove discriminating power

The evaluator MUST use private reference, equivalent, public-starter, and negative/mutation fixtures. The reference and equivalent fixtures MUST pass all nine checks with the same per-check results without sharing a required internal layout. The public-starter fixture MUST miss at least one declared compatibility or rollback check. Each semantic check MUST have at least one negative or mutation fixture that fails that check. Fixture provenance MUST record the #196 base snapshot and SHA-256 for every overlay or changed fixture file.

#### Scenario: Reference and equivalent are accepted

- **WHEN** calibration runs the reference and an independently structured equivalent implementation
- **THEN** both produce `pass` for every semantic check and no check is tied to reference file names or module structure

#### Scenario: Baseline gap is distinguished

- **WHEN** calibration runs the unchanged public starter
- **THEN** the expected lifecycle, progress, pause, and resume checks pass while the declared compatibility or rollback checks fail and the overall result is not `pass`

#### Scenario: A mutation is rejected

- **WHEN** a fixture violates one declared semantic check
- **THEN** at least that stable check id fails and the calibration records the expected mismatch

#### Scenario: Fixtures cannot distinguish a behavior

- **WHEN** no fixture can distinguish a correct implementation from a superficially correct or violating implementation for a check
- **THEN** the candidate remains in `candidate` lifecycle and no model run or promotion is permitted

### Requirement: Evaluation results are machine-readable and fail closed

The evaluator MUST emit JSON with `schema_version`, `evaluator_version`, `candidate_snapshot_id`, `status`, and a `checks` array containing stable check ids, per-check `pass|fail|indeterminate` status, and optional stable reasons. Overall `status` MUST be `pass` only when every required check is `pass`, `fail` when one or more checks are semantically `fail`, and `indeterminate` when identity, fixture, runtime, or output integrity prevents a reliable judgment. The evaluator MUST not produce a weighted score, omit a planned check from the denominator, or convert execution failure into a low score.

#### Scenario: All semantic checks pass

- **WHEN** every required check completes successfully
- **THEN** the result status is `pass`, all check ids are present, and the command exits `0`

#### Scenario: One semantic check fails

- **WHEN** a required check observes a contract violation with a stable reason
- **THEN** the result status is `fail` for that check and overall, and the command exits `1`

#### Scenario: Evaluation cannot be trusted

- **WHEN** the evaluator cannot start, times out, cannot read its identity or fixtures, or produces invalid output
- **THEN** the result is `indeterminate`, the command exits `2`, and the attempt is not counted as `pass` or silently removed

### Requirement: Evaluation is condition-blind and private

The evaluator MUST accept only the candidate workspace and private fixture/evaluator inputs needed to execute the deterministic checks. It MUST NOT receive or inspect timing condition, delivery node, Pack provenance, Practice id, treatment content, Judge rubric, or model output. The same evaluator command MUST be valid for every timing condition. Private oracle assertions, fixture contents, evaluator source, and internal paths MUST remain outside agent workspaces, public traces, and JudgeAgent input. A stable check id and hard-gate status summary MAY be referenced through the private orchestration boundary.

#### Scenario: Timing conditions share one hard gate

- **WHEN** any declared timing condition is evaluated
- **THEN** it uses the same evaluator version, check ids, oracle mapping, fixtures, and condition-free invocation

#### Scenario: Private evaluation material stays private

- **WHEN** an agent workspace, public trace, or JudgeAgent input is inspected
- **THEN** it contains no evaluator source, oracle assertion, reference/equivalent/negative fixture, private path, or hidden scoring detail

#### Scenario: Check ids cross the orchestration boundary

- **WHEN** #200 or #201 needs to reference the hard gate
- **THEN** it may reference stable check ids and aggregate status, but cannot read the private oracle or fixture implementation

### Requirement: The evaluator remains a candidate-only validation artifact

This change MUST NOT register the candidate in an active suite, freeze a task revision, create a formal record, call a model, or alter the public task/starter or #197/#199/#200 artifacts. Validation MUST run without external network or model calls and MUST include deterministic calibration, identity/snapshot verification, public/private leakage audit, `bun run validate`, and `git diff --check`.

#### Scenario: Offline validation succeeds

- **WHEN** the evaluator and calibration commands run in a clean local environment
- **THEN** all deterministic checks complete without a model, external network, formal record, or suite mutation

#### Scenario: Lifecycle boundaries remain intact

- **WHEN** the change is reviewed
- **THEN** the artifact remains under the candidate path, the #196 snapshot identity is unchanged, and no active suite or formal result is created
