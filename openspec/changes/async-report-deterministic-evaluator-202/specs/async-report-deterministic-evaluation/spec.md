## ADDED Requirements

### Requirement: Evaluator is versioned and bound to the immutable candidate identity

The deterministic evaluator MUST live under `incubator/practice-injection/async-report-lifecycle-v1/private/evaluator/v1/` and MUST bind to candidate id `async-report-lifecycle-v1`, source commit `74962ee0c98f7775b0eb626f7b49b878035d8778`, and candidate snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`. It MUST have its own versioned source snapshot, oracle mapping, and fixture provenance. v1 MUST freeze when the #202 PR is merged; changing evaluator behavior, oracle mapping, fixture content, or result meaning after that point MUST create a new evaluator version rather than rewrite v1.

#### Scenario: Candidate identity matches the frozen anchor

- **WHEN** the evaluator starts against a candidate workspace
- **THEN** it validates that its own configuration binds to the candidate id, #196 source commit, and candidate snapshot id before executing any behavior check without requiring the Agent-modified workspace to match the original snapshot

#### Scenario: Identity or source snapshot drifts

- **WHEN** the candidate anchor, evaluator manifest, oracle mapping, fixture provenance, or evaluator source hash does not match the versioned evaluator identity
- **THEN** the evaluator returns `indeterminate` and does not execute a passing hard gate

#### Scenario: Evaluator behavior changes after v1 freeze

- **WHEN** the #202 PR has merged and a maintainer needs to change a check, result meaning, oracle expectation, or fixture
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

The evaluator MUST verify that v1 and v2 readers/writers and old/new workers can overlap without silently dropping compatible state, that an application rollback is data safe, and that corrupt, missing-required, id-mismatched, or unsupported state is rejected without replacing the original persisted bytes. For a safe schema 1/2 state, all unknown top-level fields MUST be preserved by a writer that continues processing. During overlap, v1 MUST continue processing the safe state and preserve those fields. During rollback, v1 MAY continue while preserving the fields or MAY explicitly reject without writing any bytes. These checks MUST be part of semantic pass/fail and MUST NOT be delegated to a quality probe or JudgeAgent.

#### Scenario: V1 and V2 participants overlap

- **WHEN** a v2-created report is read and safely written through the v1 path while the extension fields are still compatible
- **THEN** v1 continues processing, all unknown top-level fields remain present, and the report remains readable by both API versions

#### Scenario: Application rollback is data safe

- **WHEN** application code falls back to the old path while newer persisted state remains present
- **THEN** the old path either continues while preserving extension fields or explicitly rejects the operation with the original bytes unchanged, and never silently overwrites a lossy state

#### Scenario: Unsafe state fails closed

- **WHEN** a state is corrupt JSON, unsupported schema, missing required fields, or bound to a different report id
- **THEN** the evaluator observes a stable rejection and verifies that the original state bytes are unchanged

### Requirement: Behavior fixtures prove discriminating power

The evaluator MUST use private reference, equivalent, public-starter, and negative/mutation fixtures. Fixtures MUST use a layered parent and MAY add only a private whole-file overlay containing changed files. The public starter has no overlay. Reference MUST be a minimal repair of only the declared baseline gaps. Equivalent MUST be an independent correct implementation from the public starter rather than a reshaped copy of reference. Each `negative/<check-id>` MUST inherit reference and add one mutation that breaks only its target check. Reference and equivalent MUST pass all nine checks with the same per-check results without sharing a required internal layout. The public-starter fixture MUST pass the lifecycle, progress, pause, and resume checks and MUST fail both old/new overlap preservation and rollback data safety. Fixture provenance MUST record the #196 source commit, candidate snapshot id, public starter base, parent fixture, overlay files, and SHA-256 for every overlay file.

#### Scenario: Reference and equivalent are accepted

- **WHEN** calibration runs the minimal reference and an independently implemented equivalent
- **THEN** both produce `pass` for every semantic check and no check is tied to reference file names or module structure

#### Scenario: Baseline gap is distinguished

- **WHEN** calibration runs the unchanged public starter
- **THEN** the expected lifecycle, progress, pause, and resume checks pass while the declared compatibility or rollback checks fail and the overall result is not `pass`

#### Scenario: A mutation is rejected

- **WHEN** a negative fixture inherits reference and violates one declared semantic check
- **THEN** the complete nine-check matrix records exactly the target check as `fail` and the other eight checks as `pass`

#### Scenario: Fixture overlays have provenance

- **WHEN** calibration reconstructs a private fixture
- **THEN** it follows the declared parent chain from the immutable #196 public starter and each changed overlay file matches the SHA-256 recorded in the private fixture manifest

#### Scenario: Fixtures cannot distinguish a behavior

- **WHEN** no fixture can distinguish a correct implementation from a superficially correct or violating implementation for a check
- **THEN** the candidate remains in `candidate` lifecycle and no model run or promotion is permitted

### Requirement: Evaluation results are machine-readable and fail closed

The evaluator MUST emit JSON with `schema_version`, `evaluator_version`, `candidate_snapshot_id`, `status`, and a `checks` array containing stable check ids, per-check `pass|fail|indeterminate` status, and optional stable reasons. Overall `status` MUST be `pass` only when every required check is `pass`, `fail` when one or more checks are semantically `fail`, and `indeterminate` when identity, fixture, runtime, or output integrity prevents a reliable judgment. The evaluator MUST not produce a weighted score, omit a planned check from the denominator, or convert execution failure into a low score.

For a declared failure behavior, the evaluator MUST assert an exact error code only when that code is already part of the public starter docs, public tests, or declared public API behavior. It MUST NOT assert summary text or implementation-specific message content. Unpublished exact codes MUST NOT become semantic requirements.

#### Scenario: All semantic checks pass

- **WHEN** every required check completes successfully
- **THEN** the result status is `pass`, all check ids are present, and the command exits `0`

#### Scenario: One semantic check fails

- **WHEN** a required check observes a contract violation with a stable reason
- **THEN** the result status is `fail` for that check and overall, and the command exits `1`

#### Scenario: Evaluation cannot be trusted

- **WHEN** the evaluator cannot start, times out, cannot read its identity or fixtures, or produces invalid output
- **THEN** the result is `indeterminate`, the command exits `2`, and the attempt is not counted as `pass` or silently removed

#### Scenario: Status priority is stable

- **WHEN** checks contain a mix of semantic failures and execution/identity failures
- **THEN** overall status resolves by `indeterminate > fail > pass`, every planned check id remains present, and no failed or indeterminate check is omitted from the result

#### Scenario: Public error code is checked without message coupling

- **WHEN** a check observes a failure behavior whose exact code is publicly declared
- **THEN** the evaluator verifies that code but does not require a specific summary string or log wording

### Requirement: Evaluation is condition-blind and private

The evaluator MUST accept only the candidate workspace and private fixture/evaluator inputs needed to execute the deterministic checks. It MUST NOT receive or inspect timing condition, delivery node, Pack provenance, Practice id, treatment content, Judge rubric, or model output. The same evaluator command MUST be valid for every timing condition. Private oracle assertions, fixture contents, evaluator source, and internal paths MUST remain outside agent workspaces, public traces, and JudgeAgent input. A stable check id and hard-gate status summary MAY be referenced through the private orchestration boundary.

The evaluator MUST be exposed as a private self-contained CLI at `private/evaluator/v1/evaluate.ts <agent-app-root>`. This change MUST NOT add a root package script or modify the #197 runner. #201 MAY retain the complete evaluator result in private artifacts, but #200 MUST receive only evaluator version, overall status, and the check id set.

#### Scenario: Timing conditions share one hard gate

- **WHEN** any declared timing condition is evaluated
- **THEN** it uses the same evaluator version, check ids, oracle mapping, fixtures, and condition-free invocation

#### Scenario: Private evaluation material stays private

- **WHEN** an agent workspace, public trace, or JudgeAgent input is inspected
- **THEN** it contains no evaluator source, oracle assertion, reference/equivalent/negative fixture, private path, or hidden scoring detail

#### Scenario: Check ids cross the orchestration boundary

- **WHEN** #200 or #201 needs to reference the hard gate
- **THEN** #200 may read only evaluator version, overall status, and the stable check id set, while per-check status/reason, private oracle, fixtures, evaluator source, and full evaluator JSON remain inaccessible

#### Scenario: Evaluator is invoked without runner coupling

- **WHEN** #201 later executes the hard gate
- **THEN** it invokes the private evaluator CLI explicitly, without adding a root package command or changing #197 delivery behavior

### Requirement: The evaluator remains a candidate-only validation artifact

This change MUST NOT register the candidate in an active suite, freeze a task revision, create a formal record, call a model, or alter the public task/starter or #197/#199/#200 artifacts. It MUST NOT add a root package script. Validation MUST run without external network or model calls and MUST include deterministic calibration, identity/snapshot verification, public/private leakage audit, `bun run validate`, and `git diff --check`.

#### Scenario: Offline validation succeeds

- **WHEN** the evaluator and calibration commands run in a clean local environment
- **THEN** all deterministic checks complete without a model, external network, formal record, or suite mutation

#### Scenario: Lifecycle boundaries remain intact

- **WHEN** the change is reviewed
- **THEN** the artifact remains under the candidate path, the #196 snapshot identity is unchanged, and no active suite or formal result is created
