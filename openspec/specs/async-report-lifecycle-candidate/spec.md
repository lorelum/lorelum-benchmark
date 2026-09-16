# async-report-lifecycle-candidate Specification

## Purpose
定义异步报表生命周期 candidate 的公开行为和隔离边界：队列、分段进度、暂停检查点、恢复、旧新版本并行与应用回退，作为后续 Practice 时机实验的稳定 starter，不进入 active suite 或正式结果。
## Requirements
### Requirement: Candidate remains isolated from the active suite lifecycle
The async report lifecycle artifact MUST be stored under `incubator/practice-injection/async-report-lifecycle-v1/` with lifecycle `candidate`. It MUST NOT be added to an active suite manifest, frozen task revision, formal experiment plan, or formal result record by this change.

#### Scenario: Candidate is not an active suite task
- **WHEN** the candidate change is validated
- **THEN** the candidate is discoverable only under `incubator/`, no `suites/` task revision or active-suite entry is created, and its lifecycle remains `candidate`

#### Scenario: Candidate validation does not create formal products
- **WHEN** candidate fixtures and focused checks are run
- **THEN** no model call, formal record, suite revision, or benchmark conclusion is created

### Requirement: Public and private inputs are separated
The candidate MUST expose only `public/task.md` and `public/starter/` as Agent starting inputs. Public files MUST describe user-observable product behavior and the staged conversation without containing evaluator code, oracle assertions, scoring configuration, calibration fixtures, or Practice treatment text. Candidate metadata and immutable snapshot material MUST remain private and MUST NOT be copied into an Agent workspace or model input.

#### Scenario: Agent workspace contains only public task inputs
- **WHEN** a clean candidate workspace is materialized
- **THEN** it contains the public task and starter only, and contains no private candidate metadata, evaluator, oracle, calibration, scoring, or Practice material

#### Scenario: Public task does not reveal private acceptance
- **WHEN** the public task and starter are inspected for leakage
- **THEN** they contain the observable report requirements and session flow but no private assertion, reference implementation detail, scoring rule, or Practice wording

### Requirement: Starter exposes the async report lifecycle behavior
The public starter MUST support a realistic async report lifecycle with observable queued, processing, completed, and failed outcomes. Work MUST be processed in segments with persisted progress. Pause MUST take effect only at a declared checkpoint, and resume MUST preserve already persisted progress.

#### Scenario: Report transitions through lifecycle states
- **WHEN** a report is submitted and its worker processes it
- **THEN** the externally observable state can represent queued, processing, completed, and failed outcomes without requiring a specific module layout

#### Scenario: Progress survives interruption and resume
- **WHEN** a worker completes one or more segments, pauses at a checkpoint, and later resumes
- **THEN** the persisted progress remains available, completed segments are not silently reprocessed as new work, and the report can continue from the recorded checkpoint

#### Scenario: Pause is checkpoint-bound
- **WHEN** a pause request arrives between checkpoints
- **THEN** the worker does not claim an immediate arbitrary stop; it applies the pause at the next declared checkpoint and exposes the resulting state

### Requirement: Starter makes compatibility and rollback behavior observable
The candidate task and starter MUST provide enough public context for an implementation to account for old clients and background workers running in parallel with new readers/writers, and for application code to be rolled back without making persisted state unsafe. The requirement MUST be expressed as externally observable compatibility and data-safety behavior, not as a mandated directory, class, identifier, or architecture.

#### Scenario: Old and new participants can overlap
- **WHEN** an old client or background worker operates concurrently with the new application path during a migration window
- **THEN** the persisted report state remains readable and writable according to the declared public contract, or the system returns a defined safe outcome instead of corrupting state

#### Scenario: Application rollback preserves state safety
- **WHEN** application code is rolled back while persisted report state created during the newer path still exists
- **THEN** the old path can safely read, continue, migrate, or explicitly reject the state according to the declared compatibility contract, without silent data loss or corruption

### Requirement: The public session script preserves the replan moment
The candidate MUST define a fixed multi-round public session in which the Agent first inspects the starter and proposes an initial plan, then receives a user follow-up adding old/new parallelism and rollback constraints, and only then continues into implementation and validation. The candidate MUST declare one named `first_implementation_checkpoint` after the follow-up and before full implementation/validation.

#### Scenario: Initial plan precedes the new constraints
- **WHEN** the scripted session starts
- **THEN** the Agent receives the initial task, can inspect the starter and propose a plan, and is not given the later compatibility/rollback facts before the initial response

#### Scenario: Constraint follow-up forces plan review
- **WHEN** the scripted user follow-up is delivered
- **THEN** it adds the old/new parallelism and rollback constraints and requires the Agent to review the initial assumptions before continuing

#### Scenario: Implementation occurs after the checkpoint boundary
- **WHEN** the Agent continues after the follow-up
- **THEN** the session can enter implementation and validation, and the declared `first_implementation_checkpoint` is an auditable event after the follow-up and before the full task is complete

### Requirement: Candidate source identity is immutable and auditable
The candidate MUST record its source repository, immutable source commit, candidate version, lifecycle stage, and a SHA-256 snapshot of the candidate files that define the public task and candidate contract. A later change to task semantics, starter behavior, or candidate metadata MUST create a new candidate revision/snapshot rather than rewrite a snapshot used by a recorded run.

#### Scenario: Snapshot covers the candidate source
- **WHEN** the candidate snapshot is generated
- **THEN** every tracked public task/starter and candidate contract file is listed with its hash, and the recorded source commit identifies the immutable source tree

#### Scenario: Historical candidate identity is not rewritten
- **WHEN** a task, starter, or candidate contract needs to change after it has been used for validation or a run
- **THEN** the change creates a new candidate revision or snapshot and leaves the earlier identity intact

### Requirement: Candidate validation is deterministic and fail closed
The candidate MUST be testable without an LLM or external model. Validation MUST include focused starter behavior checks, snapshot verification, public/private leakage audit, `bun run validate`, and `git diff --check`. If the behavior fixture cannot distinguish a correct, superficially correct, and incorrect implementation, the candidate MUST remain a candidate and MUST NOT advance to #197/#201 execution or a suite revision.

#### Scenario: Offline validation succeeds without model calls
- **WHEN** the candidate validation commands run in a clean environment
- **THEN** the focused checks, snapshot verification, leakage audit, repository validation, and whitespace check complete without invoking a candidate or Judge model

#### Scenario: Indistinguishable behavior blocks promotion
- **WHEN** calibration or review shows that the public behavior cannot distinguish correct, superficial, and incorrect implementations
- **THEN** the candidate remains in `candidate` lifecycle, the limitation is recorded, and no timing experiment or suite promotion is permitted
