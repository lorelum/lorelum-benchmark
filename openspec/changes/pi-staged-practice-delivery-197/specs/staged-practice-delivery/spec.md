## ADDED Requirements

### Requirement: Runner uses one predeclared timing node per attempt

The Pi v2 staged delivery runner MUST declare exactly these timing nodes:
`task_start`, `constraint_followup`, and `first_implementation_checkpoint`. Each
timing attempt MUST assign exactly one of the nodes as its `delivery_node` and
MUST deliver at most one Practice card. The runner MUST NOT infer a node from
wall-clock delay, turn count, token count, workspace file signals, or intent
recognition.

#### Scenario: Valid timing assignment is accepted

- **WHEN** a timing plan declares one of the three nodes and an explicit script/
adapter boundary for it
- **THEN** the runner accepts the attempt before session execution and schedules
exactly one possible Practice delivery

#### Scenario: Repeated or ambiguous assignment is rejected

- **WHEN** an attempt declares multiple delivery nodes, omits its node, reorders
its node declaration, or uses a heuristic boundary
- **THEN** the runner records an invalid-plan or unsupported outcome and performs
no Practice delivery

### Requirement: Delivery preserves one Agent session

The runner MUST create one Agent session per attempt and MUST use that same
session for the initial task, the constraint follow-up, the checkpoint boundary,
and any continuation after delivery. It MUST NOT create a replacement session,
clone the workspace, or add artificial waiting/token padding. A session id
mismatch or unconfirmed continuation MUST stop the attempt.

#### Scenario: Timing conditions use one session

- **WHEN** a timing attempt reaches its assigned delivery node
- **THEN** all start/resume calls and the private audit event use one session id
and the card is delivered exactly once

#### Scenario: Resume identity fails closed

- **WHEN** a continuation returns a different session id or cannot prove it
resumed the original session
- **THEN** the runner records `session-resume` failure and does not perform a
later Practice delivery

### Requirement: Runner consumes one frozen Pack-sourced treatment

Before session execution the runner MUST consume the #199 frozen treatment
through the pack-practice/v1 contract and MUST validate the treatment version,
Pack repository/ref/version/commit, Practice ID, source path, Lore content
digest, source SHA-256, card SHA-256, candidate snapshot, and private plan hash.
The runner MUST NOT call Lore query/get, rerank candidates, replace the payload,
or resolve a different Practice during an attempt.

#### Scenario: Frozen treatment is reused

- **WHEN** the preflight payload passes all identity and byte/hash checks
- **THEN** the assigned node receives the frozen card and the private audit
links it to the frozen Pack provenance

#### Scenario: Treatment drift is detected

- **WHEN** any frozen treatment, candidate, or plan binding differs from the
runtime input
- **THEN** preflight records an explicit failure/indeterminate result and sends
no Practice card to the Agent

### Requirement: Delivery timing uses explicit script boundaries

The runner MUST deliver `task_start` before the first Agent response, MUST
 deliver `constraint_followup` with #196's frozen `public/stage-2/task.md` before
the resumed Agent response, and MUST deliver
`first_implementation_checkpoint` only after the same-session output contains
the complete marker `CHECKPOINT: compatibility-slice-ready`. Checkpoint delivery
MUST happen before the next same-session resume and MUST NOT modify the public task
or add a prompt wrapper.

#### Scenario: Task-start delivery is before response

- **WHEN** the task-start attempt begins
- **THEN** the private card is available to the runtime before the first Agent
response and no earlier Agent response exists

#### Scenario: Constraint follow-up delivery is at the follow-up boundary

- **WHEN** the constraint-followup attempt resumes with the frozen stage-2 task
- **THEN** the card is delivered with the follow-up before the Agent continues,
and the session id remains unchanged

#### Scenario: Checkpoint delivery follows the marker

- **WHEN** the stream-bounded adapter observes the complete checkpoint marker
- **THEN** it stops the current response at that boundary, delivers the card,
and resumes the same session only afterward

### Requirement: Delivery is condition-scoped and isolated

The runner MUST deliver a Practice card only for a declared timing condition at
its assigned node. `baseline` and every undeclared condition MUST receive no
Practice payload. Private evaluator, oracle, calibration, scoring, Pack-wide
material, Practice text, and private paths MUST NOT be copied into the Agent
workspace, prompt-visible files, stdout trace, or public artifacts.

#### Scenario: Baseline remains isolated

- **WHEN** baseline or an undeclared condition reaches any timing node
- **THEN** the runtime returns no Practice payload, records an explicit
`not-declared`/isolation result, and exposes no Practice text or private path

#### Scenario: Declared timing condition receives one card

- **WHEN** a declared timing condition reaches its assigned node
- **THEN** the runtime receives exactly one fixed card payload and no card is
materialized in the Agent workspace

### Requirement: Audit trace proves actual delivery without private leakage

Each attempted delivery MUST produce one structured private JSONL audit event
with attempt/session identity, node, condition, treatment identity, Pack
provenance, Practice/card hashes, acknowledgement, and outcome. The attempt MUST
end with a private summary containing ordered events, session binding, and final
status. Public traces MUST be allowlisted to node, condition, treatment version,
delivery status, and session-binding state, and MUST omit real session ids,
Practice IDs, card hashes, full Pack provenance, roots/store paths, workspace
paths, Practice text, evaluator/oracle/scoring material.

#### Scenario: One event records the actual delivery

- **WHEN** a timing attempt successfully delivers its card at its assigned node
- **THEN** the private sidecar contains one ordered success event with the fixed
session id and card hash, while the public event contains only allowlisted fields

#### Scenario: Public trace is redacted

- **WHEN** the runner serializes a public delivery trace
- **THEN** forbidden identity, body, provenance, path, and private benchmark
markers are absent

### Requirement: Unsupported or failed delivery MUST fail closed

The runner MUST fail closed when a node is unavailable, an acknowledgement is
missing, the card payload is corrupted, a session cannot continue, or isolation
is violated. It MUST record an explicit `failed`, `unsupported`, or
`indeterminate` outcome, preserve prior private events, and MUST NOT silently
move delivery to another node, deliver a fallback card, or claim treatment
exposure.

#### Scenario: Node is unsupported

- **WHEN** the host cannot acknowledge the assigned node before delivery
- **THEN** the runner records `unsupported` or `indeterminate`, sends no card at
another node, and marks the attempt non-comparable

#### Scenario: Delivery failure stops the attempt

- **WHEN** a delivery call fails or its outcome cannot be verified
- **THEN** the runner records the failure and performs no later successful
Practice delivery in that attempt

### Requirement: Contract is verified offline

The change MUST provide deterministic mock/fixture tests for node assignment,
one-card timing, session continuity, fixed identity/hash reuse, stream marker
handling, delivery failure, unsupported and indeterminate outcomes,
baseline/undeclared isolation, and public/private redaction. The tests MUST NOT
call an external model, Lore network, semantic query, or create a formal
benchmark record.

#### Scenario: Mock protocol exercises the complete path

- **WHEN** the contract suite runs with a mock Pi session, stream, and fixed
Treatment fixture
- **THEN** it verifies the selected node, one delivery, same-session identity,
hash consistency, checkpoint ordering, and redacted trace without network/model
calls

#### Scenario: Negative fixtures remain explicit

- **WHEN** a fixture mutates a hash, changes the session id, removes the marker,
requests baseline delivery, or fails a node
- **THEN** the test observes the corresponding fail-closed/isolation outcome and
no later delivery is inferred